/* eslint-env node */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const secret = "local-webhook-test-secret";
const environment = Object.fromEntries(
  ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL"].map((key) => [
    key,
    process.env[key],
  ]),
);
let directory, db, vite, route, legacy, originalFetch;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-webhooks-"));
  cpSync(
    path.join(root, "prisma/migrations"),
    path.join(directory, "migrations"),
    {
      recursive: true,
    },
  );
  writeFileSync(
    path.join(directory, "schema.prisma"),
    readFileSync(path.join(root, "prisma/schema.prisma")),
  );
  writeFileSync(path.join(directory, "dev.sqlite"), "");
  const databaseUrl = `file:${path.join(directory, "dev.sqlite").replaceAll("\\", "/")}`;
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules/prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      path.join(directory, "schema.prisma"),
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
  db = new PrismaClient({
    datasourceUrl: databaseUrl,
  });
  global.__nbfPrivacyWebhookTestDb = db;
  process.env.SHOPIFY_API_KEY = "local-webhook-test-key";
  process.env.SHOPIFY_API_SECRET = secret;
  process.env.SHOPIFY_APP_URL = "https://webhooks.example.com";
  let isolatedDatabaseUsed = false;
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    plugins: [
      {
        name: "isolated-webhook-database",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            id === "../db.server" &&
            importer
              ?.replaceAll("\\", "/")
              .endsWith("/app/routes/api.webhooks.tsx")
          ) {
            return "\0webhook-test-db";
          }
        },
        load(id) {
          if (id === "\0webhook-test-db") {
            isolatedDatabaseUsed = true;
            return "export default globalThis.__nbfPrivacyWebhookTestDb;";
          }
        },
      },
    ],
    server: {
      middlewareMode: true,
      watch: null,
      hmr: { server: createHttpServer() },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  originalFetch = global.fetch;
  global.fetch = () => {
    throw new Error("Privacy webhooks must not refresh tokens or call Shopify");
  };
  route = await vite.ssrLoadModule("/app/routes/api.webhooks.tsx");
  legacy = await vite.ssrLoadModule("/app/routes/webhooks.app.uninstalled.tsx");
  assert.ok(
    isolatedDatabaseUsed,
    "the route must never use development SQLite",
  );
});

