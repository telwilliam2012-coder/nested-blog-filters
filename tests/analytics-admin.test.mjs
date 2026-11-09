/* eslint-env node */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const trustedShop = "trusted.myshopify.com";
let directory, vite, route, renderAnalytics, fixture;
const report = {
  range: { from: "2026-11-01", to: "2026-11-07", days: 7 },
  totals: { pageViews: 42, filterInteractions: 8, searchSubmissions: 3 },
  daily: [
    {
      day: "2026-11-07",
      pageViews: 42,
      filterInteractions: 8,
      searchSubmissions: 3,
    },
  ],
  blogs: [
    {
      id: "set",
      name: "My configured blog",
      blogId: "gid://shopify/Blog/1",
      pageViews: 42,
      filterInteractions: 8,
      searchSubmissions: 3,
    },
  ],
  selectedFilterSetId: "set",
  availableFrom: "2026-11-07",
  topFilters: [],
  filterUsageAvailableFrom: null,
};

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-analytics-admin-"));
  vite = await createServer({
    root,
    configFile: false,
    envDir: directory,
    logLevel: "silent",
    plugins: [
      {
        name: "isolated-analytics-admin-services",
        enforce: "pre",
        resolveId(id) {
          if (id === "../services/billing.server")
            return "\0analytics-admin-billing";
          if (id === "../services/analytics.server")
            return "\0analytics-admin-report";
          if (id === "../components/admin-page-error")
            return "\0analytics-admin-error-boundary";
        },
        load(id) {
          if (id === "\0analytics-admin-billing")
            return `export const authenticatePaidAdmin = request => globalThis.__nbfAnalyticsAdminFixture.authenticate(request);`;
          if (id === "\0analytics-admin-report")
            return `
          export class AnalyticsInputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
          export const getAnalyticsReport = (shop, options) => globalThis.__nbfAnalyticsAdminFixture.report(shop, options, AnalyticsInputError);
        `;
          if (id === "\0analytics-admin-error-boundary")
            return `export const AdminPageError = () => null; export const adminHeaders = () => ({});`;
        },
      },
    ],
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  route = await vite.ssrLoadModule("/app/routes/app.analytics.tsx");
  ({ renderAnalytics } = await vite.ssrLoadModule(
    "/tests/analytics-render.tsx",
  ));
});

beforeEach(() => {
  fixture = {
    calls: [],
    authenticate: async (request) => {
      fixture.calls.push(["authenticate", request]);
      return {
        session: { shop: trustedShop },
        planAccess: { plan: "Pro", analytics: false },
      };
    },
    report: async (shop, options) => {
      fixture.calls.push(["report", shop, options]);
      return report;
    },
  };
  global.__nbfAnalyticsAdminFixture = fixture;
});

after(async () => {
  await vite?.close();
  delete global.__nbfAnalyticsAdminFixture;
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-analytics-admin-")
  )
    rmSync(directory, { recursive: true, force: true });
});

test("Pro cannot obtain Premium analytics through forged plan or shop parameters", async () => {
  const request = new Request(
    "https://app.invalid/app/analytics?plan=Premium&premium=true&shop=forged.myshopify.com&filterSetId=foreign&days=90",
  );
  const result = await route.loader({ request });
  assert.deepEqual(result.data, { report: null, premium: false });
  assert.equal(
    new Headers(result.init.headers).get("Cache-Control"),
    "private, no-store",
  );
  assert.deepEqual(fixture.calls, [["authenticate", request]]);
});

test("Premium report lookup uses only the authenticated shop and validated-service inputs", async () => {
  fixture.authenticate = async () => ({
    session: { shop: trustedShop },
    planAccess: { plan: "Premium", analytics: true },
  });
  const result = await route.loader({
    request: new Request(
      "https://app.invalid/app/analytics?shop=forged.myshopify.com&filterSetId=set&days=7",
    ),
  });
  assert.deepEqual(fixture.calls, [
    ["report", trustedShop, { days: 7, filterSetId: "set" }],
  ]);
  assert.deepEqual(result.data, { report, premium: true });
  assert.equal(
    new Headers(result.init.headers).get("Cache-Control"),
    "private, no-store",
  );
});

test("analytics input errors remain string route data with their status", async () => {
  fixture.authenticate = async () => ({
    session: { shop: trustedShop },
    planAccess: { plan: "Premium", analytics: true },
  });
  fixture.report = async (_shop, _options, InputError) => {
    throw new InputError("Filter set not found.", 404);
  };
  await assert.rejects(
    () =>
      route.loader({
        request: new Request(
          "https://app.invalid/app/analytics?filterSetId=foreign",
        ),
      }),
    (error) =>
      error.data === "Filter set not found." &&
      error.init.status === 404 &&
      new Headers(error.init.headers).get("Cache-Control") ===
        "private, no-store",
  );
});

