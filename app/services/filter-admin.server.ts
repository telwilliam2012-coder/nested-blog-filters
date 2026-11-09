import type { PrismaClient } from "@prisma/client";
import type { AppPlanAccess } from "../billing-plans";
import prisma from "../db.server";
import { filterKeyError, normalizeFilterKey } from "../filter-key";
import { matchingTagValues } from "../filter-hierarchy";
import { AdminInputError, requireRevision } from "./admin-errors.server";
import {
  ensureFilterDefinitions,
  requireShopifyBlog,
  type ContentAdmin,
} from "./shopify-content.server";

export type OptionDraft = { id?: string; value: string; label: string };
export type FilterDraft = {
  id?: string;
  key: string;
  label: string;
  source?: "metafield" | "tag";
  parentKey?: string | null;
  parentValues?: string[];
  options: OptionDraft[];
};
export type FilterSetDraft = {
  name: string;
  blogId: string;
  revision: number;
  filters: FilterDraft[];
};

export const filterSetInclude = {
  filters: {
    orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
    include: {
      options: {
        orderBy: [{ position: "asc" as const }, { id: "asc" as const }],
        include: { _count: { select: { articles: true } } },
      },
    },
  },
  sync: true,
};

export async function getFilterSet(
  shop: string,
  id: string,
  db: PrismaClient = prisma,
) {
  const set = await db.filterSet.findFirst({
    where: { id, shop },
    include: filterSetInclude,
  });
  if (!set)
    throw new AdminInputError(
      "No se encontró el conjunto en esta tienda.",
      404,
    );
  return set;
}

export async function getFilterPlanUsage(
  shop: string,
  planAccess: AppPlanAccess,
  db: PrismaClient = prisma,
) {
  const [filterSetCount, activeSets] = await Promise.all([
    db.filterSet.count({ where: { shop } }),
    planAccess.maxBlogs === null
      ? null
      : db.filterSet.findMany({
          where: { shop },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take: planAccess.maxBlogs,
          select: { id: true },
        }),
  ]);
  return {
    filterSetCount,
    canCreate:
      planAccess.maxBlogs === null || filterSetCount < planAccess.maxBlogs,
    overBlogLimit:
      planAccess.maxBlogs !== null && filterSetCount > planAccess.maxBlogs,
    activeFilterSetIds: activeSets?.map((set) => set.id) ?? null,
  };
}

function blogPlanLimit() {
  return new AdminInputError(
    "Tu plan permite configurar un blog. Cambia a Premium para añadir más blogs.",
    403,
  );
}

function text(value: unknown, label: string, max = 100) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.trim().length > max ||
    /[\r\n]/.test(value) ||
    value.includes("\0")
  ) {
    throw new AdminInputError(
      `${label}: introduce un texto de entre 1 y ${max} caracteres.`,
    );
  }
  return value.trim();
}
function identifier(value: unknown) {
  if (value === undefined) return undefined;
  return text(value, "Identificador", 100);
}
function unique(values: Array<string | undefined>, label: string) {
  const defined = values.filter((value) => value !== undefined);
  if (new Set(defined).size !== defined.length)
    throw new AdminInputError(`${label}: hay valores duplicados.`);
}

