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
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const shop = "admin-test.myshopify.com";
const blogId = "gid://shopify/Blog/100";
const type = "list.single_line_text_field";
let directory, db, vite, filters, articles, engine, setId;
const definitions = new Map();
const remote = new Map();
let failPage = false,
  rejectWrites = false,
  beforeWrite,
  writeCount = 0;
const writes = [];
let digestNumber = 0;

function field(values) {
  return { type, jsonValue: values, compareDigest: `digest-${++digestNumber}` };
}
function rawNode(node, query) {
  const result = { ...node };
  for (const match of query.matchAll(
    /attribute_(\d+): metafield\(namespace: "\$app", key: "([^"]+)"\)/g,
  )) {
    result[`attribute_${match[1]}`] = node.fields[match[2]] ?? null;
  }
  return result;
}
const admin = {
  async graphql(query, { variables = {} } = {}) {
    let data;
    if (query.includes("query FilterBlog("))
      data = {
        blog:
          variables.id === blogId
            ? { id: blogId, title: "Historias", handle: "historias" }
            : null,
      };
    else if (query.includes("query FilterDefinitions"))
      data = {
        metafieldDefinitions: {
          nodes: [...definitions].map(([key, name]) => ({
            key,
            type: { name },
          })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      };
    else if (query.includes("mutation FilterDefinitionCreate")) {
      assert.equal(variables.definition.namespace, undefined);
      assert.equal(variables.definition.ownerType, "ARTICLE");
      definitions.set(variables.definition.key, variables.definition.type);
      data = {
        metafieldDefinitionCreate: {
          createdDefinition: { id: "definition" },
          userErrors: [],
        },
      };
    } else if (query.includes("query FilterBlogArticles")) {
      if (failPage) {
        failPage = false;
        throw new Error("temporary Shopify failure");
      }
      const all = [...remote.values()].filter(
        (node) => node.blog.id === variables.blogId,
      );
      const offset = Number(variables.after ?? 0);
      data = {
        blog: {
          id: variables.blogId,
          articles: {
            nodes: all
              .slice(offset, offset + 25)
              .map((node) => rawNode(node, query)),
            pageInfo: {
              hasNextPage: offset + 25 < all.length,
              endCursor: String(offset + 25),
            },
          },
        },
      };
    } else if (query.includes("query FilterArticlesByIds"))
      data = {
        nodes: variables.ids.map((id) =>
          remote.has(id) ? rawNode(remote.get(id), query) : null,
        ),
      };
    else if (query.includes("mutation FilterArticleAttributes")) {
      writeCount++;
      writes.push(variables.metafields);
      await beforeWrite?.();
      beforeWrite = undefined;
      const conflict =
        rejectWrites ||
        variables.metafields.some(
          (input) =>
            (remote.get(input.ownerId).fields[input.key]?.compareDigest ??
              null) !== input.compareDigest,
        );
      if (conflict)
        data = {
          metafieldsSet: {
            metafields: null,
            userErrors: [
              { message: "Conflict", code: "INVALID_COMPARE_DIGEST" },
            ],
          },
        };
      else {
        for (const input of variables.metafields) {
          assert.equal(input.namespace, undefined);
          assert.equal(input.type, type);
          remote.get(input.ownerId).fields[input.key] = field(
            JSON.parse(input.value),
          );
        }
        data = {
          metafieldsSet: {
            metafields: variables.metafields.map((input) => ({
              key: input.key,
              compareDigest: remote.get(input.ownerId).fields[input.key]
                .compareDigest,
            })),
            userErrors: [],
          },
        };
      }
    } else throw new Error(`Unexpected operation: ${query.slice(0, 90)}`);
    return { json: async () => ({ data }) };
  },
};

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-admin-"));
  cpSync(
    path.join(root, "prisma/migrations"),
    path.join(directory, "migrations"),
    { recursive: true },
  );
  writeFileSync(
    path.join(directory, "schema.prisma"),
    readFileSync(path.join(root, "prisma/schema.prisma")),
  );
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
    { cwd: root, stdio: "pipe" },
  );
  db = new PrismaClient({
    datasourceUrl: `file:${path.join(directory, "dev.sqlite").replaceAll("\\", "/")}`,
  });
  vite = await createServer({
    root,
    configFile: false,
    server: {
      middlewareMode: true,
      watch: null,
      hmr: { server: createHttpServer() },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  filters = await vite.ssrLoadModule("/app/services/filter-admin.server.ts");
  articles = await vite.ssrLoadModule("/app/services/article-admin.server.ts");
  engine = await vite.ssrLoadModule("/app/services/filter-engine.server.ts");
  for (let index = 0; index < 30; index++) {
    const id = `gid://shopify/Article/${1000 + index}`;
    remote.set(id, {
      id,
      title: `Historia ${String(index).padStart(2, "0")}`,
      handle: `historia-${index}`,
      blog: { id: blogId },
      isPublished: index !== 1,
      publishedAt:
        index === 2 ? "2099-01-01T00:00:00.000Z" : "2020-01-01T00:00:00.000Z",
      fields: {
        nbf_motivo: field(
          index === 0
            ? ["floral", "valor-importado"]
            : [index % 2 ? "abstracto" : "floral"],
        ),
        nbf_ocasion: field(["boda"]),
      },
    });
  }
});

after(async () => {
  await vite?.close();
  await db?.$disconnect();
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-admin-")
  )
    rmSync(directory, { recursive: true, force: true });
});

function draft(set) {
  return {
    name: set.name,
    blogId: set.blogId,
    revision: set.revision,
    filters: set.filters.map((filter) => ({
      id: filter.id,
      key: filter.key,
      label: filter.label,
      source: filter.source,
      parentKey: filter.parentKey,
      parentValues: JSON.parse(filter.parentValues),
      options: filter.options.map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
      })),
    })),
  };
}
const current = () => filters.getFilterSet(shop, setId, db);
async function completeSync() {
  let result = await articles.syncArticlePage(
    admin,
    shop,
    setId,
    (await current()).revision,
    null,
    db,
  );
  while (!result.complete)
    result = await articles.syncArticlePage(
      admin,
      shop,
      setId,
      0,
      result.id,
      db,
    );
  return result;
}
async function editInput(mode, values, count = 2) {
  const page = await articles.getArticleManagementPage(
    admin,
    shop,
    setId,
    1,
    db,
  );
  const filter = page.set.filters.find((item) => item.key === "motivo");
  const rows = page.articles.slice(0, count);
  return {
    revision: page.set.revision,
    articleIds: rows.map((row) => row.id),
    filterId: filter.id,
    mode,
    optionIds: filter.options
      .filter((option) => values.includes(option.value))
      .map((option) => option.id),
    digests: Object.fromEntries(
      rows.map((row) => [row.id, row.attributes[filter.id].digest]),
    ),
  };
}