after(async () => {
  if (originalFetch) global.fetch = originalFetch;
  await vite?.close();
  await db?.$disconnect();
  delete global.__nbfPrivacyWebhookTestDb;
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-webhooks-")
  ) {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function seed(shop) {
  for (const index of [1, 2]) {
    const id = `${shop}-${index}`;
    await db.filterSet.create({
      data: { id, shop, blogId: `gid://shopify/Blog/${index}`, name: "Prueba" },
    });
    await db.filter.create({
      data: { id, filterSetId: id, key: "motivo", label: "Motivo" },
    });
    await db.filterOption.create({
      data: {
        id,
        filterId: id,
        filterSetId: id,
        value: "floral",
        label: "Floral",
      },
    });
    await db.article.create({
      data: {
        id,
        filterSetId: id,
        shopifyArticleId: `gid://shopify/Article/${index}`,
        title: "Artículo de prueba",
        handle: `article-${index}`,
      },
    });
    await db.articleOption.create({
      data: { articleId: id, filterOptionId: id, filterSetId: id },
    });
    await db.articleSync.create({ data: { filterSetId: id } });
  }
  await db.session.createMany({
    data: [
      {
        id: `offline_${shop}`,
        shop,
        state: "test",
        isOnline: false,
        accessToken: "revoked-test-token",
        expires: new Date("2020-01-01"),
        refreshToken: "revoked-test-refresh-token",
      },
      {
        id: `online_${shop}`,
        shop,
        state: "test",
        isOnline: true,
        accessToken: "test-online-token",
      },
    ],
  });
}

function counts(shop) {
  const where = { filterSetId: { in: [`${shop}-1`, `${shop}-2`] } };
  return db.$transaction([
    db.session.count({ where: { shop } }),
    db.filterSet.count({ where: { shop } }),
    db.filter.count({ where }),
    db.filterOption.count({ where }),
    db.article.count({ where }),
    db.articleOption.count({ where }),
    db.articleSync.count({ where }),
  ]);
}

function request(
  topic,
  shop,
  { payload, body, signature, method = "POST" } = {},
) {
  const rawBody =
    body ??
    JSON.stringify(payload ?? { myshopify_domain: shop, shop_domain: shop });
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Topic": topic,
    "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Api-Version": "2026-10",
    "X-Shopify-Webhook-Id": randomUUID(),
    "X-Shopify-Hmac-Sha256":
      signature ??
      createHmac("sha256", secret).update(rawBody).digest("base64"),
  };
  return new Request("https://webhooks.example.com/api/webhooks", {
    method,
    headers,
    body: rawBody,
  });
}

async function ok(response) {
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.equal(response.headers.get("set-cookie"), null);
}

for (const topic of ["app/uninstalled", "shop/redact"]) {
  test(`${topic} erases only the authenticated shop, cascades and accepts retries without a token`, async () => {
    const shop = `${topic.replace("/", "-")}.myshopify.com`;
    const other = `other-${shop}`;
    await seed(shop);
    await seed(other);
    await ok(await route.action({ request: request(topic, shop) }));
    assert.deepEqual(await counts(shop), [0, 0, 0, 0, 0, 0, 0]);
    assert.deepEqual(await counts(other), [2, 2, 2, 2, 2, 2, 2]);
    await ok(await route.action({ request: request(topic, shop) }));
  });
}

test("uninstall cleans configurations even when no session remains", async () => {
  const shop = "sessionless.myshopify.com";
  await seed(shop);
  await db.session.deleteMany({ where: { shop } });
  await ok(await route.action({ request: request("app/uninstalled", shop) }));
  assert.deepEqual(await counts(shop), [0, 0, 0, 0, 0, 0, 0]);
});

for (const topic of ["customers/data_request", "customers/redact"]) {
  test(`${topic} returns an empty 200 without storing customer data or changing blog data`, async () => {
    const shop = `${topic.replaceAll("/", "-").replaceAll("_", "-")}.myshopify.com`;
    await seed(shop);
    const payload = {
      shop_domain: shop,
      customer: { id: 123, email: "customer@example.com" },
      data_request: { id: 456 },
    };
    await ok(
      await route.action({ request: request(topic, shop, { payload }) }),
    );
    assert.deepEqual(await counts(shop), [2, 2, 2, 2, 2, 2, 2]);
  });
}

test("missing, forged and altered-body HMACs are rejected before deleting data", async () => {
  const shop = "unauthorized.myshopify.com";
  await seed(shop);
  for (const topic of [
    "app/uninstalled",
    "customers/data_request",
    "customers/redact",
    "shop/redact",
  ]) {
    const missing = request(topic, shop);
    missing.headers.delete("X-Shopify-Hmac-Sha256");
    const altered = request(topic, shop, {
      signature: createHmac("sha256", secret).update("{}").digest("base64"),
    });
    for (const input of [
      missing,
      altered,
      request(topic, shop, { signature: "invalid-hmac" }),
    ]) {
      const response = await route.action({ request: input });
      assert.equal(response.status, 401);
      assert.equal(await response.text(), "");
    }
  }
  assert.deepEqual(await counts(shop), [2, 2, 2, 2, 2, 2, 2]);
});

test("destructive topics reject a shop header that differs from the signed payload", async () => {
  const shop = "mismatched.myshopify.com";
  await seed(shop);
  for (const topic of ["app/uninstalled", "shop/redact"]) {
    const response = await route.action({
      request: request(topic, shop, {
        payload: {
          myshopify_domain: "other.myshopify.com",
          shop_domain: "other.myshopify.com",
        },
      }),
    });
    assert.equal(response.status, 400);
  }
  assert.deepEqual(await counts(shop), [2, 2, 2, 2, 2, 2, 2]);
});

test("signed malformed JSON and unsupported topics do not erase data", async () => {
  const shop = "malformed.myshopify.com";
  await seed(shop);
  for (const body of ["{broken", "null", "[]", "{}"])
    assert.equal(
      (await route.action({ request: request("shop/redact", shop, { body }) }))
        .status,
      400,
    );
  assert.equal(
    (await route.action({ request: request("products/update", shop) })).status,
    404,
  );
  assert.deepEqual(await counts(shop), [2, 2, 2, 2, 2, 2, 2]);
});

test("failed cleanup rolls back and is not acknowledged as success", async () => {
  const shop = "rollback.myshopify.com";
  await seed(shop);
  await db.$executeRawUnsafe(
    "CREATE TRIGGER fail_session_cleanup BEFORE DELETE ON Session BEGIN SELECT RAISE(ABORT, 'simulated cleanup failure'); END;",
  );
  try {
    await assert.rejects(
      route.action({ request: request("shop/redact", shop) }),
    );
    assert.deepEqual(await counts(shop), [2, 2, 2, 2, 2, 2, 2]);
  } finally {
    await db.$executeRawUnsafe("DROP TRIGGER fail_session_cleanup;");
  }
  await ok(await route.action({ request: request("shop/redact", shop) }));
});

test("legacy uninstall endpoint shares authenticated cleanup and non-POST requests receive 405", async () => {
  const shop = "legacy.myshopify.com";
  await seed(shop);
  await ok(await legacy.action({ request: request("app/uninstalled", shop) }));
  assert.deepEqual(await counts(shop), [0, 0, 0, 0, 0, 0, 0]);
  for (const response of [
    route.loader(),
    await route.action({
      request: request("shop/redact", shop, { method: "PUT" }),
    }),
  ]) {
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("Allow"), "POST");
  }
});
