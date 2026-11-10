/* eslint-env node */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile, mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID, webcrypto } from "node:crypto";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const artifactRoot = resolve(root, "artifacts");
const origin = "https://nested-blog-filters.onrender.com";
const shop = "test-blog-store-weyqozsk.myshopify.com";
const apiKey = "eb3913f8d3e7dafd2231e5c920b97eb5";
const script = await readFile(
  resolve(root, "scripts/export-live-configuration.browser.js"),
  "utf8",
);
let temporaryDirectory;
let transfer;

before(async () => {
  await mkdir(artifactRoot, { recursive: true });
  temporaryDirectory = await mkdtemp(
    join(artifactRoot, "configuration-browser-test-"),
  );
  const compiled = await build({
    entryPoints: [resolve(root, "scripts/configuration-transfer.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    write: false,
    logLevel: "silent",
  });
  const filename = join(temporaryDirectory, "transfer.mjs");
  await writeFile(filename, compiled.outputFiles[0].text);
  transfer = await import(pathToFileURL(filename).href);
});

after(async () => {
  if (
    temporaryDirectory &&
    dirname(temporaryDirectory) === artifactRoot &&
    basename(temporaryDirectory).startsWith("configuration-browser-test-")
  )
    await rm(temporaryDirectory, { recursive: true, force: true });
});

function fixture() {
  return {
    id: "set_A",
    shop,
    blogId: "gid://shopify/Blog/123",
    name: "Café y celebración",
    revision: 4,
    createdAt: new Date("2026-10-21T12:00:00.000Z"),
    updatedAt: "2026-11-08T18:00:00.002Z",
    sync: null,
    accessToken: "SHOULD_NEVER_BE_EXPORTED",
    session: { password: "SHOULD_NEVER_BE_EXPORTED" },
    articles: [{ title: "NOT_A_CONFIGURATION_BACKUP" }],
    filters: [
      {
        id: "filter_B",
        key: "ocasion",
        label: "Ocasión",
        position: 2,
        source: "metafield",
        parentKey: "motivo",
        parentValues: '["fiesta"]',
        createdAt: "2026-10-21T12:00:00.000Z",
        updatedAt: "2026-10-21T12:00:00.000Z",
        options: [
          {
            id: "option_C",
            value: "navidad",
            label: "Noël <sin HTML>",
            position: 0,
            accessToken: "SHOULD_NEVER_BE_EXPORTED",
            _count: { articles: 15 },
          },
        ],
      },
      {
        id: "filter_A",
        key: "motivo",
        label: "Motivo",
        position: 0,
        source: "tag",
        parentKey: null,
        parentValues: "[]",
        options: [
          { id: "option_B", value: "fiesta", label: "Fiesta", position: 3 },
          {
            id: "option_A",
            value: "infantil",
            label: "Infantil",
            position: 0,
          },
        ],
      },
    ],
  };
}

async function execute(options = {}) {
  const sets = options.sets ?? [fixture()];
  const calls = [];
  const downloaded = [];
  const blobs = new Map();
  const timers = new Map();
  const activeKeys = new Set();
  const subscribers = new Set();
  const logs = [];
  let timerId = 0;
  let listReads = 0;
  const detailReads = new Map();
  const location = {
    origin: options.origin ?? origin,
    pathname: "/app/filters",
    search:
      "?shop=" +
      shop +
      "&host=YWRtaW4uc2hvcGlmeS5jb20&embedded=1&id_token=URL_SECRET&hmac=URL_SECRET&session=URL_SECRET",
  };
  const state = {
    location: { key: "initial-location" },
    matches: [{ route: { id: "routes/app.filters" } }],
    loaderData: {
      "routes/app": {
        apiKey: options.apiKey ?? apiKey,
        shop: options.appShop ?? shop,
        accessToken: "SHOULD_NEVER_BE_EXPORTED",
      },
    },
    navigation: { state: "idle" },
    revalidation: "idle",
    errors: null,
    fetchers: new Map(),
  };
  const router = {
    state,
    subscribe(callback) {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
    getFetcher(key) {
      activeKeys.add(key);
      return state.fetchers.get(key);
    },
    async fetch(key, routeId, href, fetchOptions) {
      calls.push({ key, routeId, href, fetchOptions });
      assert.ok(
        activeKeys.has(key),
        "retain the fetcher while reading its data",
      );
      if (options.timeout) return new Promise(() => {});
      if (options.navigate) {
        state.location.key = "different-location";
        return;
      }
      if (options.throwSecret)
        throw new Error("SHOULD_NEVER_BE_EXPORTED URL_SECRET");
      const url = new URL(href, origin);
      let data;
      if (url.pathname === "/app") {
        assert.ok(url.searchParams.has("index"));
        data = { shop: options.identityShop ?? shop };
      } else if (url.pathname === "/app/filters") {
        listReads++;
        const ids = sets.map((set) => ({ id: set.id }));
        if (options.duplicateList) ids.push(ids[0]);
        if (options.listChanges && listReads > 1) ids.pop();
        data = { sets: ids };
      } else {
        const id = decodeURIComponent(url.pathname.split("/").at(-1));
        const reads = (detailReads.get(id) ?? 0) + 1;
        detailReads.set(id, reads);
        const set = structuredClone(sets.find((value) => value.id === id));
        if (options.foreignDetail) set.shop = "other.myshopify.com";
        if (options.detailsChange && reads > 1) set.revision++;
        data = options.incomplete ? {} : { set, blog: { id: set.blogId } };
      }
      state.fetchers.set(key, { state: "idle", data });
      // React Router 7.18.2 exposes a completed fetcher's data only while
      // notifying subscribers, then removes that entry from router.state.
      for (const callback of subscribers) callback(state);
      state.fetchers.delete(key);
    },
    resetFetcher(key) {
      state.fetchers.delete(key);
    },
    deleteFetcher(key) {
      state.fetchers.delete(key);
      activeKeys.delete(key);
    },
  };
  class BrowserURL extends URL {
    static createObjectURL(blob) {
      const url = `blob:fixture/${blobs.size}`;
      blobs.set(url, blob);
      return url;
    }
    static revokeObjectURL() {}
  }
  const context = {
    window: { location, __reactRouterDataRouter: router },
    document: {
      querySelector: () => ({ content: options.apiKey ?? apiKey }),
      createElement: (tag) => {
        assert.equal(tag, "a");
        const anchor = {
          click: () =>
            downloaded.push({ href: anchor.href, name: anchor.download }),
          remove() {},
        };
        return anchor;
      },
      body: { append() {} },
    },
    crypto: { randomUUID, subtle: webcrypto.subtle },
    Blob,
    TextEncoder,
    URL: BrowserURL,
    URLSearchParams,
    console: {
      info: (...values) => logs.push(values),
      error: (...values) => logs.push(values),
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, callback);
      if (options.timeout && delay === 20_000) queueMicrotask(callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  const outcome = await runInNewContext(script, context, { timeout: 1000 });
  assert.equal(
    activeKeys.size,
    0,
    "only this export's fetchers are cleaned up",
  );
  assert.equal(state.fetchers.size, 0);
  assert.equal(subscribers.size, 0);
  const snapshot = downloaded.length
    ? JSON.parse(await blobs.get(downloaded[0].href).text())
    : null;
  return { outcome, calls, downloaded, snapshot, logs };
}

test("live configuration export preserves stable multilingual data and validates with the importer", async () => {
  const result = await execute();
  assert.equal(result.outcome.ok, true);
  assert.equal(result.downloaded.length, 1);
  const snapshot = result.snapshot;
  assert.equal(snapshot.filterSets[0].name, "Café y celebración");
  assert.deepEqual(
    snapshot.filterSets[0].filters.map((filter) => filter.id),
    ["filter_A", "filter_B"],
  );
  assert.deepEqual(snapshot.filterSets[0].filters[1].parentValues, ["fiesta"]);
  assert.equal(
    snapshot.filterSets[0].filters[1].options[0].label,
    "Noël <sin HTML>",
  );
  assert.equal(snapshot.filterSets[0].createdAt, "2026-10-21T12:00:00.000Z");
  assert.equal(
    snapshot.checksum,
    await transfer.configurationChecksum(snapshot),
  );
  assert.doesNotThrow(() =>
    transfer.validateConfigurationSnapshot(snapshot, shop),
  );
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    "SHOULD_NEVER_BE_EXPORTED",
    "NOT_A_CONFIGURATION_BACKUP",
    "URL_SECRET",
    "accessToken",
    "_count",
    '"articles"',
  ])
    assert.ok(!serialized.includes(forbidden), forbidden);
  for (const call of result.calls) {
    assert.equal(call.routeId, "routes/app.filters");
    assert.deepEqual(Object.keys(call.fetchOptions), ["preventScrollReset"]);
    assert.ok(!call.href.includes("URL_SECRET"));
    assert.ok(!/[?&](id_token|hmac|session)=/.test(call.href));
  }
});

test("an authenticated empty configuration is exported with proof, never from a missing identity", async () => {
  const empty = await execute({ sets: [] });
  assert.equal(empty.outcome.ok, true);
  assert.deepEqual(empty.snapshot.filterSets, []);
  assert.deepEqual(empty.snapshot.exportProof, {
    complete: true,
    expectedSetIds: [],
  });
  assert.doesNotThrow(() =>
    transfer.validateConfigurationSnapshot(empty.snapshot, shop),
  );
  const wrong = await execute({
    sets: [],
    identityShop: "other.myshopify.com",
  });
  assert.equal(wrong.outcome.code, "WRONG_SHOP");
  assert.equal(wrong.downloaded.length, 0);
});

test("wrong app, origin and shop stop before any loader request", async () => {
  for (const options of [
    { origin: "https://admin.shopify.com" },
    { apiKey: "another-app" },
    { appShop: "other.myshopify.com" },
  ]) {
    const result = await execute(options);
    assert.equal(result.outcome.ok, false);
    assert.equal(result.calls.length, 0);
    assert.equal(result.downloaded.length, 0);
  }
});

test("foreign, duplicate or incomplete saved records never produce a partial backup", async () => {
  for (const options of [
    { foreignDetail: true },
    { duplicateList: true },
    { incomplete: true },
  ]) {
    const result = await execute(options);
    assert.equal(result.outcome.ok, false);
    assert.equal(result.downloaded.length, 0);
  }
});

test("changes to the set list or saved revision invalidate the snapshot", async () => {
  for (const options of [{ listChanges: true }, { detailsChange: true }]) {
    const result = await execute(options);
    assert.equal(result.outcome.code, "CONFIGURATIONS_CHANGED");
    assert.equal(result.downloaded.length, 0);
  }
});

test("request timeouts and navigation abort downloads and release fetchers", async () => {
  const timeout = await execute({ timeout: true });
  assert.equal(timeout.outcome.code, "REQUEST_TIMEOUT");
  assert.equal(timeout.downloaded.length, 0);
  const navigation = await execute({ navigate: true });
  assert.equal(navigation.outcome.code, "APP_CHANGED_OR_REQUIRES_LOGIN");
  assert.equal(navigation.downloaded.length, 0);
});

test("unexpected SDK failures do not disclose their body, URL or credentials", async () => {
  const result = await execute({ throwSecret: true });
  assert.equal(result.outcome.code, "EXPORT_FAILED");
  assert.equal(result.downloaded.length, 0);
  const logs = JSON.stringify(result.logs);
  assert.ok(!logs.includes("SHOULD_NEVER_BE_EXPORTED"));
  assert.ok(!logs.includes("URL_SECRET"));
});