test("authentication redirects and provider failures are not converted to report data", async () => {
  const redirect = new Response(null, {
    status: 302,
    headers: { Location: "/app/billing" },
  });
  fixture.authenticate = async () => {
    throw redirect;
  };
  await assert.rejects(
    () =>
      route.loader({
        request: new Request("https://app.invalid/app/analytics"),
      }),
    (error) => error === redirect,
  );
  assert.equal(fixture.calls.length, 0);
  const providerFailure = new Error("Provider unavailable");
  fixture.authenticate = async () => ({
    session: { shop: trustedShop },
    planAccess: { plan: "Premium", analytics: true },
  });
  fixture.report = async () => {
    throw providerFailure;
  };
  await assert.rejects(
    () =>
      route.loader({
        request: new Request("https://app.invalid/app/analytics"),
      }),
    (error) => error === providerFailure,
  );
});

test("dashboard renders localized Premium metrics and filters in English and Spanish", async () => {
  for (const [locale, title, metric, detail] of [
    ["en", "Analytics", "Blog page views", "Daily breakdown"],
    ["es", "Estadísticas", "Vistas del blog", "Detalle diario"],
  ]) {
    const html = await renderAnalytics(locale, true, report);
    assert.ok(html.includes(`heading="${title}"`));
    assert.ok(html.includes(metric));
    assert.ok(html.includes(detail));
    assert.match(html, /action="\/app\/analytics"/);
    assert.match(html, /name="days"/);
    assert.match(html, /name="filterSetId"/);
    assert.match(html, /name="host" value="trusted-host"/);
    assert.match(html, /role="img"/);
    assert.ok(html.includes("My configured blog"));
    assert.ok(html.includes(">42<"));
  }
});

test("Pro dashboard renders an upgrade link without leaking supplied metric data", async () => {
  const hiddenReport = {
    ...report,
    blogs: [{ ...report.blogs[0], name: "SECRET PREMIUM BLOG" }],
  };
  const html = await renderAnalytics("en", false, hiddenReport);
  assert.ok(html.includes("View Premium"));
  assert.match(html, /href="\/app\/billing"/);
  assert.ok(!html.includes("SECRET PREMIUM BLOG"));
  assert.ok(!html.includes('name="filterSetId"'));
});

test("dashboard renders attributed rankings safely and explains missing historical attribution", async () => {
  const rankedReport = {
    ...report,
    topFilters: [
      {
        filterId: "rank-filter",
        filterKey: "category",
        filterLabel: "<img src=x>",
        filterSetId: "set",
        filterSetName: "My configured blog",
        blogId: "gid://shopify/Blog/1",
        interactions: 9,
      },
    ],
    filterUsageAvailableFrom: "2026-11-07",
  };
  const ranked = await renderAnalytics("es", true, rankedReport);
  assert.ok(ranked.includes("Interacciones por filtro"));
  assert.ok(ranked.includes("&lt;img src=x&gt;"));
  assert.ok(!ranked.includes("<img src=x>"));
  assert.ok(ranked.includes(">9<"));
  const legacy = await renderAnalytics("es", true, report);
  assert.ok(
    legacy.includes("los totales anteriores no permiten reconstruirlo"),
  );
});

test("all five languages render the same attributed ranking and period while Pro hides it", async () => {
  const rankedReport = {
    ...report,
    topFilters: [
      {
        filterId: "merchant-filter",
        filterKey: "category",
        filterLabel: "Categoría del comerciante",
        filterSetId: "set",
        filterSetName: "Mi blog configurado",
        blogId: "gid://shopify/Blog/1",
        interactions: 9,
      },
    ],
    filterUsageAvailableFrom: "2026-11-07",
  };
  for (const [locale, heading] of [
    ["es", "Filtros más utilizados"],
    ["en", "Most used filters"],
    ["de", "Am häufigsten verwendete Filter"],
    ["it", "Filtri più utilizzati"],
    ["fr", "Filtres les plus utilisés"],
  ]) {
    const html = await renderAnalytics(locale, true, rankedReport);
    assert.ok(html.includes(`heading="${heading}"`), locale);
    assert.ok(html.includes("Categoría del comerciante"), locale);
    assert.ok(html.includes("Mi blog configurado"), locale);
    assert.ok(html.includes(">9<"), locale);
    assert.match(html, /<s-select[^>]*name="days"[^>]*value="7"/, locale);
    const dateFormat = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    assert.ok(
      html.includes(dateFormat.format(new Date("2026-11-01T00:00:00Z"))),
      locale,
    );
    assert.ok(
      html.includes(dateFormat.format(new Date("2026-11-07T00:00:00Z"))),
      locale,
    );
    const locked = await renderAnalytics(locale, false, rankedReport);
    assert.ok(!locked.includes(`heading="${heading}"`), locale);
    assert.ok(!locked.includes("Categoría del comerciante"), locale);
    assert.ok(!locked.includes(">9<"), locale);
  }
});
