/* eslint-env node */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const APP_ID = "gid://shopify/App/123";
const SHOP_ID = "gid://shopify/Shop/456";
const SHOP = "managed-test.myshopify.com";
const NOW = Date.parse("2026-11-08T00:00:00Z");
const credentials = {
  SHOPIFY_PARTNER_ID: "12345",
  SHOPIFY_PARTNER_API_ACCESS_TOKEN: "fixture-partner-token",
  SHOPIFY_API_KEY: "fixture-app-api-key",
};
let vite, directory, managed;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-managed-pricing-"));
  vite = await createServer({
    root,
    configFile: false,
    envDir: directory,
    appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  managed = await vite.ssrLoadModule("/app/services/managed-pricing.server.ts");
});
after(async () => {
  await vite?.close();
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-managed-pricing-")
  )
    rmSync(directory, { recursive: true, force: true });
});

const app = () => ({ id: APP_ID, apiKey: credentials.SHOPIFY_API_KEY });
const shop = () => ({ id: SHOP_ID, myshopifyDomain: SHOP });
function admin(overrides = {}) {
  return {
    async graphql(query) {
      assert.equal(query, managed.MANAGED_PRICING_IDENTITY_QUERY);
      return Response.json({
        data: {
          shop: shop(),
          currentAppInstallation: { app: app() },
          ...overrides,
        },
      });
    },
  };
}
function subscription(handle = "premium", overrides = {}) {
  return {
    app: app(),
    shop: shop(),
    billingPeriod: "EVERY_30_DAYS",
    cancelAtEndOfCycle: false,
    currentBillingCycle: {
      startTime: new Date(NOW - 86_400_000).toISOString(),
      endTime: new Date(NOW + 86_400_000).toISOString(),
    },
    trialEndsAt: null,
    items: [{ handle, price: { __typename: "FlatRatePrice" } }],
    ...overrides,
  };
}
function scenario(value = subscription()) {
  const state = { value, now: NOW, env: { ...credentials }, calls: [] };
  state.verify = managed.createManagedPricingVerifier({
    now: () => state.now,
    env: () => state.env,
    fetch: async (url, init) => {
      assert.equal(
        url,
        "https://partners.shopify.com/12345/api/2026-07/graphql.json",
      );
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "error");
      assert.equal(
        init.headers["X-Shopify-Access-Token"],
        state.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN,
      );
      assert.ok(init.signal instanceof AbortSignal);
      const body = JSON.parse(init.body);
      assert.equal(body.query, managed.MANAGED_PRICING_SUBSCRIPTION_QUERY);
      assert.deepEqual(body.variables, { appId: APP_ID, shopId: SHOP_ID });
      state.calls.push(body);
      if (state.error)
        throw new Error("private provider detail fixture-partner-token");
      return (
        state.response?.() ??
        Response.json({ data: { activeSubscription: state.value } })
      );
    },
  });
  return state;
}

test("Partner contracts identify Pro and Premium from verified current flat-rate handles", async () => {
  for (const [handle, plan, analytics] of [
    ["pro", "Pro", false],
    ["premium", "Premium", true],
  ]) {
    const state = scenario(subscription(handle));
    const access = await state.verify(admin(), SHOP);
    assert.equal(access.plan, plan);
    assert.equal(access.analytics, analytics);
    assert.equal(state.calls.length, 1);
  }
});

test("trials, annual terms, zero effective prices and grandfathered prices keep their verified tier", async () => {
  const state = scenario(
    subscription("premium", {
      billingPeriod: "ANNUAL",
      currentBillingCycle: null,
      trialEndsAt: new Date(NOW + 7 * 86_400_000).toISOString(),
      items: [
        {
          handle: "premium",
          price: {
            __typename: "FlatRatePrice",
            active: false,
            amount: "0",
            currency: "USD",
          },
        },
      ],
    }),
  );
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
});

test("pending upgrades and usage-meter handle collisions never grant Premium", async () => {
  const state = scenario(
    subscription("pro", {
      pendingUpdate: {
        items: [{ handle: "premium", price: { __typename: "FlatRatePrice" } }],
      },
      items: [
        { handle: "premium", price: { __typename: "TieredPrice" } },
        { handle: "pro", price: { __typename: "FlatRatePrice" } },
      ],
    }),
  );
  assert.equal((await state.verify(admin(), SHOP)).plan, "Pro");
  for (const items of [
    [],
    [{ handle: "premium", price: { __typename: "TieredPrice" } }],
    [{ handle: "other", price: { __typename: "FlatRatePrice" } }],
  ]) {
    state.value = subscription("pro", { items });
    await assert.rejects(state.verify(admin(), SHOP, { forceFresh: true }), {
      code: "UNKNOWN_PLAN",
      status: 503,
    });
  }
});

