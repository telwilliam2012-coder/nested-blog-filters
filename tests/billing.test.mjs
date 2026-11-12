/* eslint-env node */
/* global globalThis */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { redirect } from "react-router";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
require("@shopify/shopify-api/adapters/web-api");
const sdkRoot = path.dirname(
  require.resolve("@shopify/shopify-app-react-router/server"),
);
const { checkBillingFactory } = require(
  path.join(sdkRoot, "authenticate/admin/billing/check.js"),
);
const { redirectFactory } = require(
  path.join(sdkRoot, "authenticate/admin/helpers/redirect.js"),
);
const { shopifyApi, Session, ApiVersion } = require("@shopify/shopify-api");
const { setAbstractFetchFunc } = require("@shopify/shopify-api/runtime");
const shop = "billing-test.myshopify.com";
const pricingUrl =
  "https://admin.shopify.com/store/billing-test/charges/nested-blog-filters/pricing_plans";
const confirmationUrl = `https://${shop}/admin/charges/123/confirm`;
const originalFetch = globalThis.fetch;
const environment = Object.fromEntries(
  [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "SHOPIFY_APP_URL",
    "SHOPIFY_BILLING_TEST",
    "SHOPIFY_APP_HANDLE",
    "SHOPIFY_BILLING_MODE",
    "SHOPIFY_BILLING_VERIFICATION",
    "SHOPIFY_PARTNER_ID",
    "SHOPIFY_PARTNER_API_ACCESS_TOKEN",
    "NODE_ENV",
  ].map((key) => [key, process.env[key]]),
);
let directory,
  db,
  vite,
  server,
  billing,
  billingRoute,
  renderBillingPlans,
  plans;
let originalAdmin, api, session, denyAuthentication;
let subscriptions, purchases, userErrors, graphQLError, calls, appHandle;
let mutationConfirmationUrl;
let managedSubscription,
  managedCalls,
  fixtureSequence = 0;

function partnerSubscription(plan = "premium") {
  return {
    app: { id: "gid://shopify/App/123", apiKey: process.env.SHOPIFY_API_KEY },
    shop: { id: "gid://shopify/Shop/456", myshopifyDomain: shop },
    billingPeriod: "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    currentBillingCycle: {
      startTime: new Date(Date.now() - 1000).toISOString(),
      endTime: new Date(Date.now() + 86_400_000).toISOString(),
    },
    trialEndsAt: null,
    items: [{ handle: plan, price: { __typename: "FlatRatePrice" } }],
  };
}

async function fakePartnerFetch(url, init) {
  assert.equal(
    url,
    "https://partners.shopify.com/12345/api/2026-07/graphql.json",
  );
  assert.equal(init.redirect, "error");
  assert.equal(
    init.headers["X-Shopify-Access-Token"],
    process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN,
  );
  const body = JSON.parse(init.body);
  assert.deepEqual(body.variables, {
    appId: "gid://shopify/App/123",
    shopId: "gid://shopify/Shop/456",
  });
  managedCalls.push(body);
  return Response.json({ data: { activeSubscription: managedSubscription } });
}

function subscription(name = "Pro", status = "ACTIVE", test = true) {
  return {
    id: "gid://shopify/AppSubscription/123",
    name,
    status,
    test,
    trialDays: 7,
    createdAt: "2026-01-01T00:00:00Z",
    lineItems: [
      {
        id: "gid://shopify/AppSubscriptionLineItem/123",
        plan: {
          pricingDetails: {
            price: {
              amount: name === "Premium" ? "9.99" : "4.99",
              currencyCode: "USD",
            },
            interval: "EVERY_30_DAYS",
          },
        },
      },
    ],
  };
}

