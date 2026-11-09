/* eslint-env node */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { PrismaClient } from "@prisma/client";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const shop = "analytics-alpha.myshopify.com";
const now = new Date("2026-11-07T18:00:00.000Z");
let directory, db, vite, analytics;

function event(overrides = {}) {
  return {
    blogId: "gid://shopify/Blog/1",
    pageId: randomUUID(),
    eventId: randomUUID(),
    event: "view",
    consent: true,
    ...overrides,
  };
}
function request(payload, method = "POST") {
  return new Request("https://store.invalid/apps/nested-filters/events", {
    method,
    ...(method === "POST"
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {}),
  });
}
const authenticated = async () => ({ session: { shop }, admin: {} });
const premium = async () => ({ analytics: true });

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-analytics-"));
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
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
  db = new PrismaClient({ datasourceUrl: databaseUrl });
  global.__nbfAnalyticsTestDb = db;
  vite = await createServer({
    root,
    configFile: false,
    envDir: directory,
    logLevel: "silent",
    plugins: [
      {
        name: "isolated-analytics-db",
        enforce: "pre",
        resolveId(id, importer) {
          if (
            id === "../db.server" &&
            importer
              ?.replaceAll("\\", "/")
              .endsWith("/app/services/analytics.server.ts")
          )
            return "\0analytics-test-db";
        },
        load(id) {
          if (id === "\0analytics-test-db")
            return "export default globalThis.__nbfAnalyticsTestDb;";
        },
      },
    ],
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  analytics = await vite.ssrLoadModule("/app/services/analytics.server.ts");
  await db.filterSet.createMany({
    data: [
      {
        id: "analytics-main",
        shop,
        blogId: "gid://shopify/Blog/1",
        name: "Main",
      },
      {
        id: "analytics-second",
        shop,
        blogId: "gid://shopify/Blog/2",
        name: "Second",
      },
      {
        id: "analytics-foreign",
        shop: "analytics-beta.myshopify.com",
        blogId: "gid://shopify/Blog/9",
        name: "Foreign",
      },
    ],
  });
  await db.filter.createMany({
    data: [
      {
        id: "analytics-category",
        filterSetId: "analytics-main",
        key: "category",
        label: "Category",
        source: "tag",
      },
      {
        id: "analytics-occasion",
        filterSetId: "analytics-main",
        key: "occasion",
        label: "Occasion",
      },
      {
        id: "analytics-second-category",
        filterSetId: "analytics-second",
        key: "category",
        label: "Second category",
      },
      {
        id: "analytics-foreign-category",
        filterSetId: "analytics-foreign",
        key: "category",
        label: "Foreign category",
      },
    ],
  });
});

beforeEach(async () => {
  await db.analyticsReceipt.deleteMany();
  await db.analyticsDaily.deleteMany();
  await db.filterUsageDaily.deleteMany();
});

after(async () => {
  await vite?.close();
  await db?.$disconnect();
  delete global.__nbfAnalyticsTestDb;
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-analytics-")
  )
    rmSync(directory, { recursive: true, force: true });
});

test("records aggregate metrics and deduplicates views and event retries", async () => {
  const view = event();
  assert.equal(
    await analytics.recordAnalyticsEvent(shop, view, db, now),
    "recorded",
  );
  assert.equal(
    await analytics.recordAnalyticsEvent(
      shop,
      { ...view, eventId: randomUUID() },
      db,
      now,
    ),
    "duplicate",
  );
  const filter = event({ pageId: view.pageId, event: "filter" });
  await analytics.recordAnalyticsEvent(shop, filter, db, now);
  assert.equal(
    await analytics.recordAnalyticsEvent(shop, filter, db, now),
    "duplicate",
  );
  await analytics.recordAnalyticsEvent(
    shop,
    event({ pageId: view.pageId, event: "search" }),
    db,
    now,
  );
  const report = await analytics.getAnalyticsReport(shop, { days: 7 }, db, now);
  assert.deepEqual(report.totals, {
    pageViews: 1,
    filterInteractions: 1,
    searchSubmissions: 1,
  });
  assert.equal(report.daily.length, 7);
  assert.deepEqual(report.daily[0], {
    day: "2026-11-01",
    pageViews: 0,
    filterInteractions: 0,
    searchSubmissions: 0,
  });
  assert.equal(report.availableFrom, "2026-11-07");
  assert.deepEqual(report.topFilters, []);
  assert.equal(report.filterUsageAvailableFrom, null);
  const receipt = await db.analyticsReceipt.findFirst();
  assert.equal(receipt.pageHash.length, 64);
  assert.ok(!JSON.stringify(receipt).includes(view.pageId));
});

