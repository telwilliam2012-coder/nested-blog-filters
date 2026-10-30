/* eslint-env node */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const shop = "alpha.myshopify.com";
const input = { shop, filterSetId: "main" };
let directory;
let db;
let vite;
let getFilteredArticles;
let getFilterHomeOverview;
let getFilterHomePreview;
let getStorefrontFilters;
let handleStorefrontFiltersRequest;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nested-blog-filters-"));
  // Apply the real migration history to a fresh, isolated SQLite database.
  cpSync(
    path.join(root, "prisma/migrations"),
    path.join(directory, "migrations"),
    {
      recursive: true,
    },
  );
  writeFileSync(
    path.join(directory, "schema.prisma"),
    readFileSync(path.join(root, "prisma/schema.prisma"), "utf8"),
  );
  // Prisma 6 on Windows requires the SQLite file to exist before migrate deploy.
  writeFileSync(path.join(directory, "dev.sqlite"), "");
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(directory, "schema.prisma"),
    ],
    { cwd: root, encoding: "utf8", stdio: "pipe" },
  );
  db = new PrismaClient({
    datasourceUrl: `file:${path.join(directory, "dev.sqlite").replaceAll("\\", "/")}`,
  });
  // Vite resolves the same TypeScript server module as the application.
  // No new test framework or TypeScript loader dependency is needed.
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    server: {
      middlewareMode: true,
      watch: null,
      hmr: { server: createHttpServer() },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ getFilteredArticles } = await vite.ssrLoadModule(
    "/app/services/filter-engine.server.ts",
  ));
  ({ getFilterHomeOverview, getFilterHomePreview } = await vite.ssrLoadModule(
    "/app/services/filter-home.server.ts",
  ));
  ({ getStorefrontFilters, handleStorefrontFiltersRequest } =
    await vite.ssrLoadModule("/app/services/storefront-filters.server.ts"));

  await db.filterSet.createMany({
    data: [
      { id: "main", shop, blogId: "gid://shopify/Blog/1", name: "Principal" },
      { id: "other", shop, blogId: "gid://shopify/Blog/2", name: "Otro blog" },
      {
        id: "foreign",
        shop: "beta.myshopify.com",
        blogId: "gid://shopify/Blog/1",
        name: "Otra tienda",
      },
      { id: "empty", shop, blogId: "gid://shopify/Blog/3", name: "Vacío" },
    ],
  });
  await db.filter.createMany({
    data: [
      {
        id: "motive",
        filterSetId: "main",
        key: "motivo",
        label: "Motivo",
        position: 20,
      },
      {
        id: "occasion",
        filterSetId: "main",
        key: "ocasion",
        label: "Ocasión",
        position: 10,
      },
      {
        id: "design",
        filterSetId: "main",
        key: "diseno",
        label: "Diseño",
        position: 30,
      },
      {
        id: "other-motive",
        filterSetId: "other",
        key: "motivo",
        label: "Motivo",
      },
      {
        id: "foreign-motive",
        filterSetId: "foreign",
        key: "motivo",
        label: "Motivo",
      },
    ],
  });
  await db.filterOption.createMany({
    data: [
      ["floral", "motive", "main", 0],
      ["abstract", "motive", "main", 1],
      ["unused", "motive", "main", 2],
      ["wedding", "occasion", "main", 0],
      ["birthday", "occasion", "main", 1],
      ["classic", "design", "main", 0],
      ["modern", "design", "main", 1],
      ["other-floral", "other-motive", "other", 0],
      ["foreign-floral", "foreign-motive", "foreign", 0],
    ].map(([id, filterId, filterSetId, position]) => ({
      id,
      filterId,
      filterSetId,
      value: id,
      label: id,
      position,
    })),
  });

  const publishedAt = new Date(Date.now() - 86_400_000);
  for (const [id, filterSetId, options, publication] of [
    ["a", "main", ["floral", "wedding", "classic"], publishedAt],
    ["b", "main", ["abstract", "birthday", "modern"], publishedAt],
    ["c", "main", ["floral", "birthday", "classic"], publishedAt],
    ["d", "main", ["floral", "abstract", "wedding", "modern"], publishedAt],
    ["e", "main", [], publishedAt],
    ["draft", "main", ["unused", "birthday", "modern"], null],
    [
      "scheduled",
      "main",
      ["unused", "birthday", "modern"],
      new Date(Date.now() + 86_400_000),
    ],
    ["other-article", "other", ["other-floral"], publishedAt],
    ["foreign-article", "foreign", ["foreign-floral"], publishedAt],
  ]) {
    await db.article.create({
      data: {
        id,
        filterSetId,
        shopifyArticleId: `gid://shopify/Article/${id}`,
        title: id,
        handle: id,
        publishedAt: publication,
      },
    });
    if (options.length) {
      await db.articleOption.createMany({
        data: options.map((filterOptionId) => ({
          articleId: id,
          filterOptionId,
          filterSetId,
        })),
      });
    }
  }
});