test("unknown or changed configuration fails before reading identity or granting cached access", async () => {
  const state = scenario();
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  delete state.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN;
  await assert.rejects(state.verify(admin(), SHOP), {
    code: "CONFIGURATION",
    status: 503,
  });
  assert.equal(state.calls.length, 1);
  for (const value of ["", "../other", "https://untrusted.test", "0"]) {
    state.env = { ...credentials, SHOPIFY_PARTNER_ID: value };
    await assert.rejects(state.verify(admin(), SHOP), {
      code: "CONFIGURATION",
    });
  }
});

test("configuration rotation cannot reuse an older credential's cached entitlement", async () => {
  const state = scenario();
  await state.verify(admin(), SHOP);
  state.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = "rotated-fixture-token";
  state.value = subscription("pro");
  assert.equal((await state.verify(admin(), SHOP)).plan, "Pro");
  assert.equal(state.calls.length, 2);
});

test("Admin identity must belong to the authenticated shop and this app", async () => {
  for (const overrides of [
    { shop: { ...shop(), myshopifyDomain: "other.myshopify.com" } },
    { shop: { ...shop(), id: "gid://shopify/Customer/456" } },
    {
      currentAppInstallation: { app: { ...app(), apiKey: "another-app-key" } },
    },
    {
      currentAppInstallation: {
        app: { ...app(), id: "gid://shopify/Shop/123" },
      },
    },
  ]) {
    const state = scenario();
    await assert.rejects(state.verify(admin(overrides), SHOP), {
      code: "IDENTITY",
    });
    assert.equal(state.calls.length, 0);
  }
  const state = scenario();
  await assert.rejects(state.verify(admin(), "untrusted.test"), {
    code: "IDENTITY",
  });
});

test("Partner responses are bound to the same app, shop GID and myshopify.com domain", async () => {
  for (const overrides of [
    { app: { ...app(), id: "gid://shopify/App/999" } },
    { app: { ...app(), apiKey: "another-app-key" } },
    { shop: { ...shop(), id: "gid://shopify/Shop/999" } },
    { shop: { ...shop(), myshopifyDomain: "other.myshopify.com" } },
    { billingPeriod: "UNKNOWN" },
  ]) {
    const state = scenario(subscription("premium", overrides));
    await assert.rejects(state.verify(admin(), SHOP), {
      code: "PARTNER_RESPONSE",
    });
  }
});

test("unpaid results and missing subscription data are distinct, with no negative cache", async () => {
  const state = scenario(null);
  assert.equal(await state.verify(admin(), SHOP), null);
  state.value = subscription();
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal(state.calls.length, 2);
  for (const payload of [
    {},
    { data: {} },
    {
      errors: [{ message: "denied" }],
      data: { activeSubscription: state.value },
    },
    { data: { activeSubscription: {} } },
  ]) {
    state.response = () => Response.json(payload);
    await assert.rejects(state.verify(admin(), SHOP, { forceFresh: true }), {
      status: 503,
    });
  }
});

test("a paid cache expires after at most 30 seconds and errors never extend stale access", async () => {
  const state = scenario();
  await state.verify(admin(), SHOP);
  state.value = null;
  state.now += 29_999;
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal(state.calls.length, 1);
  state.now += 1;
  assert.equal(await state.verify(admin(), SHOP), null);
  state.value = subscription();
  await state.verify(admin(), SHOP);
  state.error = true;
  state.now += 30_000;
  await assert.rejects(state.verify(admin(), SHOP), { code: "UNAVAILABLE" });
  await assert.rejects(state.verify(admin(), SHOP), { code: "UNAVAILABLE" });
});

test("fresh admin verification immediately observes approvals, upgrades and downgrades", async () => {
  const state = scenario(subscription("pro"));
  assert.equal((await state.verify(admin(), SHOP)).plan, "Pro");
  state.value = subscription("premium");
  assert.equal(
    (await state.verify(admin(), SHOP, { forceFresh: true })).plan,
    "Premium",
  );
  state.value = subscription("pro");
  assert.equal(
    (await state.verify(admin(), SHOP, { forceFresh: true })).plan,
    "Pro",
  );
  state.value = null;
  assert.equal(await state.verify(admin(), SHOP, { forceFresh: true }), null);
  assert.equal(state.calls.length, 4);
});

test("cached access does not cross future trial or cancellation-cycle boundaries", async () => {
  for (const kind of ["trial", "cycle"]) {
    const edge = new Date(NOW + 1000).toISOString();
    const state = scenario(
      subscription(
        "premium",
        kind === "trial"
          ? { currentBillingCycle: null, trialEndsAt: edge }
          : {
              cancelAtEndOfCycle: true,
              currentBillingCycle: {
                startTime: new Date(NOW - 1000).toISOString(),
                endTime: edge,
              },
            },
      ),
    );
    assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
    state.value = null;
    state.now += 1000;
    assert.equal(await state.verify(admin(), SHOP), null);
    assert.equal(state.calls.length, 2);
  }
});