test("ranks attributed filter interactions by tenant, blog and period without inventing legacy usage", async () => {
  for (let index = 0; index < 3; index++) {
    await analytics.recordAnalyticsEvent(
      shop,
      event({ event: "filter", filterId: "analytics-category" }),
      db,
      now,
    );
  }
  for (let index = 0; index < 2; index++) {
    await analytics.recordAnalyticsEvent(
      shop,
      event({ event: "filter", filterId: "analytics-occasion" }),
      db,
      now,
    );
  }
  // Legacy clients and clear-all actions still update the aggregate only.
  await analytics.recordAnalyticsEvent(
    shop,
    event({ event: "filter" }),
    db,
    now,
  );
  await analytics.recordAnalyticsEvent(
    shop,
    event({
      event: "filter",
      blogId: "gid://shopify/Blog/2",
      filterId: "analytics-second-category",
    }),
    db,
    now,
  );
  await analytics.recordAnalyticsEvent(
    "analytics-beta.myshopify.com",
    event({
      event: "filter",
      blogId: "gid://shopify/Blog/9",
      filterId: "analytics-foreign-category",
    }),
    db,
    now,
  );
  await db.filter.update({
    where: { id: "analytics-category" },
    data: { label: "Renamed category" },
  });
  const report = await analytics.getAnalyticsReport(
    shop,
    { days: 7, filterSetId: "analytics-main" },
    db,
    now,
  );
  assert.equal(report.totals.filterInteractions, 6);
  assert.deepEqual(report.topFilters, [
    {
      filterId: "analytics-category",
      filterKey: "category",
      filterLabel: "Renamed category",
      filterSetId: "analytics-main",
      filterSetName: "Main",
      blogId: "gid://shopify/Blog/1",
      interactions: 3,
    },
    {
      filterId: "analytics-occasion",
      filterKey: "occasion",
      filterLabel: "Occasion",
      filterSetId: "analytics-main",
      filterSetName: "Main",
      blogId: "gid://shopify/Blog/1",
      interactions: 2,
    },
  ]);
  assert.equal(report.filterUsageAvailableFrom, "2026-11-07");
  const nextWeek = await analytics.getAnalyticsReport(
    shop,
    { days: 7, filterSetId: "analytics-main" },
    db,
    new Date("2026-11-15T18:00:00Z"),
  );
  assert.deepEqual(nextWeek.topFilters, []);
  assert.equal(nextWeek.filterUsageAvailableFrom, "2026-11-07");
});

test("replayed attributed events cannot be moved to another filter or duplicated", async () => {
  const first = event({ event: "filter", filterId: "analytics-category" });
  assert.equal(
    await analytics.recordAnalyticsEvent(shop, first, db, now),
    "recorded",
  );
  assert.equal(
    await analytics.recordAnalyticsEvent(shop, first, db, now),
    "duplicate",
  );
  assert.equal(
    await analytics.recordAnalyticsEvent(
      shop,
      { ...first, filterId: "analytics-occasion" },
      db,
      now,
    ),
    "duplicate",
  );
  assert.equal((await db.analyticsDaily.findFirst()).filterInteractions, 1);
  const rows = await db.filterUsageDaily.findMany();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].filterId, "analytics-category");
  assert.equal(rows[0].interactions, 1);
});

test("attributed filter IDs must belong to the authenticated store and selected blog", async () => {
  for (const filterId of [
    "analytics-foreign-category",
    "analytics-second-category",
    "ANALYTICS-CATEGORY",
    "unknown-filter",
  ]) {
    await assert.rejects(
      () =>
        analytics.recordAnalyticsEvent(
          shop,
          event({ event: "filter", filterId }),
          db,
          now,
        ),
      (error) => error.status === 400,
    );
  }
  assert.equal(await db.analyticsReceipt.count(), 0);
  assert.equal(await db.analyticsDaily.count(), 0);
  assert.equal(await db.filterUsageDaily.count(), 0);
  await assert.rejects(
    () =>
      db.filterUsageDaily.create({
        data: {
          filterId: "analytics-category",
          filterSetId: "analytics-second",
          day: "2026-11-07",
          interactions: 1,
        },
      }),
    (error) => error.code === "P2003",
  );
});