test("builder creates scoped configurations and app-owned ARTICLE list definitions", async () => {
  setId = await filters.saveFilterSet(
    admin,
    shop,
    null,
    {
      name: "Historias",
      blogId,
      revision: 0,
      filters: [
        {
          key: "motivo",
          label: "Motivo",
          options: [
            { value: "floral", label: "Floral" },
            { value: "abstracto", label: "Abstracto" },
          ],
        },
        {
          key: "ocasion",
          label: "Ocasión",
          options: [{ value: "boda", label: "Boda" }],
        },
      ],
    },
    db,
  );
  const set = await current();
  assert.deepEqual(
    set.filters.map((item) => item.key),
    ["motivo", "ocasion"],
  );
  assert.equal(definitions.get("nbf_motivo"), type);
  assert.equal(definitions.get("nbf_ocasion"), type);
});

test("builder preserves stable IDs and values while renaming and reordering", async () => {
  const old = await current();
  const input = draft(old);
  input.filters.reverse();
  input.filters[1].options.reverse();
  input.filters[1].label = "Temática";
  await filters.saveFilterSet(admin, shop, setId, input, db);
  const saved = await current();
  assert.equal(saved.filters[0].id, old.filters[1].id);
  assert.equal(saved.filters[1].options[0].id, old.filters[0].options[1].id);
  assert.equal(saved.filters[1].label, "Temática");
  await assert.rejects(filters.saveFilterSet(admin, shop, setId, input, db), {
    status: 409,
  });
});