export function parseFilterDraft(input: unknown): FilterSetDraft {
  if (
    !input ||
    typeof input !== "object" ||
    JSON.stringify(input).length > 200_000
  )
    throw new AdminInputError(
      "La configuración no es válida o es demasiado grande.",
    );
  const raw = input as Record<string, unknown>;
  if (
    !Array.isArray(raw.filters) ||
    raw.filters.length < 1 ||
    raw.filters.length > 10
  )
    throw new AdminInputError("Añade entre 1 y 10 filtros.");
  const filters = raw.filters.map((item, index): FilterDraft => {
    if (!item || typeof item !== "object")
      throw new AdminInputError("El filtro no es válido.");
    const id = identifier(item.id);
    const rawKey = text(item.key, `Identificador del filtro ${index + 1}`, 40);
    const key = id ? rawKey : normalizeFilterKey(rawKey);
    const keyError = filterKeyError(key);
    if (keyError) throw new AdminInputError(`Filtro ${index + 1}: ${keyError}`);
    if (!Array.isArray(item.options) || item.options.length > 200)
      throw new AdminInputError("Cada filtro admite hasta 200 opciones.");
    const options = item.options.map((option: OptionDraft) => {
      if (!option || typeof option !== "object")
        throw new AdminInputError("La opción no es válida.");
      return {
        id: identifier(option.id),
        value: text(option.value, "Valor de la opción", 255),
        label: text(option.label, "Etiqueta de la opción"),
      };
    });
    unique(
      options.map((option: OptionDraft) => option.id),
      "Opciones",
    );
    unique(
      options.map((option: OptionDraft) => option.value),
      "Opciones",
    );
    const source = item.source ?? "metafield";
    if (source !== "metafield" && source !== "tag")
      throw new AdminInputError("El origen del filtro no es válido.");
    const parentKey = item.parentKey
      ? text(item.parentKey, "Filtro anterior", 40)
      : null;
    const parentValues = item.parentValues ?? [];
    if (
      !Array.isArray(parentValues) ||
      parentValues.length > 200 ||
      parentValues.some((value: unknown) => typeof value !== "string")
    )
      throw new AdminInputError(
        "Las opciones que activan el filtro no son válidas.",
      );
    return {
      id,
      key,
      label: text(item.label, "Etiqueta del filtro"),
      source,
      parentKey,
      parentValues: [...new Set(parentValues as string[])],
      options,
    };
  });
  unique(
    filters.map((filter) => filter.id),
    "Filtros",
  );
  unique(
    filters.map((filter) => filter.key),
    "Identificadores de filtros",
  );
  for (const [index, filter] of filters.entries()) {
    const parent = filters
      .slice(0, index)
      .find((candidate) => candidate.key === filter.parentKey);
    if (
      filter.parentKey &&
      (!parent ||
        !filter.parentValues?.length ||
        filter.parentValues.some(
          (value) => !parent.options.some((option) => option.value === value),
        ))
    )
      throw new AdminInputError(
        "Cada filtro dependiente debe elegir un filtro anterior y al menos una de sus opciones. Revisa el orden y las condiciones.",
      );
    if (!filter.parentKey && filter.parentValues?.length)
      throw new AdminInputError(
        "Selecciona el filtro anterior de la condición.",
      );
  }
  return {
    name: text(raw.name, "Nombre del conjunto"),
    blogId: text(raw.blogId, "Blog"),
    revision: requireRevision(raw.revision),
    filters,
  };
}