after(async () => {
  await vite?.close();
  await db?.$disconnect();
  // Only remove the unique directory this suite created in the temp root.
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nested-blog-filters-")
  ) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function run(selections = {}, pagination = {}) {
  return getFilteredArticles({ ...input, selections, ...pagination }, db);
}

function ids(result) {
  return result.articles.map((article) => article.id);
}

function option(result, filterId, optionId) {
  return result.filters
    .find((filter) => filter.id === filterId)
    .options.find((item) => item.id === optionId);
}

test("without selections returns only this blog's published articles, including untagged ones", async () => {
  const result = await run();
  assert.deepEqual(ids(result), ["a", "b", "c", "d", "e"]);
  assert.equal(result.total, 5);
  assert.equal(option(result, "motive", "floral").count, 3);
  assert.equal(option(result, "motive", "abstract").count, 2);
  assert.equal(option(result, "motive", "unused").count, 0);
  assert.equal(option(result, "motive", "unused").available, false);
});

test("OR within one filter counts an article with both options only once", async () => {
  const result = await run({ motive: ["floral", "abstract"] });
  assert.deepEqual(ids(result), ["a", "b", "c", "d"]);
  assert.equal(result.total, 4);
  assert.equal(option(result, "occasion", "wedding").count, 2);
});

test("AND across filters intersects their matches", async () => {
  const result = await run({ motive: ["floral"], occasion: ["birthday"] });
  assert.deepEqual(ids(result), ["c"]);
});

test("three filters combine OR and AND", async () => {
  const result = await run({
    motive: ["floral", "abstract"],
    occasion: ["wedding"],
    design: ["modern"],
  });
  assert.deepEqual(ids(result), ["d"]);
});

test("cascade counts use the other filters while keeping alternatives in the same filter", async () => {
  const result = await run({ motive: ["floral"], occasion: ["birthday"] });
  assert.equal(option(result, "motive", "abstract").count, 1);
  assert.equal(option(result, "motive", "abstract").available, true);
  assert.equal(option(result, "motive", "abstract").selected, false);
  assert.equal(option(result, "motive", "floral").selected, true);
  assert.equal(option(result, "occasion", "wedding").count, 2);
  assert.equal(option(result, "design", "modern").count, 0);
  assert.equal(option(result, "design", "classic").count, 1);
});

test("a valid selection with no matches stays selected and permits recovery", async () => {
  const result = await run({
    motive: ["abstract"],
    occasion: ["birthday"],
    design: ["classic"],
  });
  assert.equal(result.total, 0);
  assert.deepEqual(result.articles, []);
  assert.equal(option(result, "motive", "abstract").selected, true);
  assert.equal(option(result, "motive", "abstract").available, false);
  assert.equal(option(result, "motive", "floral").available, true);
  assert.equal(option(result, "design", "modern").available, true);
});

test("duplicate options are normalized and empty selections clear a filter", async () => {
  const result = await run({ motive: ["floral", "floral"], occasion: [] });
  assert.deepEqual(ids(result), ["a", "c", "d"]);
  assert.deepEqual(result.selections, { motive: ["floral"] });
  assert.equal((await run({ motive: [] })).total, 5);
});

test("pagination and ordering are stable and do not limit option counts", async () => {
  const first = await run({}, { page: 1, pageSize: 2 });
  const second = await run({}, { page: 2, pageSize: 2 });
  assert.deepEqual(ids(first), ["a", "b"]);
  assert.deepEqual(ids(second), ["c", "d"]);
  assert.equal(first.total, 5);
  assert.equal(first.totalPages, 3);
  assert.equal(option(second, "motive", "floral").count, 3);
  assert.deepEqual(ids(await run({}, { page: 4, pageSize: 2 })), []);
  assert.deepEqual(
    first.filters.map((filter) => filter.id),
    ["occasion", "motive", "design"],
  );
  assert.deepEqual(
    first.filters[1].options.map((item) => item.id),
    ["floral", "abstract", "unused"],
  );
});

test("an empty filter set returns empty results", async () => {
  const result = await getFilteredArticles({ shop, filterSetId: "empty" }, db);
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 0);
  assert.deepEqual(result.filters, []);
});

test("other shops and missing filter sets are inaccessible", async () => {
  for (const filterSetId of ["foreign", "missing"]) {
    await assert.rejects(getFilteredArticles({ shop, filterSetId }, db), {
      code: "FILTER_SET_NOT_FOUND",
    });
  }
  const result = await getFilteredArticles(
    { shop: "beta.myshopify.com", filterSetId: "foreign" },
    db,
  );
  assert.deepEqual(ids(result), ["foreign-article"]);
});