test("parallel attributed events increment both daily totals and rankings atomically", async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      analytics.recordAnalyticsEvent(
        shop,
        event({ event: "filter", filterId: "analytics-category" }),
        db,
        now,
      ),
    ),
  );
  assert.ok(results.every((result) => result === "recorded"));
  assert.equal((await db.analyticsDaily.findFirst()).filterInteractions, 4);
  assert.equal((await db.filterUsageDaily.findFirst()).interactions, 4);
  assert.equal(await db.analyticsReceipt.count(), 4);
});

test("ranking returns at most ten filters and respects a selected blog", async () => {
  const sets = Array.from({ length: 12 }, (_, index) => ({
    id: `ranking-limit-set-${index}`,
    shop,
    blogId: `gid://shopify/Blog/${100 + index}`,
    name: `Ranking blog ${index}`,
  }));
  try {
    await db.filterSet.createMany({ data: sets });
    await db.filter.createMany({
      data: sets.map((set, index) => ({
        id: `ranking-limit-filter-${index}`,
        filterSetId: set.id,
        key: "category",
        label: `Ranking filter ${index}`,
      })),
    });
    await db.analyticsDaily.createMany({
      data: sets.map((set, index) => ({
        filterSetId: set.id,
        day: "2026-11-07",
        filterInteractions: index + 1,
      })),
    });
    await db.filterUsageDaily.createMany({
      data: sets.map((set, index) => ({
        filterId: `ranking-limit-filter-${index}`,
        filterSetId: set.id,
        day: "2026-11-07",
        interactions: index + 1,
      })),
    });
    const report = await analytics.getAnalyticsReport(
      shop,
      { days: 7 },
      db,
      now,
    );
    assert.equal(report.topFilters.length, 10);
    assert.equal(report.topFilters[0].interactions, 12);
    assert.equal(report.topFilters[9].interactions, 3);
    const selected = await analytics.getAnalyticsReport(
      shop,
      { days: 7, filterSetId: sets[0].id },
      db,
      now,
    );
    assert.equal(selected.topFilters.length, 1);
    assert.equal(selected.topFilters[0].filterId, "ranking-limit-filter-0");
  } finally {
    await db.filterSet.deleteMany({
      where: { id: { startsWith: "ranking-limit-set-" } },
    });
  }
});

test("signed Premium access is required; provider failures and invalid payloads never write", async () => {
  let authCalls = 0;
  const auth = async () => {
    authCalls++;
    return authenticated();
  };
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(null, "GET"),
        auth,
        premium,
        db,
        now,
      )
    ).status,
    405,
  );
  assert.equal(authCalls, 0);
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(event()),
        async () => {
          throw new Response(null, { status: 403 });
        },
        premium,
        db,
        now,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(event()),
        authenticated,
        async () => ({ analytics: false }),
        db,
        now,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(event()),
        authenticated,
        async () => null,
        db,
        now,
      )
    ).status,
    204,
  );
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(event()),
        authenticated,
        async () => {
          throw new Error("Provider unavailable");
        },
        db,
        now,
      )
    ).status,
    503,
  );
  for (const payload of [
    event({ consent: false }),
    event({ query: "sensitive text" }),
    event({ pageId: "persistent-person-id" }),
    event({ blogId: "1" }),
    event({ filterId: "analytics-category" }),
    event({ event: "search", filterId: "analytics-category" }),
    event({ event: "filter", filterId: "" }),
    event({
      event: "filter",
      filterId: "analytics-category",
      filterLabel: "Client supplied label",
    }),
  ]) {
    assert.equal(
      (
        await analytics.handleAnalyticsRequest(
          request(payload),
          authenticated,
          premium,
          db,
          now,
        )
      ).status,
      400,
    );
  }
  const oversized = new Request(
    "https://store.invalid/apps/nested-filters/events",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(1025),
    },
  );
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        oversized,
        authenticated,
        premium,
        db,
        now,
      )
    ).status,
    400,
  );
  assert.equal(await db.analyticsDaily.count(), 0);
  assert.equal(await db.analyticsReceipt.count(), 0);
  assert.equal(
    (
      await analytics.handleAnalyticsRequest(
        request(event()),
        authenticated,
        premium,
        db,
        now,
      )
    ).status,
    204,
  );
  assert.equal(await db.analyticsDaily.count(), 1);
});