async function fakeFetch(input, options) {
  const url = new URL(typeof input === "string" ? input : input.url);
  assert.equal(url.host, shop);
  assert.equal(url.pathname, "/admin/api/2026-07/graphql.json");
  const body = JSON.parse(options?.body ?? (await input.text()));
  calls.push(body);
  let data;
  if (body.query.includes("mutation")) {
    assert.equal(process.env.SHOPIFY_BILLING_MODE, "manual_test");
    assert.ok(["development", "test"].includes(process.env.NODE_ENV));
    assert.match(body.query, /mutation AppSubscriptionCreate\(/);
    assert.match(body.query, /test:\s*true\b/);
    data = {
      appSubscriptionCreate: {
        confirmationUrl: userErrors.length ? null : mutationConfirmationUrl,
        appSubscription: userErrors.length
          ? null
          : subscription(body.variables.name, "PENDING"),
        userErrors,
      },
    };
  } else if (body.query.includes("query ManagedPricingIdentity")) {
    data = {
      shop: { id: "gid://shopify/Shop/456", myshopifyDomain: shop },
      currentAppInstallation: {
        app: {
          id: "gid://shopify/App/123",
          apiKey: process.env.SHOPIFY_API_KEY,
        },
      },
    };
  } else if (body.query.includes("query VerifiedStorefrontPlan")) {
    data = { currentAppInstallation: { activeSubscriptions: subscriptions } };
  } else if (body.query.includes("query appSubscription(")) {
    data = {
      currentAppInstallation: {
        activeSubscriptions: subscriptions,
        oneTimePurchases: {
          edges: purchases.map((node) => ({ node })),
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    };
  } else if (body.query.includes("query BillingHostedPricingApp")) {
    data = { currentAppInstallation: { app: { handle: appHandle } } };
  } else {
    throw new Error("Unexpected Shopify request in local billing tests");
  }
  return new Response(
    JSON.stringify(
      graphQLError ||
        (body.query.includes("BillingHostedPricingApp") && userErrors.length)
        ? {
            errors: graphQLError
              ? [{ message: "Simulated billing API failure" }]
              : userErrors,
          }
        : { data },
    ),
    { headers: { "Content-Type": "application/json" } },
  );
}

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-billing-"));
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
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: databaseUrl },
    },
  );
  db = new PrismaClient({
    datasourceUrl: databaseUrl,
  });
  global.__nbfBillingTestDb = db;
  process.env.SHOPIFY_API_KEY = "local-billing-api-key";
  process.env.SHOPIFY_API_SECRET = "local-billing-api-secret";
  process.env.SHOPIFY_APP_URL = "https://billing.example.com";
  let isolatedDatabaseUsed = false;
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    plugins: [
      {
        name: "isolated-billing-database",
        enforce: "pre",
        resolveId(id) {
          if (id.endsWith("/db.server")) return "\0billing-test-db";
        },
        load(id) {
          if (id === "\0billing-test-db") {
            isolatedDatabaseUsed = true;
            return "export default globalThis.__nbfBillingTestDb;";
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
  server = await vite.ssrLoadModule("/app/shopify.server.ts");
  assert.ok(
    isolatedDatabaseUsed,
    "billing tests must never use development SQLite",
  );
  setAbstractFetchFunc(fakeFetch);
  globalThis.fetch = fakePartnerFetch;
  api = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    hostName: "billing.example.com",
    isEmbeddedApp: true,
    apiVersion: ApiVersion.July26,
    future: { unstable_managedPricingSupport: true },
  });
  session = new Session({
    id: `offline_${shop}`,
    shop,
    state: "test",
    isOnline: false,
    accessToken: "local-billing-test-token",
  });
  const params = {
    api,
    config: {
      appUrl: process.env.SHOPIFY_APP_URL,
      apiKey: process.env.SHOPIFY_API_KEY,
      distribution: "app_store",
    },
    logger: { debug() {}, info() {} },
  };
  originalAdmin = server.authenticate.admin;
  server.authenticate.admin = async (request) => {
    if (denyAuthentication) throw new Response(null, { status: 401 });
    return {
      session,
      redirect: (url, init) =>
        url.startsWith("https://admin.shopify.com/") ||
        url.startsWith(`https://${shop}/`)
          ? redirectFactory(params, request, shop)(url, init)
          : redirect(url, init),
      admin: {
        async graphql(query, options) {
          const isMutation = query.includes("mutation AppSubscriptionCreate(");
          assert.match(
            query,
            /query BillingHostedPricingApp|query VerifiedStorefrontPlan|query ManagedPricingIdentity|mutation AppSubscriptionCreate\(/,
            "Protected admin work ran before billing",
          );
          if (isMutation) {
            assert.equal(process.env.SHOPIFY_BILLING_MODE, "manual_test");
            assert.ok(["development", "test"].includes(process.env.NODE_ENV));
            assert.equal(
              options?.tries,
              1,
              "charges must not retry automatically",
            );
          }
          const client = new api.clients.Graphql({ session });
          return Response.json(
            await client.request(query, {
              variables: options?.variables,
              retries: options?.tries ? options.tries - 1 : 0,
            }),
          );
        },
      },
      billing: {
        check: checkBillingFactory(params, request, session),
        require() {
          assert.fail("Access checks must use billing.check");
        },
        request() {
          assert.fail("Managed pricing must not call billing.request");
        },
      },
    };
  };
  billing = await vite.ssrLoadModule("/app/services/billing.server.ts");
  plans = await vite.ssrLoadModule("/app/billing-plans.ts");
  billingRoute = await vite.ssrLoadModule("/app/routes/app.billing.tsx");
  ({ renderBillingPlans } = await vite.ssrLoadModule(
    "/tests/billing-render.tsx",
  ));
});

beforeEach(() => {
  process.env.NODE_ENV = "test";
  delete process.env.SHOPIFY_BILLING_TEST;
  delete process.env.SHOPIFY_APP_HANDLE;
  delete process.env.SHOPIFY_BILLING_MODE;
  delete process.env.SHOPIFY_BILLING_VERIFICATION;
  process.env.SHOPIFY_PARTNER_ID = "12345";
  process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = `fixture-partner-token-${++fixtureSequence}`;
  managedSubscription = null;
  managedCalls = [];
  mutationConfirmationUrl = confirmationUrl;
  appHandle = "nested-blog-filters";
  subscriptions = [];
  purchases = [];
  userErrors = [];
  calls = [];
  graphQLError = false;
  denyAuthentication = false;
});

after(async () => {
  if (originalAdmin) server.authenticate.admin = originalAdmin;
  setAbstractFetchFunc(originalFetch);
  globalThis.fetch = originalFetch;
  await vite?.close();
  await db?.$disconnect();
  delete global.__nbfBillingTestDb;
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-billing-")
  )
    rmSync(directory, { recursive: true, force: true });
});