test("rejects unknown filters, options from other filters/blogs/shops, and malformed selections", async () => {
  for (const selections of [
    { unknown: [] },
    { "other-motive": ["other-floral"] },
    { motive: ["missing"] },
    { motive: ["birthday"] },
    { motive: ["other-floral"] },
    { motive: ["foreign-floral"] },
    { motive: "floral" },
    { motive: [42] },
    { motive: null },
    null,
    [],
  ]) {
    await assert.rejects(run(selections), { code: "INVALID_SELECTION" });
  }
});

test("rejects invalid pagination", async () => {
  for (const pagination of [
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: NaN },
    { pageSize: 0 },
    { pageSize: 101 },
    { pageSize: 2.5 },
    { page: Number.MAX_SAFE_INTEGER },
  ]) {
    await assert.rejects(run({}, pagination), { code: "INVALID_PAGINATION" });
  }
});

test("database rejects duplicate configurations, filters, options, articles and assignments", async () => {
  const operations = [
    () =>
      db.filterSet.create({
        data: { shop, blogId: "gid://shopify/Blog/1", name: "Duplicate" },
      }),
    () =>
      db.filter.create({
        data: { filterSetId: "main", key: "motivo", label: "Duplicate" },
      }),
    () =>
      db.filterOption.create({
        data: {
          filterId: "motive",
          filterSetId: "main",
          value: "floral",
          label: "Duplicate",
        },
      }),
    () =>
      db.article.create({
        data: {
          filterSetId: "main",
          shopifyArticleId: "gid://shopify/Article/a",
          title: "Duplicate",
          handle: "duplicate",
        },
      }),
    () =>
      db.articleOption.create({
        data: { articleId: "a", filterOptionId: "floral", filterSetId: "main" },
      }),
  ];
  for (const operation of operations) {
    await assert.rejects(operation(), { code: "P2002" });
  }
});

test("database rejects cross-set article assignments and option ownership", async () => {
  for (const data of [
    { articleId: "a", filterOptionId: "other-floral", filterSetId: "main" },
    {
      articleId: "a",
      filterOptionId: "foreign-floral",
      filterSetId: "foreign",
    },
    {
      articleId: "other-article",
      filterOptionId: "floral",
      filterSetId: "main",
    },
  ]) {
    await assert.rejects(db.articleOption.create({ data }), { code: "P2003" });
  }
  await assert.rejects(
    db.filterOption.create({
      data: {
        filterId: "motive",
        filterSetId: "foreign",
        value: "invalid",
        label: "Invalid",
      },
    }),
    { code: "P2003" },
  );
});

test("home summary counts only the authenticated shop's saved data", async () => {
  const overview = await getFilterHomeOverview(shop, db);
  assert.deepEqual(overview.totals, {
    filterSets: 3,
    filters: 4,
    options: 8,
    articles: 8,
  });
  assert.equal(
    overview.sets.some((set) => set.id === "foreign"),
    false,
  );
  const main = overview.sets.find((set) => set.id === "main");
  assert.deepEqual(main._count, { filters: 3, articles: 7 });
  const empty = await getFilterHomeOverview("new.myshopify.com", db);
  assert.deepEqual(empty.sets, []);
  assert.deepEqual(empty.totals, {
    filterSets: 0,
    filters: 0,
    options: 0,
    articles: 0,
  });
});

test("home preview reads repeated option parameters and uses the real AND/OR engine", async () => {
  const params = new URLSearchParams({ filterSetId: "main", page: "1" });
  params.append("option.motive", "floral");
  params.append("option.motive", "abstract");
  params.append("option.occasion", "wedding");
  const preview = await getFilterHomePreview(shop, params, db);
  assert.deepEqual(ids(preview), ["a", "d"]);
  assert.equal(preview.pageSize, 6);
  assert.equal(option(preview, "motive", "abstract").count, 1);
  assert.equal(option(preview, "motive", "floral").count, 2);
  await assert.rejects(getFilterHomePreview("beta.myshopify.com", params, db), {
    code: "FILTER_SET_NOT_FOUND",
  });
});

test("home preview rejects malformed page numbers and foreign options", async () => {
  await assert.rejects(
    getFilterHomePreview(
      shop,
      new URLSearchParams({
        filterSetId: "main",
        page: "invalid",
      }),
      db,
    ),
    { code: "INVALID_PAGINATION" },
  );
  await assert.rejects(
    getFilterHomePreview(
      shop,
      new URLSearchParams({
        filterSetId: "main",
        "option.motive": "foreign-floral",
      }),
      db,
    ),
    { code: "INVALID_SELECTION" },
  );
});