test("past trial dates do not disable the 30-second cache of a currently active paid contract", async () => {
  const state = scenario(
    subscription("premium", {
      trialEndsAt: new Date(NOW - 86_400_000).toISOString(),
    }),
  );
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal(state.calls.length, 1);
  state.now += 29_999;
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal(state.calls.length, 1);
  state.now += 1;
  assert.equal((await state.verify(admin(), SHOP)).plan, "Premium");
  assert.equal(state.calls.length, 2);
});

test("native SDK reauthorization responses retain identity and headers without Partner requests or cache fallback", async () => {
  const state = scenario();
  const control = new Response(null, {
    status: 401,
    headers: {
      "X-Shopify-API-Request-Failure-Reauthorize-Url": "/auth/login",
      "Set-Cookie": "fixture-state=reauth; HttpOnly; Secure; SameSite=None",
    },
  });
  const needsReauthentication = {
    graphql: async () => {
      throw control;
    },
  };
  await assert.rejects(
    state.verify(needsReauthentication, SHOP),
    (error) => error === control,
  );
  assert.equal(state.calls.length, 0);
  await state.verify(admin(), SHOP);
  assert.equal(state.calls.length, 1);
  await assert.rejects(
    state.verify(needsReauthentication, SHOP, { forceFresh: true }),
    (error) => {
      assert.equal(error, control);
      assert.equal(
        error.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
        "/auth/login",
      );
      assert.equal(
        error.headers.get("Set-Cookie"),
        control.headers.get("Set-Cookie"),
      );
      return true;
    },
  );
  assert.equal(state.calls.length, 1);
  state.value = null;
  assert.equal(await state.verify(admin(), SHOP), null);
  assert.equal(state.calls.length, 2);
});

test("simultaneous requests share verification and do not turn null into a paid object", async () => {
  for (const value of [subscription(), null]) {
    const state = scenario(value);
    const result = await Promise.all(
      Array.from({ length: 8 }, () => state.verify(admin(), SHOP)),
    );
    assert.equal(state.calls.length, 1);
    if (value === null) assert.deepEqual(result, Array(8).fill(null));
    else {
      result[0].analytics = false;
      assert.equal(result[1].analytics, true);
    }
  }
});

test("bounded cache evicts the oldest of more than 512 shops", async () => {
  let calls = 0;
  const verify = managed.createManagedPricingVerifier({
    env: () => ({ ...credentials }),
    now: () => NOW,
    fetch: async (_url, init) => {
      calls++;
      const { shopId } = JSON.parse(init.body).variables;
      const number = shopId.split("/").at(-1);
      return Response.json({
        data: {
          activeSubscription: subscription("premium", {
            shop: {
              id: shopId,
              myshopifyDomain: `shop-${number}.myshopify.com`,
            },
          }),
        },
      });
    },
  });
  const identity = (number) =>
    admin({
      shop: {
        id: `gid://shopify/Shop/${number}`,
        myshopifyDomain: `shop-${number}.myshopify.com`,
      },
    });
  for (let number = 1; number <= 513; number++)
    await verify(identity(number), `shop-${number}.myshopify.com`);
  assert.equal(calls, 513);
  await verify(identity(513), "shop-513.myshopify.com");
  assert.equal(calls, 513);
  await verify(identity(1), "shop-1.myshopify.com");
  assert.equal(calls, 514);
});

test("provider errors, malformed JSON and timeouts fail closed without leaking credentials", async () => {
  const state = scenario();
  for (const status of [401, 403, 429, 500, 503]) {
    state.response = () =>
      Response.json({ private: "fixture-partner-token" }, { status });
    await assert.rejects(state.verify(admin(), SHOP), {
      code: "PARTNER_RESPONSE",
    });
  }
  state.response = () => new Response("<html>provider failure</html>");
  await assert.rejects(state.verify(admin(), SHOP), { code: "UNAVAILABLE" });
  let signal;
  const verify = managed.createManagedPricingVerifier({
    env: () => ({ ...credentials }),
    now: () => NOW,
    timeoutMs: 5,
    fetch: async (_url, init) => {
      signal = init.signal;
      return new Promise((resolve, reject) => {
        const keepAlive = setTimeout(resolve, 100);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(keepAlive);
            reject(new Error("private fixture-partner-token timeout"));
          },
          { once: true },
        );
      });
    },
  });
  await assert.rejects(verify(admin(), SHOP), (error) => {
    assert.equal(error.code, "UNAVAILABLE");
    assert.equal(error.status, 503);
    assert.equal(error.message.includes("fixture-partner-token"), false);
    return true;
  });
  assert.equal(signal.aborted, true);
});