const get = (pathname = "/app") =>
  new Request(`https://billing.example.com${pathname}`);
const post = (plan, extra = {}, headers = {}) =>
  new Request("https://billing.example.com/app/billing", {
    method: "POST",
    body: new URLSearchParams({ plan, ...extra }),
    headers,
  });
const mutations = () =>
  calls.filter((call) =>
    call.query.includes("mutation AppSubscriptionCreate("),
  );
async function responseFrom(operation) {
  try {
    const value = await operation();
    assert.ok(value instanceof Response, "expected an HTTP response");
    return value;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
}

test("local checks accept test subscriptions while production always verifies Partner contracts", async () => {
  process.env.SHOPIFY_BILLING_TEST = "false";
  assert.equal(billing.billingIsTest(), true);
  process.env.NODE_ENV = "production";
  assert.equal(billing.billingIsTest(), false);
  subscriptions = [subscription()];
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(get()))
    ).headers.get("Location"),
    "/app/billing",
  );
  process.env.SHOPIFY_BILLING_TEST = "true";
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(get()))
    ).headers.get("Location"),
    "/app/billing",
    "the legacy test flag cannot bypass Partner verification in production",
  );
  subscriptions = [subscription("Premium", "ACTIVE", false)];
  process.env.SHOPIFY_BILLING_TEST = "false";
  managedSubscription = partnerSubscription("premium");
  assert.equal(
    (await billing.authenticatePaidAdmin(get())).planAccess.plan,
    "Premium",
  );
  assert.ok(managedCalls.length >= 3);
  assert.equal(
    calls.some((call) => call.query.includes("query appSubscription(")),
    false,
  );
});

test("unpaid GETs redirect to plan selection without creating a charge", async () => {
  const response = await responseFrom(() =>
    billing.authenticatePaidAdmin(get()),
  );
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), "/app/billing");
  assert.deepEqual(await billing.loadBillingPlans(get("/app/billing")), {
    isTest: true,
    manualTest: false,
    currentPlan: null,
    pricingUrl,
  });
  assert.equal(mutations().length, 0);
});

test("Pro and Premium subscriptions unlock the panel, including an active trial", async () => {
  for (const name of ["Pro", "Premium"]) {
    subscriptions = [subscription(name)];
    assert.equal(
      (await billing.authenticatePaidAdmin(get())).session.shop,
      shop,
    );
    const selection = await billing.loadBillingPlans(
      get("/app/billing?charge_id=123"),
    );
    assert.equal(selection.currentPlan, name);
  }
});

test("pending, cancelled, frozen, foreign plans and one-time purchases do not unlock the panel", async () => {
  for (const status of ["PENDING", "CANCELLED", "FROZEN", "DECLINED"]) {
    subscriptions = [subscription("Pro", status)];
    assert.equal(
      (
        await responseFrom(() => billing.authenticatePaidAdmin(get()))
      ).headers.get("Location"),
      "/app/billing",
    );
  }
  subscriptions = [subscription("Other")];
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(get()))
    ).headers.get("Location"),
    "/app/billing",
  );
  subscriptions = [];
  purchases = [
    {
      id: "gid://shopify/AppPurchaseOneTime/1",
      name: "Pro",
      status: "ACTIVE",
      test: true,
    },
  ];
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(get()))
    ).headers.get("Location"),
    "/app/billing",
  );
});

for (const [name, amount] of [
  ["Pro", 4.99],
  ["Premium", 9.99],
]) {
  test(`${name} opens hosted Shopify plans without creating a subscription`, async () => {
    const response = await responseFrom(() =>
      billingRoute.action({
        request: post(name, {
          amount: "0.01",
          currencyCode: "EUR",
          trialDays: "999",
          isTest: "false",
          returnUrl: "https://untrusted.example",
        }),
      }),
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), pricingUrl);
    assert.equal(mutations().length, 0);
    const config = plans.APP_BILLING_PLANS[name];
    assert.equal(config.trialDays, 7);
    assert.equal(config.amount, amount);
    assert.equal(config.currencyCode, "USD");
    assert.equal(config.intervalDays, 30);
    assert.equal(config.annualAmount, name === "Pro" ? 40.99 : 90.99);
    assert.equal(server.billingConfig, undefined);
  });
}

