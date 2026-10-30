import type { PrismaClient } from "@prisma/client";

import prisma from "../db.server";
import { getFilteredArticles } from "./filter-engine.server";

export async function getFilterHomeOverview(
  shop: string,
  db: PrismaClient = prisma,
) {
  const [sets, filterSets, filters, options, articles] = await db.$transaction([
    db.filterSet.findMany({
      where: { shop },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 50,
      select: {
        id: true,
        blogId: true,
        name: true,
        _count: { select: { filters: true, articles: true } },
      },
    }),
    db.filterSet.count({ where: { shop } }),
    db.filter.count({ where: { filterSet: { shop } } }),
    db.filterOption.count({ where: { filter: { filterSet: { shop } } } }),
    db.article.count({ where: { filterSet: { shop } } }),
  ]);

  return { sets, totals: { filterSets, filters, options, articles } };
}

export type FilterHomeOverview = Awaited<
  ReturnType<typeof getFilterHomeOverview>
>;

export function getFilterHomePreview(
  shop: string,
  params: URLSearchParams,
  db: PrismaClient = prisma,
) {
  const selections = Object.fromEntries(
    [...new Set(params.keys())]
      .filter((key) => key.startsWith("option."))
      .map((key) => [key.slice("option.".length), params.getAll(key)]),
  );

  return getFilteredArticles(
    {
      shop,
      filterSetId: params.get("filterSetId") ?? "",
      selections,
      page: Number(params.get("page") ?? 1),
      pageSize: 6,
    },
    db,
  );
}