test("builder rejects duplicate keys, foreign IDs, changes to saved keys/values and cross-shop access", async () => {
  const set = await current();
  const duplicate = draft(set);
  duplicate.filters[1].key = duplicate.filters[0].key;
  assert.throws(() => filters.parseFilterDraft(duplicate));
  const changed = draft(set);
  changed.filters[0].key = "otra_clave";
  await assert.rejects(filters.saveFilterSet(admin, shop, setId, changed, db));
  const foreign = draft(set);
  foreign.filters[0].options[0].id = "foreign-option";
  await assert.rejects(filters.saveFilterSet(admin, shop, setId, foreign, db));
  const value = draft(set);
  value.filters[0].options[0].value = "cambiado";
  await assert.rejects(filters.saveFilterSet(admin, shop, setId, value, db));
  await assert.rejects(filters.getFilterSet("other.myshopify.com", setId, db), {
    status: 404,
  });
});

test("sync resumes across pages, locks editing, imports unknown values and removes stale articles only on completion", async () => {
  await db.article.create({
    data: {
      filterSetId: setId,
      shopifyArticleId: "gid://shopify/Article/999",
      title: "Eliminado",
      handle: "eliminado",
      updatedAt: new Date(Date.now() + 5000),
    },
  });
  const first = await articles.syncArticlePage(
    admin,
    shop,
    setId,
    (await current()).revision,
    null,
    db,
  );
  assert.equal(first.complete, false);
  assert.equal(first.importedCount, 25);
  assert.equal(await db.article.count({ where: { filterSetId: setId } }), 26);
  await assert.rejects(
    filters.saveFilterSet(admin, shop, setId, draft(await current()), db),
    { status: 409 },
  );
  const last = await articles.syncArticlePage(
    admin,
    shop,
    setId,
    0,
    first.id,
    db,
  );
  assert.equal(last.complete, true);
  assert.equal(last.importedCount, 30);
  const set = await current();
  assert.equal(set.sync, null);
  assert.equal(await db.article.count({ where: { filterSetId: setId } }), 30);
  assert.equal(
    set.filters
      .find((item) => item.key === "motivo")
      .options.some((item) => item.value === "valor-importado"),
    true,
  );
  const result = await engine.getFilteredArticles(
    { shop, filterSetId: setId },
    db,
  );
  assert.equal(result.total, 28);
  assert.equal(
    (
      await db.article.findFirst({
        where: { shopifyArticleId: "gid://shopify/Article/1001" },
      })
    ).publishedAt,
    null,
  );
});

test("assigned option removal rolls back the configuration revision and preserves links", async () => {
  const set = await current();
  const input = draft(set);
  input.filters[0].options = [];
  await assert.rejects(filters.saveFilterSet(admin, shop, setId, input, db), {
    status: 409,
  });
  assert.equal((await current()).revision, set.revision);
  assert.ok(await db.articleOption.count());
});

test("failed imports keep a resumable cursor and cancellation releases the lock without erasing prior pages", async () => {
  failPage = true;
  await assert.rejects(
    articles.syncArticlePage(
      admin,
      shop,
      setId,
      (await current()).revision,
      null,
      db,
    ),
    { status: 502 },
  );
  const job = (await current()).sync;
  assert.equal(job.cursor, null);
  const page = await articles.syncArticlePage(
    admin,
    shop,
    setId,
    0,
    job.id,
    db,
  );
  await articles.cancelArticleSync(shop, setId, page.id, db);
  assert.equal((await current()).sync, null);
  assert.equal(await db.article.count({ where: { filterSetId: setId } }), 30);
  await assert.rejects(
    articles.cancelArticleSync("other.myshopify.com", setId, job.id, db),
    { status: 409 },
  );
});