test("hosted plan redirects retain the App Bridge reauthorization header", async () => {
  const response = await responseFrom(() =>
    billingRoute.action({
      request: post(
        "Premium",
        {},
        { Authorization: "Bearer local-test-token" },
      ),
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
    pricingUrl,
  );
});

test("manual test billing requires an explicit flag and a development or test environment", async () => {
  const { manualTestBillingEnabled } = await vite.ssrLoadModule(
    "/app/services/billing-test.server.ts",
  );
  assert.equal(manualTestBillingEnabled(), false);
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  for (const mode of ["development", "test"]) {
    process.env.NODE_ENV = mode;
    assert.equal(manualTestBillingEnabled(), true, mode);
  }
  for (const mode of ["production", "staging", ""]) {
    process.env.NODE_ENV = mode;
    assert.equal(manualTestBillingEnabled(), false, mode);
  }
  delete process.env.NODE_ENV;
  assert.equal(manualTestBillingEnabled(), false);
});

test("manual test mode never creates a subscription on a GET", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  const response = await responseFrom(() =>
    billing.authenticatePaidAdmin(get()),
  );
  assert.equal(response.headers.get("Location"), "/app/billing");
  assert.deepEqual(await billing.loadBillingPlans(get("/app/billing")), {
    isTest: true,
    manualTest: true,
    currentPlan: null,
    pricingUrl: null,
  });
  const wrongMethod = await billing.requestBillingPlan(get("/app/billing"));
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("Allow"), "POST");
  assert.equal(mutations().length, 0);
});

for (const [name, amount] of [
  ["Pro", 4.99],
  ["Premium", 9.99],
]) {
  test(`manual test ${name} creates only the configured test charge and redirects to native confirmation`, async () => {
    process.env.SHOPIFY_BILLING_MODE = "manual_test";
    const response = await responseFrom(() =>
      billingRoute.action({
        request: post(name, {
          amount: "0.01",
          currencyCode: "EUR",
          interval: "ANNUAL",
          trialDays: "999",
          test: "false",
          isTest: "false",
          returnUrl: "https://untrusted.example/return",
          confirmationUrl: "https://untrusted.example/confirm",
        }),
      }),
    );
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("Location"), confirmationUrl);
    assert.equal(mutations().length, 1);
    const mutation = mutations()[0];
    assert.match(mutation.query, /test:\s*true\b/);
    assert.equal("test" in mutation.variables, false);
    assert.deepEqual(mutation.variables, {
      name,
      trialDays: 7,
      returnUrl:
        "https://admin.shopify.com/store/billing-test/apps/local-billing-api-key/app",
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    });
    assert.equal(
      calls.some((call) => call.query.includes("BillingHostedPricingApp")),
      false,
    );
  });
}

test("production ignores the temporary manual test flag and keeps hosted pricing", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  process.env.NODE_ENV = "production";
  process.env.SHOPIFY_APP_HANDLE = "nested-blog-filters";
  const response = await responseFrom(() =>
    billingRoute.action({ request: post("Pro") }),
  );
  assert.equal(response.headers.get("Location"), pricingUrl);
  assert.equal(mutations().length, 0);
});

test("manual test mode avoids a duplicate charge for the current plan", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  subscriptions = [subscription("Pro")];
  const response = await responseFrom(() =>
    billingRoute.action({ request: post("Pro") }),
  );
  assert.equal(response.headers.get("Location"), "/app");
  assert.equal(mutations().length, 0);
});

test("manual test confirmation retains native App Bridge reauthorization headers", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  const response = await responseFrom(() =>
    billingRoute.action({
      request: post("Pro", {}, { Authorization: "Bearer local-test-token" }),
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(
    response.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
    confirmationUrl,
  );
  assert.equal(mutations().length, 1);
});

test("creating a pending test charge and forged approval parameters never grant access", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  const confirmation = await responseFrom(() =>
    billingRoute.action({ request: post("Pro") }),
  );
  assert.equal(confirmation.headers.get("Location"), confirmationUrl);
  const returned = () => get("/app?charge_id=123&approved=true&plan=Pro");
  subscriptions = [subscription("Pro", "PENDING")];
  const pending = await responseFrom(() =>
    billing.authenticatePaidAdmin(returned()),
  );
  assert.equal(pending.headers.get("Location"), "/app/billing");
  subscriptions = [subscription("Pro", "ACTIVE")];
  assert.equal(
    (await billing.authenticatePaidAdmin(returned())).session.shop,
    shop,
  );
  assert.equal(mutations().length, 1);
});

test("Managed Pricing userErrors remain explicit 422 errors without retries or an invented redirect", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  userErrors = [
    {
      field: null,
      message:
        "Managed Pricing Apps cannot use the Billing API (to create charges).",
    },
  ];
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  let result;
  try {
    result = await billingRoute.action({ request: post("Pro") });
  } finally {
    console.error = originalError;
  }
  assert.equal(result.init.status, 422);
  assert.deepEqual(result.data.details, [userErrors[0].message]);
  assert.equal(mutations().length, 1);
  assert.equal(logs[0][1].errorType, "BillingError");
  assert.equal(result instanceof Response, false);
});

