import type { Prisma, PrismaClient } from "@prisma/client";

import prisma from "../db.server";
import { descendantFilterIds, readParentValues } from "../filter-hierarchy";

/** Keys are Filter IDs; values are FilterOption IDs from that filter. */
export type FilterSelections = Readonly<Record<string, readonly string[]>>;

export type FilterEngineInput = {
  /** Always obtain the shop from the authenticated server context. */
  shop: string;
  filterSetId: string;
  selections?: FilterSelections;
  page?: number;
  pageSize?: number;
};

export class FilterEngineError extends Error {
  constructor(
    message: string,
    public readonly code:
      "FILTER_SET_NOT_FOUND" | "INVALID_SELECTION" | "INVALID_PAGINATION",
  ) {
    super(message);
    this.name = "FilterEngineError";
  }
}

type Selection = [filterId: string, optionIds: string[]];

function articleWhere(
  filterSetId: string,
  selections: Selection[],
  now: Date,
  excludedFilterId?: string,
): Prisma.ArticleWhereInput {
  return {
    filterSetId,
    // Drafts and scheduled articles must not contribute to results or counts.
    publishedAt: { lte: now },
    AND: selections
      .filter(([filterId]) => filterId !== excludedFilterId)
      .map(([, optionIds]) => ({
        options: { some: { filterOptionId: { in: optionIds } } },
      })),
  };
}

/**
 * AND across filters, OR within each filter. Option counts apply all selections
 * except the option's own filter, so another value in that filter stays usable.
 * Reads run in one transaction; article pagination never affects option counts.
 */
export async function getFilteredArticles(
  {
    shop,
    filterSetId,
    selections = {},
    page = 1,
    pageSize = 24,
  }: FilterEngineInput,
  db: PrismaClient = prisma,
) {
  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isSafeInteger(skip)
  ) {
    throw new FilterEngineError(
      "La página debe ser positiva y el tamaño de página debe estar entre 1 y 100.",
      "INVALID_PAGINATION",
    );
  }

  if (!shop?.trim() || !filterSetId?.trim()) {
    throw new FilterEngineError(
      "No se encontró el conjunto de filtros.",
      "FILTER_SET_NOT_FOUND",
    );
  }

  if (
    selections === null ||
    typeof selections !== "object" ||
    Array.isArray(selections)
  ) {
    throw new FilterEngineError(
      "La selección debe asociar cada filtro con una lista de opciones.",
      "INVALID_SELECTION",
    );
  }

  return db.$transaction(
    async (tx) => {
      const filterSet = await tx.filterSet.findFirst({
        where: { id: filterSetId, shop },
        include: {
          filters: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            include: {
              options: { orderBy: [{ position: "asc" }, { id: "asc" }] },
            },
          },
        },
      });

      if (!filterSet) {
        throw new FilterEngineError(
          "No se encontró el conjunto de filtros.",
          "FILTER_SET_NOT_FOUND",
        );
      }

      const filtersById = new Map(
        filterSet.filters.map((filter) => [filter.id, filter]),
      );
      const normalized: Selection[] = [];

      for (const [filterId, optionIds] of Object.entries(selections)) {
        const filter = filtersById.get(filterId);
        const allowedIds = new Set(filter?.options.map((option) => option.id));

        if (
          !filter ||
          !Array.isArray(optionIds) ||
          optionIds.some(
            (optionId) =>
              typeof optionId !== "string" || !allowedIds.has(optionId),
          )
        ) {
          throw new FilterEngineError(
            "La selección contiene filtros u opciones que no pertenecen al conjunto.",
            "INVALID_SELECTION",
          );
        }

        if (optionIds.length > 0) {
          normalized.push([filterId, [...new Set(optionIds)]]);
        }
      }

      const now = new Date();
      const active = new Map<string, boolean>();
      const byKey = new Map(
        filterSet.filters.map((filter) => [filter.key, filter]),
      );
      const isActive = (filter: (typeof filterSet.filters)[number]) => {
        if (!filter.parentKey) return true;
        const parent = byKey.get(filter.parentKey);
        const values = readParentValues(filter.parentValues);
        const selected =
          normalized.find(([id]) => id === parent?.id)?.[1] ?? [];
        return Boolean(
          parent &&
          active.get(parent.id) &&
          parent.options.some(
            (option) =>
              selected.includes(option.id) && values.includes(option.value),
          ),
        );
      };
      const removeSelection = (id: string) => {
        const index = normalized.findIndex(([filterId]) => filterId === id);
        if (index !== -1) normalized.splice(index, 1);
      };
      for (const filter of filterSet.filters) {
        const visible = isActive(filter);
        active.set(filter.id, visible);
        if (!visible) removeSelection(filter.id);
      }
      const filters = [];

      for (const filter of filterSet.filters) {
        const visible = isActive(filter);
        active.set(filter.id, visible);
        if (!visible) removeSelection(filter.id);
        const descendants = descendantFilterIds(filterSet.filters, filter.id);
        const counts = await tx.articleOption.groupBy({
          by: ["filterOptionId"],
          where: {
            filterSetId,
            option: { filterId: filter.id },
            article: articleWhere(
              filterSetId,
              normalized.filter(([id]) => !descendants.has(id)),
              now,
              filter.id,
            ),
          },
          _count: { _all: true },
        });
        const countsById = new Map(
          counts.map((count) => [count.filterOptionId, count._count._all]),
        );
        const selection = normalized.find(([id]) => id === filter.id);
        if (filter.parentKey && selection) {
          selection[1] = selection[1].filter(
            (id) => (countsById.get(id) ?? 0) > 0,
          );
          if (!selection[1].length) removeSelection(filter.id);
        }
        const selectedIds = new Set(
          normalized.find(([id]) => id === filter.id)?.[1] ?? [],
        );

        filters.push({
          id: filter.id,
          key: filter.key,
          label: filter.label,
          position: filter.position,
          visible,
          parentFilterId: byKey.get(filter.parentKey ?? "")?.id ?? null,
          parentKey: filter.parentKey,
          options: filter.options.map((option) => {
            const count = countsById.get(option.id) ?? 0;

            return {
              id: option.id,
              value: option.value,
              label: option.label,
              position: option.position,
              count,
              available: count > 0,
              selected: selectedIds.has(option.id),
            };
          }),
        });
      }

      const where = articleWhere(filterSetId, normalized, now);
      const total = await tx.article.count({ where });
      const articles = await tx.article.findMany({
        where,
        select: {
          id: true,
          shopifyArticleId: true,
          title: true,
          handle: true,
          publishedAt: true,
          imageUrl: true,
          imageAlt: true,
        },
        orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
        skip,
        take: pageSize,
      });

      return {
        filterSet: {
          id: filterSet.id,
          blogId: filterSet.blogId,
          name: filterSet.name,
        },
        selections: Object.fromEntries(normalized),
        articles,
        filters,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    },
    { timeout: 20_000 },
  );
}