test("bulk add writes a JSON list with CAS, preserves other attributes and updates the local AND/OR index", async () => {
  const input = await editInput("append", ["abstracto"]);
  assert.equal(
    await articles.editArticleAttributes(admin, shop, setId, input, db),
    2,
  );
  assert.ok(
    writes
      .at(-1)
      .every(
        (item) =>
          Array.isArray(JSON.parse(item.value)) &&
          typeof item.compareDigest === "string",
      ),
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_ocasion.jsonValue,
    ["boda"],
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_motivo.jsonValue,
    ["floral", "valor-importado", "abstracto"],
  );
  const set = await current();
  const option = set.filters
    .find((item) => item.key === "motivo")
    .options.find((item) => item.value === "abstracto");
  const result = await engine.getFilteredArticles(
    {
      shop,
      filterSetId: setId,
      selections: { [option.filterId]: [option.id] },
    },
    db,
  );
  assert.ok(
    result.articles.some(
      (article) => article.shopifyArticleId === "gid://shopify/Article/1000",
    ),
  );
});

test("individual remove and replace-empty change only the selected filter", async () => {
  await articles.editArticleAttributes(
    admin,
    shop,
    setId,
    await editInput("remove", ["abstracto"], 1),
    db,
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_motivo.jsonValue,
    ["floral", "valor-importado"],
  );
  await articles.editArticleAttributes(
    admin,
    shop,
    setId,
    await editInput("replace", [], 1),
    db,
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_motivo.jsonValue,
    [],
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_ocasion.jsonValue,
    ["boda"],
  );
});

test("stale UI digests and Shopify CAS errors prevent local changes and report a conflict", async () => {
  const stale = await editInput("replace", ["floral"], 1);
  remote.get("gid://shopify/Article/1000").fields.nbf_motivo = field([
    "abstracto",
  ]);
  const count = writeCount;
  await assert.rejects(
    articles.editArticleAttributes(admin, shop, setId, stale, db),
    { status: 409 },
  );
  assert.equal(writeCount, count);
  rejectWrites = true;
  const before = await db.articleOption.count();
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      shop,
      setId,
      await editInput("replace", ["floral"], 1),
      db,
    ),
    { status: 409 },
  );
  rejectWrites = false;
  assert.equal(await db.articleOption.count(), before);
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_motivo.jsonValue,
    ["abstracto"],
  );
});

test("scope, revision and batch validation reject cross-blog articles and oversized requests", async () => {
  const input = await editInput("append", ["floral"], 1);
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      "other.myshopify.com",
      setId,
      input,
      db,
    ),
    { status: 404 },
  );
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      shop,
      setId,
      { ...input, articleIds: ["foreign-article"] },
      db,
    ),
    { status: 403 },
  );
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      shop,
      setId,
      { ...input, optionIds: ["foreign-option"] },
      db,
    ),
  );
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      shop,
      setId,
      {
        ...input,
        articleIds: Array.from({ length: 26 }, (_, index) => `row${index}`),
      },
      db,
    ),
  );
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      shop,
      setId,
      { ...input, revision: input.revision - 1 },
      db,
    ),
    { status: 409 },
  );
});

test("a local commit failure after Shopify succeeds gives an explicit recovery path", async () => {
  const input = await editInput("replace", ["floral"], 1);
  beforeWrite = () =>
    db.filterSet.update({
      where: { id: setId },
      data: { revision: { increment: 1 } },
    });
  await assert.rejects(
    articles.editArticleAttributes(admin, shop, setId, input, db),
    (error) =>
      error.status === 409 &&
      error.message.includes("Shopify guardó") &&
      error.message.includes("Sincroniza"),
  );
  assert.deepEqual(
    remote.get("gid://shopify/Article/1000").fields.nbf_motivo.jsonValue,
    ["floral"],
  );
  await completeSync();
});

