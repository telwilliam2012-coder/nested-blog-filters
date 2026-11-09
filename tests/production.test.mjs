/* eslint-env node */
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import {
  getShopifyAppUrl,
  productionSettings,
} from "../scripts/runtime-config.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), "nbf-production-"));
const databasePath = path.join(directory, "dev.sqlite");
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const fixtureEnv = {
  ...process.env,
  NODE_ENV: "production",
  SHOPIFY_APP_URL: "https://production-fixture.onrender.com",
  SHOPIFY_API_KEY: "production-fixture-api-key",
  SHOPIFY_API_SECRET: "production-fixture-api-secret",
  SHOPIFY_BILLING_MODE: "managed",
  SHOPIFY_BILLING_TEST: "false",
  SCOPES: "read_content",
  DATABASE_URL: databaseUrl,
  HOST: "127.0.0.1",
  PORT: "3000",
};
const execute = promisify(execFile);
const children = new Set();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function unusedPort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    children.delete(child);
    return;
  }
  // Every PID here was created by this test. Do not target any other dev server.
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if (process.platform === "win32") {
    await execute("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      windowsHide: true,
    });
  } else {
    process.kill(-child.pid, "SIGTERM");
  }
  let timeout;
  try {
    await Promise.race([
      exited,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("The fixture server did not stop")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  children.delete(child);
}

async function start() {
  assert.ok(
    existsSync(path.join(root, "build/server/index.js")),
    "Build the production app before running this integration test",
  );
  const port = await unusedPort();
  const child = spawn(process.execPath, ["scripts/start-production.mjs"], {
    cwd: root,
    env: { ...fixtureEnv, PORT: String(port) },
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let output = "";
  child.stdout.on("data", (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  child.stderr.on("data", (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  const origin = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Production fixture exited before listening: ${output}`);
    }
    try {
      const response = await fetch(origin + "/privacy", {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 200)
        return { child, origin, response, output: () => output };
      await response.body?.cancel();
    } catch {
      /* Startup includes applying the real migration history. */
    }
    await delay(100);
  }
  throw new Error(`Production fixture did not become ready: ${output}`);
}

after(async () => {
  for (const child of children) await stop(child);
  if (
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-production-")
  )
    rmSync(directory, { recursive: true, force: true });
});

test("production settings require a stable origin, secrets and an absolute persistent SQLite path", () => {
  assert.equal(
    getShopifyAppUrl({
      ...fixtureEnv,
      SHOPIFY_APP_URL: fixtureEnv.SHOPIFY_APP_URL + "/",
    }),
    fixtureEnv.SHOPIFY_APP_URL,
  );
  for (const url of [
    undefined,
    "",
    "http://production-fixture.onrender.com",
    "https://trycloudflare.com",
    "https://temporary.trycloudflare.com",
    "https://production-fixture.onrender.com/app",
    "https://production-fixture.onrender.com?x=1",
  ]) {
    assert.throws(
      () => getShopifyAppUrl({ ...fixtureEnv, SHOPIFY_APP_URL: url }),
      /SHOPIFY_APP_URL/,
    );
  }
  for (const name of [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "DATABASE_URL",
  ]) {
    assert.throws(
      () => productionSettings({ ...fixtureEnv, [name]: "" }),
      new RegExp(name),
    );
  }
  for (const url of [
    "file:dev.sqlite",
    "file:./data/dev.sqlite",
    "postgresql://localhost/database",
  ]) {
    assert.throws(
      () => productionSettings({ ...fixtureEnv, DATABASE_URL: url }),
      /absolute SQLite path/,
    );
  }
  const defaults = productionSettings({
    ...fixtureEnv,
    HOST: undefined,
    PORT: undefined,
  });
  assert.equal(defaults.host, "0.0.0.0");
  assert.equal(defaults.port, "3000");
  const custom = productionSettings({ ...fixtureEnv, PORT: "43123" });
  assert.equal(custom.host, "127.0.0.1");
  assert.equal(custom.port, "43123");
  assert.equal(custom.databasePath, databasePath.replaceAll("\\", "/"));
  for (const port of ["0", "65536", "not-a-port"]) {
    assert.throws(
      () => productionSettings({ ...fixtureEnv, PORT: port }),
      /PORT/,
    );
  }
});

test(
  "production startup migrates a fresh SQLite file and preserves data across restarts",
  { timeout: 90000 },
  async () => {
    let running;
    let db;
    try {
      running = await start();
      assert.match(running.response.headers.get("content-type"), /text\/html/);
      const privacyHtml = await running.response.text();
      assert.match(privacyHtml, /Privacy Policy/);
      assert.match(privacyHtml, /PostgreSQL/);
      assert.match(running.output(), /Applying database migrations/);
      db = new PrismaClient({ datasourceUrl: databaseUrl });
      assert.equal(
        await db.session.count(),
        0,
        "the Session migration must have run",
      );
      const record = await db.filterSet.create({
        data: {
          shop: "production-fixture.myshopify.com",
          blogId: "gid://shopify/Blog/999",
          name: "Survives a restart",
        },
      });
      await db.$disconnect();
      db = undefined;
      await stop(running.child);
      running = undefined;
      running = await start();
      await running.response.body?.cancel();
      db = new PrismaClient({ datasourceUrl: databaseUrl });
      assert.equal(
        (await db.filterSet.findUnique({ where: { id: record.id } })).name,
        "Survives a restart",
      );
      assert.match(running.output(), /No pending migrations/);
    } finally {
      await db?.$disconnect();
      if (running) await stop(running.child);
    }
  },
);

test(
  "SQLite backup contains committed WAL data and refuses to overwrite an existing snapshot",
  { timeout: 45000 },
  async () => {
    const destination = path.join(directory, "snapshot.sqlite");
    const source = new PrismaClient({ datasourceUrl: databaseUrl });
    let snapshot;
    try {
      await source.$queryRawUnsafe("PRAGMA journal_mode=WAL");
      const record = await source.filterSet.create({
        data: {
          shop: "backup-fixture.myshopify.com",
          blogId: "gid://shopify/Blog/1000",
          name: "Committed in WAL",
        },
      });
      assert.ok(
        statSync(databasePath + "-wal").size > 0,
        "the snapshot must include committed WAL data",
      );
      await execute(
        process.execPath,
        ["scripts/backup-sqlite.mjs", destination],
        { cwd: root, env: fixtureEnv, timeout: 30000, windowsHide: true },
      );
      snapshot = new PrismaClient({
        datasourceUrl: `file:${destination.replaceAll("\\", "/")}`,
      });
      assert.equal(
        (await snapshot.filterSet.findUnique({ where: { id: record.id } }))
          .name,
        "Committed in WAL",
      );
      await snapshot.$disconnect();
      snapshot = undefined;
      const digest = () =>
        createHash("sha256").update(readFileSync(destination)).digest("hex");
      const before = digest();
      await assert.rejects(
        execute(process.execPath, ["scripts/backup-sqlite.mjs", destination], {
          cwd: root,
          env: fixtureEnv,
          timeout: 30000,
          windowsHide: true,
        }),
        (error) => error.code === 1 && /already exists/.test(error.stderr),
      );
      assert.equal(digest(), before);
    } finally {
      await snapshot?.$disconnect();
      await source.$disconnect();
    }
  },
);