test("plan verification receives the authenticated shop rather than a client shop claim", async () => {
  const claimed = request(event());
  const signedRequest = new Request(
    claimed.url + "?shop=forged.myshopify.com",
    claimed,
  );
  const calls = [];
  const response = await analytics.handleAnalyticsRequest(
    signedRequest,
    authenticated,
    async (admin, expectedShop) => {
      calls.push({ admin, expectedShop });
      return { analytics: true };
    },
    db,
    now,
  );
  assert.equal(response.status, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedShop, shop);
});

test("distinct simultaneous events are retained and a daily-row unique race is retried", async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      analytics.recordAnalyticsEvent(shop, event(), db, now),
    ),
  );
  assert.ok(results.every((result) => result === "recorded"));
  assert.equal((await db.analyticsDaily.findFirst()).pageViews, 4);
  assert.equal(await db.analyticsReceipt.count(), 4);

  let simulateDailyRace = true;
  const racingDb = new Proxy(db, {
    get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return (operation, options) => {
        if (typeof operation !== "function")
          return target.$transaction(operation, options);
        return target.$transaction(
          (tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, model) {
                  if (model !== "analyticsDaily")
                    return Reflect.get(transaction, model);
                  return new Proxy(transaction.analyticsDaily, {
                    get(daily, method) {
                      if (method !== "upsert")
                        return Reflect.get(daily, method);
                      return (args) => {
                        if (simulateDailyRace) {
                          simulateDailyRace = false;
                          throw Object.assign(
                            new Error("Simulated concurrent daily create"),
                            { code: "P2002" },
                          );
                        }
                        return daily.upsert(args);
                      };
                    },
                  });
                },
              }),
            ),
          options,
        );
      };
    },
  });
  assert.equal(
    await analytics.recordAnalyticsEvent(shop, event(), racingDb, now),
    "recorded",
  );
  assert.equal((await db.analyticsDaily.findFirst()).pageViews, 5);
  assert.equal(await db.analyticsReceipt.count(), 5);
});

test("tenant isolation applies to ingestion and filtered reports", async () => {
  assert.equal(
    await analytics.recordAnalyticsEvent(
      shop,
      event({ blogId: "gid://shopify/Blog/9" }),
      db,
      now,
    ),
    "unconfigured",
  );
  await analytics.recordAnalyticsEvent(
    "analytics-beta.myshopify.com",
    event({ blogId: "gid://shopify/Blog/9" }),
    db,
    now,
  );
  await analytics.recordAnalyticsEvent(shop, event(), db, now);
  await analytics.recordAnalyticsEvent(
    shop,
    event({ blogId: "gid://shopify/Blog/2" }),
    db,
    now,
  );
  const report = await analytics.getAnalyticsReport(
    shop,
    { days: 30, filterSetId: "analytics-second" },
    db,
    now,
  );
  assert.equal(report.totals.pageViews, 1);
  assert.equal(report.blogs.length, 2);
  assert.ok(!report.blogs.some((blog) => blog.id === "analytics-foreign"));
  await assert.rejects(
    () =>
      analytics.getAnalyticsReport(
        shop,
        { filterSetId: "analytics-foreign" },
        db,
        now,
      ),
    (error) => error.status === 404,
  );
  await assert.rejects(
    () => analytics.getAnalyticsReport(shop, { days: 365 }, db, now),
    (error) => error.status === 400,
  );
});

test("retention keeps 90 UTC days of totals and two days of anonymous receipts", async () => {
  await db.analyticsDaily.createMany({
    data: [
      { filterSetId: "analytics-main", day: "2026-08-09", pageViews: 5 },
      { filterSetId: "analytics-main", day: "2026-08-10", pageViews: 6 },
    ],
  });
  await db.analyticsReceipt.createMany({
    data: [
      {
        id: "expired-receipt",
        filterSetId: "analytics-main",
        day: "2026-11-05",
        pageHash: "x",
        kind: "view",
      },
      {
        id: "retained-receipt",
        filterSetId: "analytics-main",
        day: "2026-11-06",
        pageHash: "y",
        kind: "view",
      },
    ],
  });
  await db.filterUsageDaily.createMany({
    data: [
      {
        filterId: "analytics-category",
        filterSetId: "analytics-main",
        day: "2026-08-09",
        interactions: 5,
      },
      {
        filterId: "analytics-category",
        filterSetId: "analytics-main",
        day: "2026-08-10",
        interactions: 6,
      },
    ],
  });
  await analytics.purgeExpiredAnalytics(db, now);
  assert.deepEqual(
    (await db.analyticsDaily.findMany()).map((row) => row.day),
    ["2026-08-10"],
  );
  assert.deepEqual(
    (await db.analyticsReceipt.findMany()).map((row) => row.id),
    ["retained-receipt"],
  );
  assert.deepEqual(
    (await db.filterUsageDaily.findMany()).map((row) => row.day),
    ["2026-08-10"],
  );
});