test("missing or untrusted confirmation URLs never become a redirect", async () => {
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const value of [
      null,
      "https://untrusted.example/confirm",
      `http://${shop}/confirm`,
      "javascript:alert(1)",
    ]) {
      mutationConfirmationUrl = value;
      const result = await billingRoute.action({ request: post("Pro") });
      assert.equal(result.init.status, 422, String(value));
      assert.equal(result instanceof Response, false);
    }
  } finally {
    console.error = originalError;
  }
  assert.equal(mutations().length, 4);
});

test("embedded plan submissions preserve iframe context and use SDK top-level navigation", async () => {
  const { billingActionPath } = await vite.ssrLoadModule(
    "/app/billing-navigation.ts",
  );
  const host = Buffer.from("admin.shopify.com/store/billing-test").toString(
    "base64",
  );
  const search = new URLSearchParams({
    embedded: "1",
    host,
    shop,
    locale: "es",
    admin_theme: "admin-next",
    id_token: "private-token",
    hmac: "private-hmac",
    session: "private-session",
    charge_id: "123",
    returnUrl: "https://untrusted.example",
  });
  const action = billingActionPath(`?${search}`);
  const input = new Request(`https://billing.example.com${action}`, {
    method: "POST",
    body: new URLSearchParams({ plan: "Pro" }),
  });
  const response = await responseFrom(() =>
    billingRoute.action({ request: input }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /text\/html/);
  const html = await response.text();
  assert.ok(html.includes(pricingUrl));
  assert.ok(html.includes('"_top"'));
  assert.ok(html.includes("app-bridge.js"));
  assert.match(
    response.headers.get("Content-Security-Policy"),
    /billing-test\.myshopify\.com/,
  );
  assert.equal(new URL(input.url).searchParams.get("locale"), "es");
  assert.equal(
    new URL(input.url).searchParams.get("admin_theme"),
    "admin-next",
  );
  assert.equal(
    /private-token|private-hmac|private-session|charge_id|returnUrl/.test(
      action,
    ),
    false,
  );
  assert.equal(mutations().length, 0);
});

test("approval return is rechecked remotely and forged return parameters never grant access", async () => {
  const returned = () =>
    get("/app?charge_id=123&approved=true&plan=Premium&plan_handle=pro");
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(returned()))
    ).headers.get("Location"),
    "/app/billing",
  );
  subscriptions = [subscription("Pro")];
  assert.equal(
    (await billing.authenticatePaidAdmin(returned())).session.shop,
    shop,
  );
  subscriptions = [];
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(returned()))
    ).headers.get("Location"),
    "/app/billing",
  );
});

test("unknown plans are rejected and an active Pro subscription can open the Premium upgrade", async () => {
  const invalid = await billingRoute.action({ request: post("Free") });
  assert.equal(invalid.init.status, 400);
  assert.equal(calls.length, 0);
  subscriptions = [subscription("Pro")];
  assert.equal(
    (
      await responseFrom(() =>
        billingRoute.action({ request: post("Premium") }),
      )
    ).headers.get("Location"),
    pricingUrl,
  );
  assert.equal(mutations().length, 0);
});

test("authentication and Shopify billing failures fail closed", async () => {
  denyAuthentication = true;
  assert.equal(
    (await responseFrom(() => billing.authenticatePaidAdmin(get()))).status,
    401,
  );
  assert.equal(calls.length, 0);
  denyAuthentication = false;
  graphQLError = true;
  await assert.rejects(billing.authenticatePaidAdmin(get()));
  assert.equal(mutations().length, 0);
  graphQLError = false;
  userErrors = [{ field: ["name"], message: "Subscription was rejected" }];
  const failed = await billingRoute.action({ request: post("Pro") });
  assert.equal(failed.init.status, 422);
  assert.equal(
    failed.data.error,
    "Shopify rechazó la solicitud de suscripción. Revisa el detalle o contacta con soporte.",
  );
  assert.deepEqual(failed.data.details, ["Subscription was rejected"]);
});

test("plan submissions only accept canonical names from the displayed catalog", async () => {
  assert.deepEqual(Object.keys(plans.APP_BILLING_PLANS), [
    ...plans.APP_BILLING_PLAN_NAMES,
  ]);
  assert.equal(server.billingConfig, undefined);
  for (const name of ["Starter", "starter", "pro", "premium", "Pro "]) {
    const result = await billingRoute.action({ request: post(name) });
    assert.equal(result.init.status, 400);
  }
  assert.equal(calls.length, 0);
});