export async function saveFilterSet(
  admin: ContentAdmin,
  shop: string,
  id: string | null,
  input: unknown,
  planAccess: AppPlanAccess,
  db: PrismaClient = prisma,
) {
  if (!planAccess)
    throw new AdminInputError(
      "No se pudo verificar el plan de la tienda.",
      403,
    );
  const draft = parseFilterDraft(input);
  const existing = id ? await getFilterSet(shop, id, db) : null;
  const allowedFilterCount = Math.max(
    planAccess.maxFilters,
    existing?.filters.length ?? 0,
  );
  if (draft.filters.length > allowedFilterCount)
    throw new AdminInputError(
      "Tu plan permite hasta 3 filtros por blog. Cambia a Premium para añadir más filtros.",
      403,
    );
  if (
    !existing &&
    planAccess.maxBlogs !== null &&
    (await db.filterSet.count({ where: { shop } })) >= planAccess.maxBlogs
  )
    throw blogPlanLimit();
  if (existing && (existing.revision !== draft.revision || existing.sync))
    throw new AdminInputError(
      "El conjunto cambió o tiene una importación en curso. Recarga la página.",
      409,
    );
  if (existing && draft.blogId !== existing.blogId)
    throw new AdminInputError(
      "No se puede cambiar el blog de un conjunto guardado.",
    );
  for (const filter of draft.filters) {
    const old = existing?.filters.find((item) => item.id === filter.id);
    if (filter.id && (!old || old.key !== filter.key))
      throw new AdminInputError(
        "No se puede cambiar la clave o reutilizar un filtro de otro conjunto.",
      );
    for (const option of filter.options) {
      if (
        option.id &&
        !old?.options.some(
          (item) => item.id === option.id && item.value === option.value,
        )
      )
        throw new AdminInputError(
          "No se puede cambiar el valor guardado o reutilizar una opción ajena.",
        );
    }
  }
  await requireShopifyBlog(admin, draft.blogId);
  await ensureFilterDefinitions(
    admin,
    draft.filters
      .filter((filter) => filter.source !== "tag")
      .map((filter) => ({ ...filter, id: filter.id ?? "" })),
  );

  // Serializable predicate reads prevent two simultaneous creates for different
  // blogs from both consuming the last available slot for this shop.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          let filterSetId: string;
          if (existing) {
            const changed = await tx.filterSet.updateMany({
              where: {
                id: existing.id,
                shop,
                revision: draft.revision,
                sync: { is: null },
              },
              data: { name: draft.name, revision: { increment: 1 } },
            });
            if (changed.count !== 1)
              throw new AdminInputError(
                "El conjunto cambió mientras guardabas. Recarga y revisa los cambios.",
                409,
              );
            const current = await tx.filterSet.findUniqueOrThrow({
              where: { id: existing.id },
              include: filterSetInclude,
            });
            for (const old of current.filters) {
              const next = draft.filters.find((item) => item.id === old.id);
              const removed = old.options.filter(
                (option) =>
                  !next?.options.some((item) => item.id === option.id),
              );
              if (removed.some((option) => option._count.articles > 0))
                throw new AdminInputError(
                  "Quita las asignaciones de los artículos antes de eliminar filtros u opciones que estén en uso.",
                  409,
                );
              if (!next) await tx.filter.delete({ where: { id: old.id } });
              else if (removed.length)
                await tx.filterOption.deleteMany({
                  where: {
                    filterId: old.id,
                    id: { in: removed.map((option) => option.id) },
                  },
                });
            }
            filterSetId = existing.id;
          } else {
            if (
              planAccess.maxBlogs !== null &&
              (await tx.filterSet.count({ where: { shop } })) >=
                planAccess.maxBlogs
            )
              throw blogPlanLimit();
            filterSetId = (
              await tx.filterSet.create({
                data: { shop, blogId: draft.blogId, name: draft.name },
              })
            ).id;
          }
          for (const [position, filter] of draft.filters.entries()) {
            const saved = filter.id
              ? await tx.filter.update({
                  where: { id: filter.id },
                  data: {
                    label: filter.label,
                    position,
                    source: filter.source,
                    parentKey: filter.parentKey,
                    parentValues: JSON.stringify(filter.parentValues),
                  },
                })
              : await tx.filter.create({
                  data: {
                    filterSetId,
                    key: filter.key,
                    label: filter.label,
                    position,
                    source: filter.source,
                    parentKey: filter.parentKey,
                    parentValues: JSON.stringify(filter.parentValues),
                  },
                });
            for (const [optionPosition, option] of filter.options.entries()) {
              if (option.id)
                await tx.filterOption.update({
                  where: { id: option.id },
                  data: { label: option.label, position: optionPosition },
                });
              else
                await tx.filterOption.create({
                  data: {
                    filterSetId,
                    filterId: saved.id,
                    value: option.value,
                    label: option.label,
                    position: optionPosition,
                  },
                });
            }
            if (filter.source === "tag") {
              const options = await tx.filterOption.findMany({
                where: { filterId: saved.id },
              });
              await tx.articleOption.deleteMany({
                where: { filterSetId, option: { filterId: saved.id } },
              });
              const articles = await tx.article.findMany({
                where: { filterSetId },
                select: { id: true, tags: true },
              });
              for (const article of articles) {
                const values = new Set(
                  matchingTagValues(JSON.parse(article.tags), options),
                );
                const data = options
                  .filter((option) => values.has(option.value))
                  .map((option) => ({
                    articleId: article.id,
                    filterOptionId: option.id,
                    filterSetId,
                  }));
                if (data.length) await tx.articleOption.createMany({ data });
              }
            } else if (
              existing?.filters.some(
                (old) => old.id === saved.id && old.source === "tag",
              )
            ) {
              await tx.articleOption.deleteMany({
                where: { filterSetId, option: { filterId: saved.id } },
              });
            }
          }
          return filterSetId;
        },
        { timeout: 20_000, isolationLevel: "Serializable" },
      );
    } catch (error) {
      if ((error as { code?: string })?.code !== "P2034" || attempt >= 2)
        throw error;
    }
  }
}
