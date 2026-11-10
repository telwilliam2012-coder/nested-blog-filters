/* eslint-env node */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createServer } from "vite";
import { buildProductionTools } from "../scripts/build-production-tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const shop = "configuration-transfer.myshopify.com";
const otherShop = "other-configuration.myshopify.com";
const timestamp = "2026-11-01T10:20:30.000Z";
const secret = "fixture-OAuth-token-never-export";
let directory, vite, transfer;
const databases = [];
before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-configuration-transfer-"));
  vite = await createServer({
    root,
    configFile: false,
    envDir: directory,
    appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  transfer = await vite.ssrLoadModule("/scripts/configuration-transfer.ts");
});
after(async () => {
  for (const db of databases) await db.$disconnect();
  await vite?.close();
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-configuration-transfer-")
  )
    rmSync(directory, { recursive: true, force: true });
});

async function database(label) {
  const isolated = path.join(directory, `${label}-schema`);
  mkdirSync(isolated);
  cpSync(
    path.join(root, "prisma/migrations"),
    path.join(isolated, "migrations"),
    { recursive: true },
  );
  writeFileSync(
    path.join(isolated, "schema.prisma"),
    readFileSync(path.join(root, "prisma/schema.prisma")),
  );
  writeFileSync(path.join(directory, `${label}.sqlite`), "");
  const url = `file:${path.join(directory, `${label}.sqlite`).replaceAll("\\", "/")}`;
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(isolated, "schema.prisma"),
    ],
    {
      cwd: directory,
      env: { ...process.env, DATABASE_URL: url },
      windowsHide: true,
      stdio: "pipe",
    },
  );
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  databases.push(db);
  return { db, url };
}
function unsigned() {
  return {
    format: "nested-blog-filters.configuration",
    version: 1,
    shop,
    exportedAt: timestamp,
    sourceOrigin: "https://nested-blog-filters.onrender.com",
    exportProof: { expectedSetIds: ["set-b", "set-a"], complete: true },
    filterSets: [
      {
        id: "set-b",
        blogId: "gid://shopify/Blog/202",
        name: "Segunda guía",
        revision: 3,
        filters: [
          {
            id: "filter-b",
            key: "diseno",
            label: "Diseño",
            position: 0,
            source: "metafield",
            parentKey: null,
            parentValues: [],
            options: [
              {
                id: "option-b",
                value: "Rosas & flores",
                label: "Flores",
                position: 0,
              },
            ],
          },
        ],
      },
      {
        id: "set-a",
        blogId: "gid://shopify/Blog/101",
        name: "Celebraciones y música",
        revision: 7,
        createdAt: timestamp,
        updatedAt: timestamp,
        filters: [
          {
            id: "filter-child",
            key: "ocasion",
            label: "Ocasión",
            position: 2,
            source: "tag",
            parentKey: "motivo",
            parentValues: ["Celebración"],
            options: [
              {
                id: "option-child",
                value: "Cumpleaños_niños",
                label: "Niños",
                position: 4,
              },
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            id: "filter-parent",
            key: "motivo",
            label: "Motivo",
            position: 1,
            source: "tag",
            parentKey: null,
            parentValues: [],
            options: [
              {
                id: "option-z",
                value: "Celebración",
                label: "Celebraciones",
                position: 3,
                createdAt: timestamp,
                updatedAt: timestamp,
              },
              {
                id: "option-a",
                value: "Temporada",
                label: "Temporadas",
                position: 1,
              },
            ],
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
    ],
  };
}
function snapshot(value = unsigned()) {
  return { ...value, checksum: transfer.configurationChecksum(value) };
}
function changed(change) {
  const value = unsigned();
  change(value);
  return snapshot(value);
}
const totals = (db) =>
  Promise.all([
    db.filterSet.count({ where: { shop } }),
    db.filter.count({ where: { filterSet: { shop } } }),
    db.filterOption.count({ where: { filter: { filterSet: { shop } } } }),
  ]);

test("snapshot canonical checksum preserves Unicode and is independent of object and positional array order", () => {
  const original = snapshot();
  const normalized = transfer.validateConfigurationSnapshot(original, shop);
  const rearranged = JSON.parse(JSON.stringify(original));
  rearranged.filterSets.reverse();
  rearranged.filterSets.forEach((set) => {
    set.filters.reverse();
    set.filters.forEach((filter) => filter.options.reverse());
  });
  assert.equal(transfer.configurationChecksum(rearranged), original.checksum);
  assert.equal(
    transfer.validateConfigurationSnapshot(rearranged, shop).checksum,
    original.checksum,
  );
  assert.deepEqual(
    normalized.filterSets.map((x) => x.id),
    ["set-a", "set-b"],
  );
  assert.deepEqual(
    normalized.filterSets[0].filters.map((x) => x.id),
    ["filter-parent", "filter-child"],
  );
  assert.equal(
    normalized.filterSets[0].filters[1].options[0].value,
    "Cumpleaños_niños",
  );
});

test("snapshot rejects a foreign shop, incomplete sets, unknown credential fields and broken relationships", () => {
  assert.throws(
    () => transfer.validateConfigurationSnapshot(snapshot(), otherShop),
    { code: "WRONG_SHOP" },
  );
  const invalid = [
    (value) => {
      value.session = { accessToken: secret };
    },
    (value) => {
      value.filterSets[0].shop = otherShop;
    },
    (value) => {
      value.exportProof.expectedSetIds = ["set-a"];
    },
    (value) => {
      value.exportProof.complete = false;
    },
    (value) => {
      value.filterSets[0].filters[0].id = "filter-parent";
    },
    (value) => {
      value.filterSets[1].filters[0].parentKey = "other_blog";
    },
    (value) => {
      value.filterSets[1].filters[0].parentValues = ["Unavailable"];
    },
    (value) => {
      value.filterSets[1].filters[0].position = 0;
    },
    (value) => {
      value.filterSets[0].filters[0].options[0].id = "option-child";
    },
    (value) => {
      value.filterSets[0].createdAt = "not-a-date";
    },
    (value) => {
      value.filterSets[0].revision = -1;
    },
    (value) => {
      value.sourceOrigin =
        "https://secret:password@nested-blog-filters.onrender.com";
    },
  ];
  for (const mutate of invalid)
    assert.throws(() =>
      transfer.validateConfigurationSnapshot(changed(mutate), shop),
    );
  const tampered = snapshot();
  tampered.filterSets[0].name = "Alterado";
  assert.throws(() => transfer.validateConfigurationSnapshot(tampered, shop), {
    code: "CHECKSUM_MISMATCH",
  });
});

test("SQLite export runs read-only and excludes sessions, foreign shops and the article index", async () => {
  const { db } = await database("source");
  const input = snapshot();
  await transfer.importConfiguration(
    db,
    input,
    shop,
    input.checksum,
    new Date(timestamp),
  );
  await db.session.create({
    data: {
      id: "offline_fixture",
      shop,
      state: "fixture",
      accessToken: secret,
    },
  });
  await db.filterSet.create({
    data: {
      id: "foreign-set",
      shop: otherShop,
      blogId: "gid://shopify/Blog/999",
      name: "Other shop private label",
    },
  });
  await db.article.create({
    data: {
      id: "legacy-local-article",
      filterSetId: "set-a",
      shopifyArticleId: "gid://shopify/Article/500",
      title: "Local index not exported",
      handle: "article",
    },
  });
  await db.articleOption.create({
    data: {
      articleId: "legacy-local-article",
      filterOptionId: "option-z",
      filterSetId: "set-a",
    },
  });
  const output = await transfer.exportConfiguration(
    db,
    shop,
    "sqlite",
    new Date(timestamp),
  );
  assert.equal(output.filterSets.length, 2);
  assert.equal(output.filterSets[0].filters[1].parentKey, "motivo");
  assert.equal(
    output.filterSets[0].filters[1].options[0].value,
    "Cumpleaños_niños",
  );
  const encoded = JSON.stringify(output);
  for (const omitted of [
    secret,
    "accessToken",
    "offline_fixture",
    "foreign-set",
    "Other shop private label",
    "legacy-local-article",
    "Local index not exported",
  ])
    assert.equal(encoded.includes(omitted), false);
  assert.equal(
    Number((await db.$queryRawUnsafe("PRAGMA query_only"))[0].query_only),
    1,
  );
  await assert.rejects(
    db.filterSet.update({
      where: { id: "set-a" },
      data: { name: "Must not write" },
    }),
  );
});

test("import restores stable IDs, values, hierarchy and available dates without touching other tenants", async () => {
  const { db } = await database("target");
  await db.filterSet.create({
    data: {
      id: "existing-other",
      shop: otherShop,
      blogId: "gid://shopify/Blog/300",
      name: "Keep this",
    },
  });
  const input = snapshot();
  const result = await transfer.importConfiguration(
    db,
    input,
    shop,
    input.checksum,
    new Date(timestamp),
  );
  assert.deepEqual([result.sets, result.filters, result.options], [2, 3, 4]);
  assert.deepEqual(await totals(db), [2, 3, 4]);
  const restored = await db.filterSet.findUnique({
    where: { id: "set-a" },
    include: {
      filters: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        include: { options: true },
      },
    },
  });
  assert.equal(restored.shop, shop);
  assert.equal(restored.revision, 7);
  assert.equal(restored.createdAt.toISOString(), timestamp);
  assert.equal(
    restored.filters[1].parentValues,
    JSON.stringify(["Celebración"]),
  );
  assert.equal(restored.filters[1].options[0].id, "option-child");
  assert.equal(
    (await db.filterSet.findUnique({ where: { id: "existing-other" } })).name,
    "Keep this",
  );
  assert.equal(await db.article.count(), 0);
  assert.equal(await db.session.count(), 0);
  await assert.rejects(
    transfer.importConfiguration(db, input, shop, input.checksum),
    { code: "DESTINATION_NOT_EMPTY" },
  );
  assert.deepEqual(await totals(db), [2, 3, 4]);
});

test("a global ID collision rolls back every newly restored set and preserves the existing tenant", async () => {
  const { db } = await database("collision");
  await db.filterSet.create({
    data: {
      id: "other-set",
      shop: otherShop,
      blogId: "gid://shopify/Blog/900",
      name: "Existing tenant",
    },
  });
  await db.filter.create({
    data: {
      id: "filter-b",
      filterSetId: "other-set",
      key: "existing",
      label: "Keep",
    },
  });
  const input = snapshot();
  await assert.rejects(
    transfer.importConfiguration(db, input, shop, input.checksum),
    { code: "IMPORT_ABORTED" },
  );
  assert.deepEqual(await totals(db), [0, 0, 0]);
  assert.equal(
    (await db.filter.findUnique({ where: { id: "filter-b" } })).filterSetId,
    "other-set",
  );
});

test("a snapshot is fully validated before opening an import transaction", async () => {
  const noDb = {
    $transaction() {
      assert.fail("Invalid transfer must not contact the database");
    },
  };
  const input = snapshot();
  await assert.rejects(
    transfer.importConfiguration(noDb, input, otherShop, input.checksum),
    { code: "WRONG_SHOP" },
  );
  await assert.rejects(
    transfer.importConfiguration(noDb, input, shop, "0".repeat(64)),
    { code: "CHECKSUM_MISMATCH" },
  );
});

test("CLI validation and dry-run import never initialize a client or accept credentials in arguments", async () => {
  const filename = path.join(directory, "configuration.json");
  const input = snapshot();
  writeFileSync(filename, JSON.stringify(input));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `postgresql://private:${secret}@unreachable.invalid/private`;
  try {
    for (const operation of ["validate", "import"]) {
      const outcome = await transfer.runConfigurationTransfer([
        operation,
        "--shop",
        shop,
        "--input",
        filename,
      ]);
      assert.equal(outcome.exitCode, 0);
      assert.equal(outcome.result.applied, false);
      assert.equal(outcome.result.destinationChecked, false);
      assert.equal(outcome.result.checksum, input.checksum);
      assert.equal(JSON.stringify(outcome).includes(secret), false);
    }
    const invalid = [
      [],
      [
        "export",
        "--shop",
        shop,
        "--database-url",
        process.env.DATABASE_URL,
        "--output",
        filename,
      ],
      ["import", "--shop", shop, "--input", filename, "--apply"],
      ["validate", "--shop", shop, "--input", filename, "--apply"],
      [
        "import",
        "--shop",
        shop,
        "--input",
        filename,
        "--apply",
        "--checksum",
        input.checksum,
      ],
    ];
    for (const args of invalid) {
      const outcome = await transfer.runConfigurationTransfer(args);
      assert.equal(outcome.exitCode, 1);
      assert.equal(JSON.stringify(outcome).includes(secret), false);
    }
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

test("production tools keep both private CLI filenames and invalid compiled invocation does not initialize runtime", async () => {
  const output = path.join(directory, "ops");
  await buildProductionTools(output);
  for (const name of [
    "verify-managed-pricing.mjs",
    "configuration-transfer.mjs",
  ])
    assert.ok(readFileSync(path.join(output, name), "utf8").length > 0);
  try {
    execFileSync(
      process.execPath,
      [path.join(output, "configuration-transfer.mjs")],
      { cwd: root, windowsHide: true, stdio: "pipe" },
    );
    assert.fail("Expected invalid argument result");
  } catch (error) {
    assert.deepEqual(JSON.parse(String(error.stdout)), {
      ok: false,
      code: "INVALID_ARGUMENTS",
    });
    assert.equal(String(error.stderr), "");
  }
});
