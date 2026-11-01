import type { PrismaClient } from "@prisma/client";

import prisma from "../db.server";
import { FilterEngineError, getFilteredArticles } from "./filter-engine.server";

type ProxyAuthenticator = (
  request: Request,
) => Promise<{ session: { shop: string } | undefined }>;

const responseHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function getStorefrontFilters(
  shop: string,
  params: URLSearchParams,
  db: PrismaClient = prisma,
) {
  const blogId = params.get("blogId") ?? "";
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 12);
  if (!/^gid:\/\/shopify\/Blog\/[1-9]\d*$/.test(blogId)) {
    throw new FilterEngineError("Invalid blog ID.", "INVALID_SELECTION");
  }
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100_000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 48
  ) {
    throw new FilterEngineError("Invalid pagination.", "INVALID_PAGINATION");
  }
  if (params.toString().length > 8192 || [...params].length > 150) {
    throw new FilterEngineError("Too many selections.", "INVALID_SELECTION");
  }
  const selections = Object.fromEntries(
    [...new Set(params.keys())]
      .filter((key) => key.startsWith("option."))
      .map((key) => [key.slice("option.".length), params.getAll(key)]),
  );
  const filterSet = await db.filterSet.findUnique({
    where: { shop_blogId: { shop, blogId } },
    select: { id: true },
  });

  if (!filterSet) {
    return { status: "unconfigured" as const };
  }
  const result = await getFilteredArticles(
    {
      shop,
      filterSetId: filterSet.id,
      selections,
      page,
      pageSize,
      query: params.get("q") ?? "",
    },
    db,
  );

  return {
    status: "ready" as const,
    filters: result.filters.map((filter) => ({
      id: filter.id,
      label: filter.label,
      visible: filter.visible,
      parentFilterId: filter.parentFilterId,
      options: filter.options.map((option) => ({
        id: option.id,
        label: option.label,
        count: option.count,
        available: option.available,
        selected: option.selected,
      })),
    })),
    articles: result.articles.map((article) => ({
      id: article.id,
      title: article.title,
      handle: article.handle,
      publishedAt: article.publishedAt?.toISOString() ?? null,
      image: article.imageUrl
        ? { url: article.imageUrl, alt: article.imageAlt ?? article.title }
        : null,
    })),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

export async function handleStorefrontFiltersRequest(
  request: Request,
  authenticateProxy: ProxyAuthenticator,
  db: PrismaClient = prisma,
) {
  if (request.method !== "GET") {
    return Response.json(
      { error: "METHOD_NOT_ALLOWED" },
      {
        status: 405,
        headers: { ...responseHeaders, Allow: "GET" },
      },
    );
  }

  try {
    const { session } = await authenticateProxy(request);
    if (!session) {
      return Response.json(
        { error: "UNAUTHORIZED" },
        {
          status: 401,
          headers: responseHeaders,
        },
      );
    }
    const result = await getStorefrontFilters(
      session.shop,
      new URL(request.url).searchParams,
      db,
    );
    return Response.json(result, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof Response) {
      return Response.json(
        { error: "UNAUTHORIZED" },
        {
          status: [400, 401, 403].includes(error.status) ? error.status : 401,
          headers: responseHeaders,
        },
      );
    }
    if (error instanceof FilterEngineError) {
      return Response.json(
        { error: error.code },
        {
          status: error.code === "FILTER_SET_NOT_FOUND" ? 404 : 400,
          headers: responseHeaders,
        },
      );
    }
    console.error("Unable to load storefront blog filters.");
    return Response.json(
      { error: "FILTERS_UNAVAILABLE" },
      {
        status: 503,
        headers: responseHeaders,
      },
    );
  }
}