test("metadata errors retain Shopify details without inventing a redirect or retrying", async () => {
  userErrors = [{ field: ["handle"], message: "App metadata is unavailable" }];
  const logs = [];
  const originalError = console.error;
  console.error = (...values) => logs.push(values);
  let result;
  try {
    result = await billingRoute.action({ request: post("Pro") });
  } finally {
    console.error = originalError;
  }
  assert.equal(result.init.status, 422);
  assert.deepEqual(result.data.details, [userErrors[0].message]);
  assert.equal(mutations().length, 0);
  assert.equal(
    calls.filter((call) => call.query.includes("BillingHostedPricingApp"))
      .length,
    1,
  );
  assert.equal(logs[0][1].errorType, "GraphqlQueryError");
  assert.deepEqual(
    logs[0][1].shopifyErrors,
    userErrors.map((entry) => ({
      field: entry.field.join("."),
      message: entry.message,
    })),
  );
});

test("hosted pricing uses the authenticated shop and a validated app handle", async () => {
  assert.equal(
    billing.billingPricingUrl(shop, "nested-blog-filters"),
    pricingUrl,
  );
  for (const value of [
    "../other",
    "https://untrusted.example",
    "x?redirect=y",
    "",
  ]) {
    assert.throws(() => billing.billingPricingUrl(shop, value));
  }
  assert.throws(() => billing.billingPricingUrl("untrusted.example", "app"));
  appHandle = null;
  const missing = await billingRoute.action({ request: post("Pro") });
  assert.equal(missing.init.status, 503);
  assert.match(missing.data.error, /SHOPIFY_APP_HANDLE/);
  process.env.SHOPIFY_APP_HANDLE = "nested-blog-filters";
  appHandle = "different-admin-api-handle";
  const callsBeforeConfiguredRedirect = calls.filter((call) =>
    call.query.includes("BillingHostedPricingApp"),
  ).length;
  const response = await responseFrom(() =>
    billingRoute.action({ request: post("Pro") }),
  );
  assert.equal(response.headers.get("Location"), pricingUrl);
  assert.equal(
    calls.filter((call) => call.query.includes("BillingHostedPricingApp"))
      .length,
    callsBeforeConfiguredRedirect,
    "the configured handle must be used without depending on Admin API metadata",
  );
  assert.equal(mutations().length, 0);
});

test("SDK control responses keep the original identity, location and cookie headers", async () => {
  const authenticateAdmin = server.authenticate.admin;
  const control = new Response(null, {
    status: 302,
    headers: {
      Location: "/auth/login",
      "Set-Cookie": "state=local-test; HttpOnly; Secure; SameSite=None",
    },
  });
  server.authenticate.admin = async () => {
    throw control;
  };
  try {
    const response = await responseFrom(() =>
      billingRoute.action({ request: post("Pro") }),
    );
    assert.equal(response, control);
    assert.equal(
      response.headers.get("Set-Cookie"),
      control.headers.get("Set-Cookie"),
    );
    assert.equal(calls.length, 0);
  } finally {
    server.authenticate.admin = authenticateAdmin;
  }
});

test("every administrative data loader and action enforces billing independently", async () => {
  for (const [file, exports] of [
    ["app._index.tsx", ["loader"]],
    ["app.blogs.tsx", ["loader"]],
    ["app.filters.tsx", ["loader"]],
    ["app.filters_.new.tsx", ["loader", "action"]],
    ["app.filters_.$filterSetId.tsx", ["loader", "action"]],
    ["app.articles.tsx", ["loader", "action"]],
    ["app.filter-preview.ts", ["loader"]],
  ]) {
    const route = await vite.ssrLoadModule(`/app/routes/${file}`);
    for (const method of exports) {
      const response = await responseFrom(() =>
        route[method]({
          request: method === "loader" ? get("/app/filters") : post("Pro"),
          params: { filterSetId: "test" },
        }),
      );
      assert.equal(
        response.headers.get("Location"),
        "/app/billing",
        `${file}: ${method}`,
      );
    }
  }
  assert.equal(mutations().length, 0);
});

test("the main loader protects the panel while billing and help remain reachable", async () => {
  const route = await vite.ssrLoadModule("/app/routes/app.tsx");
  assert.equal(
    (await responseFrom(() => route.loader({ request: get() }))).headers.get(
      "Location",
    ),
    "/app/billing",
  );
  for (const pathname of ["/app/billing", "/app/billing/", "/app/help"]) {
    assert.equal((await route.loader({ request: get(pathname) })).shop, shop);
  }
});