test("per-document cap bounds event amplification", async () => {
  const pageId = randomUUID();
  for (let count = 0; count < 102; count++)
    await analytics.recordAnalyticsEvent(
      shop,
      event({ pageId, event: "filter" }),
      db,
      now,
    );
  assert.equal(await db.analyticsReceipt.count(), 100);
  assert.equal((await db.analyticsDaily.findFirst()).filterInteractions, 100);
});

test("deleting a filter set cascades aggregate and receipt data", async () => {
  await db.filterSet.create({
    data: {
      id: "analytics-delete",
      shop,
      blogId: "gid://shopify/Blog/4",
      name: "Delete",
    },
  });
  await db.filter.create({
    data: {
      id: "analytics-delete-filter",
      filterSetId: "analytics-delete",
      key: "category",
      label: "Delete category",
    },
  });
  await analytics.recordAnalyticsEvent(
    shop,
    event({
      blogId: "gid://shopify/Blog/4",
      event: "filter",
      filterId: "analytics-delete-filter",
    }),
    db,
    now,
  );
  await db.filterSet.delete({ where: { id: "analytics-delete" } });
  assert.equal(await db.analyticsDaily.count(), 0);
  assert.equal(await db.analyticsReceipt.count(), 0);
  assert.equal(await db.filterUsageDaily.count(), 0);
});

function runBrowser({
  permission = false,
  designMode = false,
  apiAvailable = true,
  duplicateBlocks = false,
  loadPrivacyFeature = false,
  failPrivacyFeature = false,
} = {}) {
  const handlers = new Map();
  const listenerOptions = new Map();
  const sends = [];
  const block = {
    dataset: {
      blogId: "gid://shopify/Blog/1",
      proxyUrl: "/apps/nested-filters",
      designMode: String(designMode),
    },
  };
  class Element {
    closest(selector) {
      return selector === "nested-blog-filters" ? block : null;
    }
  }
  class Input extends Element {
    dataset = { filterId: "filter" };
    value = "private input";
  }
  class Form extends Element {
    matches(selector) {
      return selector === "[data-search-form]";
    }
  }
  class Button extends Element {
    disabled = false;
    constructor(kind) {
      super();
      this.kind = kind;
      this.dataset = { filterId: "filter" };
    }
    closest(selector) {
      return selector === "[data-remove], [data-clear]"
        ? this
        : super.closest(selector);
    }
    matches(selector) {
      return selector === "[data-remove]" && this.kind === "remove";
    }
  }
  const privacy = { analyticsProcessingAllowed: () => permission };
  const document = {
    readyState: "complete",
    querySelectorAll: () => (duplicateBlocks ? [block, block] : [block]),
    addEventListener: (name, handler, options) => {
      handlers.set(name, handler);
      listenerOptions.set(name, options);
    },
  };
  const window = {
    Shopify: {
      designMode,
      ...(apiAvailable ? { customerPrivacy: privacy } : {}),
    },
    crypto: { randomUUID },
  };
  let loadedFeatures;
  if (loadPrivacyFeature) {
    window.Shopify.loadFeatures = (features, callback) => {
      loadedFeatures = features;
      if (failPrivacyFeature)
        throw new Error("Simulated privacy bootstrap failure");
      window.Shopify.customerPrivacy = privacy;
      callback();
    };
  }
  const script = readFileSync(
    path.join(root, "extensions/nested-blog-filters/assets/analytics.js"),
    "utf8",
  );
  const context = {
    window,
    document,
    crypto: window.crypto,
    location: { origin: "https://store.invalid" },
    URL,
    Element,
    HTMLInputElement: Input,
    HTMLFormElement: Form,
    fetch: (url, options) => {
      sends.push({
        url: String(url),
        options,
        payload: JSON.parse(options.body),
      });
      return Promise.resolve();
    },
    localStorage: new Proxy(
      {},
      {
        get() {
          throw new Error("Analytics must never access localStorage");
        },
      },
    ),
    sessionStorage: new Proxy(
      {},
      {
        get() {
          throw new Error("Analytics must never access sessionStorage");
        },
      },
    ),
  };
  vm.runInNewContext(script, context);
  return {
    sends,
    handlers,
    setPermission: (value) => {
      permission = value;
    },
    installAgain: () => vm.runInNewContext(script, context),
    dispatchClick: (target, targetHandler = () => {}) => {
      const options = listenerOptions.get("click");
      const captures = options === true || options?.capture === true;
      if (captures) handlers.get("click")({ target });
      targetHandler();
      if (!captures) handlers.get("click")({ target });
    },
    loadedFeatures: () => loadedFeatures,
    Input,
    Form,
    Button,
  };
}