test("a complete reimport reconciles removed/moved articles and unpublishing", async () => {
  remote.delete("gid://shopify/Article/1029");
  remote.get("gid://shopify/Article/1028").blog.id = "gid://shopify/Blog/200";
  remote.get("gid://shopify/Article/1000").isPublished = false;
  const result = await completeSync();
  assert.equal(result.importedCount, 28);
  assert.equal(await db.article.count({ where: { filterSetId: setId } }), 28);
  const response = await engine.getFilteredArticles(
    { shop, filterSetId: setId },
    db,
  );
  assert.equal(
    response.articles.some(
      (article) => article.shopifyArticleId === "gid://shopify/Article/1000",
    ),
    false,
  );
  assert.deepEqual(await db.$queryRawUnsafe("PRAGMA foreign_key_check"), []);
});

test("tag filters follow Motivo → Ocasión → Festividad and ignore stale hidden selections", async () => {
  const { celebrationFilters } = await vite.ssrLoadModule(
    "/app/filter-presets.ts",
  );
  const tagShop = "tag-filters.myshopify.com";
  const definitionsBefore = definitions.size;
  const writesBefore = writeCount;
  const id = await filters.saveFilterSet(
    admin,
    tagShop,
    null,
    {
      name: "Celebraciones",
      blogId,
      revision: 0,
      filters: celebrationFilters(),
    },
    db,
  );
  const samples = [
    [1003, ["Celebraciones", "Festividades", "Navidad"]],
    [1004, ["celebraciones", "Festividades", "Halloween"]],
    [1005, ["Decoraciones"]],
  ];
  for (const [number, tags] of samples)
    remote.get(`gid://shopify/Article/${number}`).tags = tags;
  remote.get("gid://shopify/Article/1003").image = {
    url: "https://cdn.shopify.com/navidad.png",
    altText: "Fiesta de Navidad",
  };
  let progress = await articles.syncArticlePage(
    admin,
    tagShop,
    id,
    0,
    null,
    db,
  );
  while (!progress.complete)
    progress = await articles.syncArticlePage(
      admin,
      tagShop,
      id,
      0,
      progress.id,
      db,
    );
  const set = await filters.getFilterSet(tagShop, id, db);
  const [motive, occasion, holiday] = set.filters;
  const option = (filter, value) =>
    filter.options.find((option) => option.value === value).id;
  const run = (selections = {}) =>
    engine.getFilteredArticles(
      { shop: tagShop, filterSetId: id, selections },
      db,
    );
  assert.deepEqual(
    (await run()).filters.map((filter) => filter.visible),
    [true, false, false],
  );
  const celebration = { [motive.id]: [option(motive, "Celebraciones")] };
  const levelTwo = await run(celebration);
  assert.equal(levelTwo.total, 2);
  assert.deepEqual(
    levelTwo.filters.map((filter) => filter.visible),
    [true, true, false],
  );
  const festivities = {
    ...celebration,
    [occasion.id]: [option(occasion, "Festividades")],
  };
  const levelThree = await run(festivities);
  assert.deepEqual(
    levelThree.filters.map((filter) => filter.visible),
    [true, true, true],
  );
  const christmas = await run({
    ...festivities,
    [holiday.id]: [option(holiday, "Navidad")],
  });
  assert.equal(christmas.total, 1);
  assert.equal(
    christmas.articles[0].shopifyArticleId,
    "gid://shopify/Article/1003",
  );
  assert.equal(christmas.articles[0].imageAlt, "Fiesta de Navidad");
  assert.equal(
    christmas.filters[0].options.find((item) => item.value === "Decoraciones")
      .count,
    1,
  );
  assert.equal(
    christmas.filters[2].options.find((item) => item.value === "Halloween")
      .count,
    1,
  );
  const switched = await run({
    [motive.id]: [option(motive, "Decoraciones")],
    [occasion.id]: [option(occasion, "Festividades")],
    [holiday.id]: [option(holiday, "Navidad")],
  });
  assert.equal(switched.total, 1);
  assert.deepEqual(switched.selections, {
    [motive.id]: [option(motive, "Decoraciones")],
  });
  assert.deepEqual(
    switched.filters.map((filter) => filter.visible),
    [true, false, false],
  );
  assert.equal(definitions.size, definitionsBefore);
  assert.equal(writeCount, writesBefore);
  await assert.rejects(
    articles.editArticleAttributes(
      admin,
      tagShop,
      id,
      {
        revision: set.revision,
        articleIds: [christmas.articles[0].id],
        filterId: motive.id,
        optionIds: [],
        mode: "replace",
        digests: {},
      },
      db,
    ),
    /etiquetas de Shopify/,
  );

  const changed = draft(set);
  changed.filters[2].options.push({
    value: "Otra etiqueta",
    label: "Otra etiqueta",
  });
  await filters.saveFilterSet(admin, tagShop, id, changed, db);
  assert.equal((await run(festivities)).total, 2);
});