test("plan selection renders prices and trial terms in all five languages", async () => {
  for (const [locale, heading, button, period] of [
    ["es", "Elige tu plan", "Elegir Pro", "Cada 30 días"],
    ["en", "Choose your plan", "Choose Pro", "Every 30 days"],
    ["de", "Wähle deinen Tarif", "Pro wählen", "Alle 30 Tage"],
    ["it", "Scegli il tuo piano", "Scegli Pro", "Ogni 30 giorni"],
    ["fr", "Choisissez votre forfait", "Choisir Pro", "Tous les 30 jours"],
  ]) {
    const html = renderBillingPlans(locale);
    assert.ok(html.includes(heading), locale);
    assert.ok(html.includes(button), locale);
    assert.ok(html.includes(period), locale);
    assert.match(html, /4[.,]99/);
    assert.match(html, /9[.,]99/);
    assert.match(html, /40[.,]99/);
    assert.match(html, /90[.,]99/);
    assert.ok(html.includes("USD"));
  }
});

test("hosted plan buttons are enabled links that leave the iframe without submitting a charge", () => {
  const html = renderBillingPlans("es");
  const buttons = [...html.matchAll(/<s-button\b([^>]*)>(.*?)<\/s-button>/g)];
  const choices = buttons.filter(([, , text]) => /^Elegir (Pro|Premium)$/.test(text));
  assert.equal(choices.length, 2);
  for (const [, attributes] of choices) {
    assert.ok(attributes.includes(`href="${pricingUrl}"`));
    assert.ok(attributes.includes('target="_top"'));
    assert.doesNotMatch(attributes, /\b(?:disabled|loading)=/);
  }
});

test("manual test buttons omit inactive boolean attributes and disable only while submitting", () => {
  const idle = renderBillingPlans("es", null, { manualTest: true });
  const busy = renderBillingPlans("es", null, {
    manualTest: true,
    pending: true,
    pendingPlan: "Premium",
  });
  assert.doesNotMatch(idle, /\b(?:disabled|loading|target)=/);
  assert.doesNotMatch(idle, /href="https:\/\/admin\.shopify\.com/);
  const buttons = [...busy.matchAll(/<s-button\b([^>]*)>(.*?)<\/s-button>/g)];
  assert.equal(buttons.length, 2);
  assert.match(buttons[0][1], /disabled="true"/);
  assert.doesNotMatch(buttons[0][1], /\bloading=/);
  assert.match(buttons[1][1], /disabled="true"/);
  assert.match(buttons[1][1], /loading="true"/);
});

test("hosted navigation is built from the authenticated shop and never browser return claims", async () => {
  process.env.SHOPIFY_APP_HANDLE = "nested-blog-filters";
  const result = await billing.loadBillingPlans(
    get("/app/billing?shop=other.myshopify.com&plan_handle=premium&returnUrl=https://untrusted.example"),
  );
  assert.equal(result.pricingUrl, pricingUrl);
  assert.equal(result.currentPlan, null);
  assert.equal(mutations().length, 0);
  process.env.SHOPIFY_BILLING_MODE = "manual_test";
  assert.equal((await billing.loadBillingPlans(get("/app/billing"))).pricingUrl, null);
});

test("verified tiers carry the Pro and Premium permissions, never URL claims", async () => {
  subscriptions = [subscription("Pro")];
  const pro = await billing.authenticatePaidAdmin(
    get("/app?plan=Premium&plan_handle=premium&analytics=true"),
  );
  assert.deepEqual(pro.planAccess, {
    plan: "Pro",
    maxBlogs: 1,
    maxFilters: 3,
    bulkEditing: false,
    analytics: false,
  });
  subscriptions = [subscription("premium")];
  const premium = await billing.authenticatePaidAdmin(get());
  assert.deepEqual(premium.planAccess, {
    plan: "Premium",
    maxBlogs: null,
    maxFilters: 10,
    bulkEditing: true,
    analytics: true,
  });
  assert.throws(() => plans.getPlanAccess("Starter"));
});

test("premium wins among verified active subscriptions and annual terms keep the same tier", async () => {
  const annual = subscription("Premium");
  annual.lineItems[0].plan.pricingDetails.price.amount = "90.99";
  annual.lineItems[0].plan.pricingDetails.interval = "ANNUAL";
  for (const active of [
    [subscription("Pro"), annual],
    [annual, subscription("Pro")],
  ]) {
    subscriptions = active;
    assert.equal(
      (await billing.authenticatePaidAdmin(get())).planAccess.plan,
      "Premium",
    );
  }
  const oldPro = subscription("Pro");
  oldPro.lineItems[0].plan.pricingDetails.price.amount = "9.99";
  subscriptions = [oldPro];
  assert.equal(
    (await billing.authenticatePaidAdmin(get())).planAccess.plan,
    "Pro",
    "the old ambiguous Pro name must never silently grant Premium",
  );
});

test("storefront permissions come from authenticated subscription data and are rechecked", async () => {
  const context = await server.authenticate.admin(get());
  subscriptions = [subscription("Premium")];
  assert.equal(
    (await billing.getVerifiedStorefrontPlan(context.admin, shop)).analytics,
    true,
  );
  subscriptions = [subscription("Pro")];
  assert.equal(
    (await billing.getVerifiedStorefrontPlan(context.admin, shop)).analytics,
    false,
  );
  subscriptions = [subscription("Premium", "CANCELLED")];
  assert.equal(
    await billing.getVerifiedStorefrontPlan(context.admin, shop),
    null,
  );
  subscriptions = [subscription("Starter"), subscription("Other")];
  assert.equal(
    await billing.getVerifiedStorefrontPlan(context.admin, shop),
    null,
  );
  subscriptions = [];
  assert.equal(
    await billing.getVerifiedStorefrontPlan(context.admin, shop),
    null,
  );
  graphQLError = true;
  await assert.rejects(billing.getVerifiedStorefrontPlan(context.admin, shop));
});

test("storefront production uses Partner contracts rather than legacy test flags", async () => {
  process.env.NODE_ENV = "production";
  process.env.SHOPIFY_BILLING_TEST = "false";
  const context = await server.authenticate.admin(get());
  subscriptions = [subscription("Premium", "ACTIVE", true)];
  assert.equal(
    await billing.getVerifiedStorefrontPlan(context.admin, shop),
    null,
  );
  subscriptions = [subscription("premium", "ACTIVE", false)];
  managedSubscription = partnerSubscription("premium");
  assert.equal(
    (await billing.getVerifiedStorefrontPlan(context.admin, shop)).plan,
    "Premium",
  );
});

test("local Partner verification is opt-in and production configuration failures never fall back", async () => {
  subscriptions = [subscription("Premium")];
  assert.equal(
    (await billing.authenticatePaidAdmin(get())).planAccess.plan,
    "Premium",
  );
  assert.equal(managedCalls.length, 0);
  process.env.SHOPIFY_BILLING_VERIFICATION = "partner";
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(get()))
    ).headers.get("Location"),
    "/app/billing",
  );
  managedSubscription = partnerSubscription("pro");
  assert.equal(
    (await billing.authenticatePaidAdmin(get())).planAccess.plan,
    "Pro",
  );
  process.env.NODE_ENV = "production";
  process.env.SHOPIFY_BILLING_VERIFICATION = "legacy";
  delete process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  const unavailable = await responseFrom(() =>
    billing.authenticatePaidAdmin(get()),
  );
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("Location"), null);
  assert.equal(
    await unavailable.text(),
    "No se pudo verificar el plan de la tienda.",
  );
});