test("browser collection fails closed until Shopify permits analytics, deduplicates blocks and stores no search text", () => {
  const browser = runBrowser({ duplicateBlocks: true });
  assert.equal(browser.sends.length, 0);
  browser.handlers.get("submit")({ target: new browser.Form() });
  assert.equal(browser.sends.length, 0);
  browser.setPermission(true);
  browser.handlers.get("visitorConsentCollected")();
  browser.handlers.get("visitorConsentCollected")();
  assert.equal(browser.sends.length, 1);
  browser.handlers.get("change")({ target: new browser.Input() });
  browser.handlers.get("submit")({ target: new browser.Form() });
  assert.equal(browser.sends.length, 3);
  for (const send of browser.sends) {
    assert.equal(send.url, "https://store.invalid/apps/nested-filters/events");
    assert.equal(send.options.credentials, "omit");
    assert.deepEqual(Object.keys(send.payload).sort(), [
      "blogId",
      "consent",
      "event",
      "eventId",
      ...(send.payload.event === "filter" ? ["filterId"] : []),
      "pageId",
    ]);
    assert.ok(!send.options.body.includes("private input"));
  }
  browser.setPermission(false);
  browser.handlers.get("change")({ target: new browser.Input() });
  assert.equal(browser.sends.length, 3);
  browser.installAgain();
  assert.equal(browser.sends.length, 3);
});

test("browser attributes native changes and chip removal but keeps clear-all aggregate-only", () => {
  const browser = runBrowser({ permission: true });
  const checkbox = new browser.Input();
  checkbox.type = "checkbox";
  checkbox.checked = true;
  browser.handlers.get("change")({ target: checkbox });
  checkbox.checked = false;
  browser.handlers.get("change")({ target: checkbox });
  browser.handlers.get("click")({ target: new browser.Button("remove") });
  browser.handlers.get("click")({ target: new browser.Button("clear") });
  const filterEvents = browser.sends.filter(
    (send) => send.payload.event === "filter",
  );
  assert.equal(filterEvents.length, 4);
  assert.deepEqual(
    filterEvents.slice(0, 3).map((send) => send.payload.filterId),
    ["filter", "filter", "filter"],
  );
  assert.ok(
    !Object.prototype.hasOwnProperty.call(filterEvents[3].payload, "filterId"),
  );
});

test("browser ignores Theme Editor and missing privacy API", () => {
  assert.equal(
    runBrowser({ permission: true, designMode: true }).sends.length,
    0,
  );
  const missing = runBrowser({ permission: true, apiAvailable: false });
  missing.handlers.get("visitorConsentCollected")();
  assert.equal(missing.sends.length, 0);
});

test("browser loads Shopify's privacy feature before collecting a permitted view", () => {
  const browser = runBrowser({
    permission: true,
    apiAvailable: false,
    loadPrivacyFeature: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(browser.loadedFeatures())), [
    { name: "consent-tracking-api", version: "0.2" },
  ]);
  assert.equal(browser.sends.length, 1);
  assert.equal(browser.sends[0].payload.event, "view");
});

test("clear-all is counted before the widget disables the clicked button", () => {
  const browser = runBrowser({ permission: true });
  const clear = new browser.Button("clear");
  browser.dispatchClick(clear, () => {
    clear.disabled = true;
  });
  const interactions = browser.sends.filter(
    (send) => send.payload.event === "filter",
  );
  assert.equal(interactions.length, 1);
  assert.ok(
    !Object.prototype.hasOwnProperty.call(interactions[0].payload, "filterId"),
  );
});

test("a privacy feature loading exception does not escape or enable collection", () => {
  const browser = runBrowser({
    permission: true,
    apiAvailable: false,
    loadPrivacyFeature: true,
    failPrivacyFeature: true,
  });
  browser.handlers.get("visitorConsentCollected")();
  assert.equal(browser.sends.length, 0);
});