test("the celebration preset reuses assigned holiday options and adds their ancestors", async () => {
  const { celebrationFilters } = await vite.ssrLoadModule(
    "/app/filter-presets.ts",
  );
  const legacyShop = "legacy-filters.myshopify.com";
  const id = await filters.saveFilterSet(
    admin,
    legacyShop,
    null,
    {
      name: "Filtros del blog",
      blogId,
      revision: 0,
      filters: [
        {
          key: "motivo",
          label: "Motivo",
          options: [
            { value: "Halloween", label: "Tipos de Fiesta" },
            { value: "Navidad", label: "Tipos de Fiesta" },
          ],
        },
      ],
    },
    db,
  );
  const old = await filters.getFilterSet(legacyShop, id, db);
  const christmasOption = old.filters[0].options.find(
    (option) => option.value === "Navidad",
  );
  const article = await db.article.create({
    data: {
      filterSetId: id,
      shopifyArticleId: "gid://shopify/Article/5000",
      title: "Fiesta de Navidad",
      handle: "fiesta-de-navidad",
      publishedAt: new Date("2020-01-01"),
      tags: JSON.stringify(["Celebraciones", "Festividades", "Navidad"]),
    },
  });
  await db.articleOption.create({
    data: {
      articleId: article.id,
      filterOptionId: christmasOption.id,
      filterSetId: id,
    },
  });
  const configuration = draft(old);
  configuration.filters = celebrationFilters(configuration.filters);
  const writesBefore = writeCount;
  await filters.saveFilterSet(admin, legacyShop, id, configuration, db);
  const updated = await filters.getFilterSet(legacyShop, id, db);
  assert.equal(updated.filters.length, 3);
  assert.equal(updated.filters[2].id, old.filters[0].id);
  assert.equal(updated.filters[2].key, "motivo");
  assert.equal(updated.filters[2].label, "Festividades");
  assert.equal(
    updated.filters[2].options.find((option) => option.value === "Navidad").id,
    christmasOption.id,
  );
  const [root, occasion, holiday] = updated.filters;
  const response = await engine.getFilteredArticles(
    {
      shop: legacyShop,
      filterSetId: id,
      selections: {
        [root.id]: [
          root.options.find((option) => option.value === "Celebraciones").id,
        ],
        [occasion.id]: [
          occasion.options.find((option) => option.value === "Festividades").id,
        ],
        [holiday.id]: [christmasOption.id],
      },
    },
    db,
  );
  assert.equal(response.total, 1);
  assert.equal(writeCount, writesBefore);
});

test("hierarchy validation rejects cycles, missing parents and unknown parent options", async () => {
  const { celebrationFilters } = await vite.ssrLoadModule(
    "/app/filter-presets.ts",
  );
  for (const mutate of [
    (items) => {
      items[0].parentKey = "festividad";
      items[0].parentValues = ["Navidad"];
    },
    (items) => {
      items[1].parentKey = "otra_tienda";
    },
    (items) => {
      items[1].parentValues = ["No existe"];
    },
    (items) => {
      items[1].parentValues = [];
    },
  ]) {
    const items = celebrationFilters();
    mutate(items);
    assert.throws(
      () =>
        filters.parseFilterDraft({
          name: "Inválido",
          blogId,
          revision: 0,
          filters: items,
        }),
      /filtro anterior/,
    );
  }
});