test("storefront selects a blog within its shop and publishes only presentation fields", async () => {
  const params = new URLSearchParams({
    blogId: "gid://shopify/Blog/1",
    pageSize: "2",
  });
  params.append("option.motive", "floral");
  params.append("option.motive", "abstract");
  params.append("option.occasion", "wedding");
  const result = await getStorefrontFilters(shop, params, db);
  assert.equal(result.status, "ready");
  assert.deepEqual(ids(result), ["a", "d"]);
  assert.equal(result.total, 2);
  assert.equal(option(result, "motive", "floral").count, 2);
  assert.deepEqual(Object.keys(result.articles[0]).sort(), [
    "handle",
    "id",
    "image",
    "publishedAt",
    "title",
  ]);
  assert.equal("filterSet" in result, false);
  assert.equal("selections" in result, false);
  assert.equal("key" in result.filters[0], false);
  const foreign = await getStorefrontFilters(
    "beta.myshopify.com",
    new URLSearchParams({ blogId: "gid://shopify/Blog/1" }),
    db,
  );
  assert.deepEqual(ids(foreign), ["foreign-article"]);
});

test("storefront pagination preserves complete option counts", async () => {
  const result = await getStorefrontFilters(
    shop,
    new URLSearchParams({
      blogId: "gid://shopify/Blog/1",
      pageSize: "2",
      page: "2",
    }),
    db,
  );
  assert.deepEqual(ids(result), ["c", "d"]);
  assert.equal(result.totalPages, 3);
  assert.equal(option(result, "motive", "floral").count, 3);
});

test("storefront reports an unconfigured blog without exposing another shop's data", async () => {
  assert.deepEqual(
    await getStorefrontFilters(
      "new.myshopify.com",
      new URLSearchParams({
        blogId: "gid://shopify/Blog/1",
      }),
      db,
    ),
    { status: "unconfigured" },
  );
});

test("storefront rejects malformed blogs, excessive selections and pagination", async () => {
  for (const params of [
    { blogId: "1" },
    { blogId: "gid://shopify/Product/1" },
    { blogId: "gid://shopify/Blog/1", pageSize: "49" },
    { blogId: "gid://shopify/Blog/1", page: "100001" },
    { blogId: "gid://shopify/Blog/1", page: "NaN" },
    { blogId: "gid://shopify/Blog/1", "option.motive": "foreign-floral" },
    { blogId: "gid://shopify/Blog/1", "option.motive": "x".repeat(8192) },
  ]) {
    await assert.rejects(
      getStorefrontFilters(shop, new URLSearchParams(params), db),
    );
  }
});

test("proxy requires successful Shopify authentication and an installed shop session", async () => {
  const request = new Request(
    "https://app.example/proxy/nested-filters?blogId=gid://shopify/Blog/1",
  );
  let called = false;
  const invalid = await handleStorefrontFiltersRequest(
    request,
    async () => {
      called = true;
      throw new Response("private authentication details", { status: 400 });
    },
    db,
  );
  assert.equal(called, true);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "UNAUTHORIZED" });
  const missing = await handleStorefrontFiltersRequest(
    request,
    async () => ({ session: undefined }),
    db,
  );
  assert.equal(missing.status, 401);
  const post = await handleStorefrontFiltersRequest(
    new Request(request.url, { method: "POST" }),
    async () => {
      throw new Error("POST must not access the database");
    },
    db,
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET");
});

test("proxy uses the authenticated shop, ignores spoofed shop and filter-set IDs, and disables caching", async () => {
  const request = new Request(
    "https://app.example/proxy/nested-filters?blogId=gid://shopify/Blog/1&shop=beta.myshopify.com&filterSetId=foreign",
  );
  const result = await handleStorefrontFiltersRequest(
    request,
    async () => ({ session: { shop } }),
    db,
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(ids(await result.json()), ["a", "b", "c", "d", "e"]);
  const badQuery = await handleStorefrontFiltersRequest(
    new Request(request.url + "&page=0"),
    async () => ({ session: { shop } }),
    db,
  );
  assert.equal(badQuery.status, 400);
  assert.deepEqual(await badQuery.json(), { error: "INVALID_PAGINATION" });
});

test("deleting a filter set cascades without affecting another blog or sessions", async () => {
  // Dummy session belongs exclusively to this temporary test database.
  await db.session.create({
    data: { id: "test-session", shop, state: "test", accessToken: "test" },
  });
  await db.filterSet.delete({ where: { id: "other" } });
  assert.equal(await db.filter.count({ where: { filterSetId: "other" } }), 0);
  assert.equal(
    await db.filterOption.count({ where: { filterSetId: "other" } }),
    0,
  );
  assert.equal(await db.article.count({ where: { filterSetId: "other" } }), 0);
  assert.equal(
    await db.articleOption.count({ where: { filterSetId: "other" } }),
    0,
  );
  assert.equal(await db.article.count({ where: { filterSetId: "main" } }), 7);
  assert.equal(await db.session.count(), 1);
  assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
});
