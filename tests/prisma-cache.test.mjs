/* eslint-env node */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, sep } from "node:path";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let vite;

before(async () => {
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
});

after(async () => {
  await global.prismaGlobal?.$disconnect();
  delete global.prismaGlobal;
  delete global.prismaGeneration;
  await vite?.close();
});

test("development replaces an old global client and stale generated module exports", async () => {
  require("@prisma/client");
  const generatedDirectory = `${dirname(require.resolve(".prisma/client"))}${sep}`;
  const packageEntry = require.resolve("@prisma/client");
  class OldPrismaClient {}
  for (const [filename, module] of Object.entries(require.cache)) {
    if (
      (filename === packageEntry || filename.startsWith(generatedDirectory)) &&
      module?.exports.PrismaClient
    ) {
      module.exports = { ...module.exports, PrismaClient: OldPrismaClient };
    }
  }
  let disconnected = 0;
  const old = {
    $disconnect: async () => {
      disconnected++;
    },
  };
  global.prismaGlobal = old;
  delete global.prismaGeneration;
  const { default: current } = await vite.ssrLoadModule("/app/db.server.ts");
  assert.notEqual(current, old);
  assert.notEqual(current.constructor, OldPrismaClient);
  assert.equal(current.filter.fields.parentValues.name, "parentValues");
  assert.equal(current.filter.fields.source.name, "source");
  assert.equal(disconnected, 1);
  assert.equal(global.prismaGlobal, current);
});

async function reloadDatabaseModule() {
  const module = await vite.moduleGraph.getModuleByUrl(
    "/app/db.server.ts",
    true,
  );
  vite.moduleGraph.invalidateModule(module);
  return (await vite.ssrLoadModule("/app/db.server.ts")).default;
}

test("ordinary hot reload reuses the same Prisma client and connection pool", async () => {
  const previous = global.prismaGlobal;
  assert.equal(await reloadDatabaseModule(), previous);
});

test("a changed generated-client generation replaces the cached client", async () => {
  const previous = global.prismaGlobal;
  global.prismaGeneration = "previous-generation";
  const current = await reloadDatabaseModule();
  assert.notEqual(current, previous);
  assert.equal(current.filter.fields.parentValues.name, "parentValues");
});

const storedSet = {
  name: "Filtros del blog",
  blogId: "gid://shopify/Blog/1",
  revision: 7,
  filters: [
    {
      id: "motive",
      key: "motivo",
      label: "Motivo",
      options: [{ id: "christmas", value: "Navidad", label: "Navidad" }],
    },
  ],
};

test("opening a saved set without hierarchy fields defaults to an independent filter", async () => {
  const { toFilterSetDraft } = await vite.ssrLoadModule("/app/filter-draft.ts");
  const draft = toFilterSetDraft(storedSet);
  assert.deepEqual(draft.filters[0], {
    ...storedSet.filters[0],
    source: "metafield",
    parentKey: null,
    parentValues: [],
  });
  assert.equal(draft.revision, 7);
  assert.deepEqual(
    toFilterSetDraft({
      ...storedSet,
      filters: [{ ...storedSet.filters[0], parentValues: null }],
    }).filters[0].parentValues,
    [],
  );
});

test("opening a nested set preserves its source, condition and option identifiers", async () => {
  const { toFilterSetDraft } = await vite.ssrLoadModule("/app/filter-draft.ts");
  const draft = toFilterSetDraft({
    ...storedSet,
    filters: [
      {
        ...storedSet.filters[0],
        source: "tag",
        parentKey: "ocasion",
        parentValues: '["Festividades"]',
      },
    ],
  });
  assert.equal(draft.filters[0].source, "tag");
  assert.equal(draft.filters[0].parentKey, "ocasion");
  assert.deepEqual(draft.filters[0].parentValues, ["Festividades"]);
  assert.deepEqual(draft.filters[0].options, storedSet.filters[0].options);
  assert.throws(
    () =>
      toFilterSetDraft({
        ...storedSet,
        filters: [{ ...storedSet.filters[0], parentValues: '"Festividades"' }],
      }),
    /lista de valores/,
  );
});