test("every admin approval return refreshes Partner access and ignores replayed plan_handle", async () => {
  process.env.NODE_ENV = "production";
  managedSubscription = partnerSubscription("pro");
  const request = () => get("/app?approved=true&plan_handle=premium");
  assert.equal(
    (await billing.authenticatePaidAdmin(request())).planAccess.plan,
    "Pro",
  );
  managedSubscription = partnerSubscription("premium");
  assert.equal(
    (await billing.authenticatePaidAdmin(request())).planAccess.plan,
    "Premium",
  );
  managedSubscription = partnerSubscription("pro");
  assert.equal(
    (await billing.loadBillingPlans(get("/app/billing"))).currentPlan,
    "Pro",
  );
  managedSubscription = null;
  assert.equal(
    (
      await responseFrom(() => billing.authenticatePaidAdmin(request()))
    ).headers.get("Location"),
    "/app/billing",
  );
  assert.equal(managedCalls.length, 4);
});

test("a Pro subscriber can compare tiers and request an upgrade without granting it early", async () => {
  subscriptions = [subscription("Pro")];
  assert.equal(
    (await billing.loadBillingPlans(get("/app/billing"))).currentPlan,
    "Pro",
  );
  const upgrade = await responseFrom(() =>
    billingRoute.action({ request: post("Premium") }),
  );
  assert.equal(upgrade.headers.get("Location"), pricingUrl);
  assert.equal(
    (await billing.authenticatePaidAdmin(get("/app?plan_handle=premium")))
      .planAccess.plan,
    "Pro",
  );
  assert.equal(mutations().length, 0);
  const html = renderBillingPlans("es", "Pro");
  assert.match(html, /Plan actual/);
  assert.match(html, /Gestionar plan/);
  assert.match(html, /Elegir Premium/);
});

test("an approved Pro plan can reopen hosted pricing to change billing frequency", async () => {
  subscriptions = [subscription("Pro")];
  const response = await responseFrom(() =>
    billingRoute.action({ request: post("Pro") }),
  );
  assert.equal(response.headers.get("Location"), pricingUrl);
  assert.equal(mutations().length, 0);
});
