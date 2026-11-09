/* eslint-env node */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
import { buildProductionTools } from "../scripts/build-production-tools.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const shop = "ops-diagnostic.myshopify.com";
const secret = "fixture-private-partner-token-never-output";
let vite, directory, artifactDirectory, diagnostic, plans, provider;

before(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "nbf-billing-ops-"));
  vite = await createServer({
    root,
    configFile: false,
    envDir: directory,
    appType: "custom",
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  diagnostic = await vite.ssrLoadModule("/scripts/verify-managed-pricing.ts");
  plans = await vite.ssrLoadModule("/app/billing-plans.ts");
  provider = await vite.ssrLoadModule(
    "/app/services/managed-pricing.server.ts",
  );
});

after(async () => {
  await vite?.close();
  if (
    directory &&
    path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
    path.basename(directory).startsWith("nbf-billing-ops-")
  )
    rmSync(directory, { recursive: true, force: true });
  const artifactRoot = path.resolve(root, "artifacts/pro-premium");
  if (
    artifactDirectory &&
    path.dirname(path.resolve(artifactDirectory)) === artifactRoot &&
    path.basename(artifactDirectory).startsWith("ops-test-")
  )
    rmSync(artifactDirectory, { recursive: true, force: true });
});

function fixture(plan = "Premium") {
  const calls = [];
  const admin = {
    graphql() {
      throw new Error("The diagnostic must delegate reads to its verifier.");
    },
  };
  return {
    calls,
    admin,
    loadContext: async (requestedShop) => {
      calls.push(["session", requestedShop]);
      return { admin, session: { shop } };
    },
    verify: async (actualAdmin, requestedShop, options) => {
      assert.equal(actualAdmin, admin);
      calls.push(["verify", requestedShop, options]);
      return plan ? plans.getPlanAccess(plan) : null;
    },
    disconnect: async () => calls.push(["disconnect"]),
  };
}

test("private diagnostic requires one explicit valid Shopify shop before loading SDK", async () => {
  for (const args of [
    [],
    ["--shop"],
    ["--help"],
    ["--shop", shop, "--charge"],
    [shop, "another.myshopify.com"],
    ["--shop=ops-diagnostic.myshopify.com"],
    ["https://ops-diagnostic.myshopify.com"],
    ["ops-diagnostic.myshopify.com/"],
    ["https://malicious.test/@ops-diagnostic.myshopify.com"],
    ["ops-diagnostic.myshopify.com.attacker.test"],
    ["bad_store.myshopify.com"],
    ["-bad.myshopify.com"],
    ["bad-.myshopify.com"],
    [`${"a".repeat(64)}.myshopify.com`],
  ]) {
    const result = await diagnostic.runManagedPricingDiagnostic(args, () => {
      assert.fail(
        "Invalid arguments must not initialize SDK or session storage.",
      );
    });
    assert.deepEqual(result, {
      exitCode: 2,
      result: { verified: false, code: "INVALID_ARGUMENTS" },
    });
  }
  assert.equal(diagnostic.diagnosticShop(["--shop", shop.toUpperCase()]), shop);
  assert.equal(diagnostic.diagnosticShop([shop]), shop);
});

test("diagnostic reads exactly the requested offline session and force-refreshes the contract", async () => {
  for (const plan of ["Pro", "Premium", null]) {
    const dependencies = fixture(plan);
    const result = await diagnostic.runManagedPricingDiagnostic(
      ["--shop", shop.toUpperCase()],
      async () => dependencies,
    );
    assert.deepEqual(result, {
      exitCode: 0,
      result: { shop, verified: true, plan },
    });
    assert.deepEqual(dependencies.calls, [
      ["session", shop],
      ["verify", shop, { forceFresh: true }],
      ["disconnect"],
    ]);
    assert.deepEqual(Object.keys(result.result).sort(), [
      "plan",
      "shop",
      "verified",
    ]);
  }
});

test("mismatched or missing offline shop never invokes subscription verification", async () => {
  for (const session of [{ shop: "other.myshopify.com" }, {}, null]) {
    const dependencies = fixture();
    dependencies.loadContext = async () => ({
      admin: dependencies.admin,
      session,
    });
    dependencies.verify = async () =>
      assert.fail("A different shop must not be queried.");
    assert.deepEqual(
      await diagnostic.runManagedPricingDiagnostic(
        [shop],
        async () => dependencies,
      ),
      {
        exitCode: 1,
        result: { verified: false, code: "OFFLINE_SESSION_UNAVAILABLE" },
      },
    );
    assert.deepEqual(dependencies.calls, [["disconnect"]]);
  }
});

test("core preserves native Shopify authentication Response and its headers unchanged", async () => {
  for (const source of ["loadContext", "verify"]) {
    const response = new Response(secret, {
      status: 401,
      headers: { "X-Shopify-API-Request-Failure-Reauthorize": "1" },
    });
    const dependencies = fixture();
    dependencies[source] = async () => {
      throw response;
    };
    await assert.rejects(
      diagnostic.verifyShopManagedPricing(shop, dependencies),
      (error) => error === response,
    );
    assert.equal(
      response.headers.get("X-Shopify-API-Request-Failure-Reauthorize"),
      "1",
    );
    assert.deepEqual(
      await diagnostic.runManagedPricingDiagnostic(
        [shop],
        async () => dependencies,
      ),
      {
        exitCode: 1,
        result: { verified: false, code: "AUTHENTICATION_REQUIRED" },
      },
    );
  }
});

test("private diagnostic emits static codes without provider bodies, credentials or stacks", async () => {
  for (const code of [
    "CONFIGURATION",
    "IDENTITY",
    "PARTNER_RESPONSE",
    "UNKNOWN_PLAN",
    "UNAVAILABLE",
  ]) {
    const dependencies = fixture();
    const error = new provider.ManagedPricingVerificationError(code);
    error.message = secret;
    error.stack = secret;
    dependencies.verify = async () => {
      throw error;
    };
    const result = await diagnostic.runManagedPricingDiagnostic(
      [shop],
      async () => dependencies,
    );
    assert.deepEqual(result, {
      exitCode: 1,
      result: { verified: false, code },
    });
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  for (const error of [
    new Error(secret),
    { name: "ManagedPricingVerificationError", code: secret },
  ]) {
    const dependencies = fixture();
    dependencies.verify = async () => {
      throw error;
    };
    assert.deepEqual(
      await diagnostic.runManagedPricingDiagnostic(
        [shop],
        async () => dependencies,
      ),
      { exitCode: 1, result: { verified: false, code: "VERIFICATION_FAILED" } },
    );
  }
});

test("initialization, offline-session and cleanup errors remain private and return failure", async () => {
  assert.deepEqual(
    await diagnostic.runManagedPricingDiagnostic([shop], async () => {
      throw new Error(secret);
    }),
    { exitCode: 1, result: { verified: false, code: "INITIALIZATION_FAILED" } },
  );
  const dependencies = fixture();
  dependencies.loadContext = async () => {
    throw new Error(secret);
  };
  assert.deepEqual(
    await diagnostic.runManagedPricingDiagnostic(
      [shop],
      async () => dependencies,
    ),
    {
      exitCode: 1,
      result: { verified: false, code: "OFFLINE_SESSION_UNAVAILABLE" },
    },
  );
  dependencies.loadContext = async () => ({
    admin: dependencies.admin,
    session: { shop },
  });
  dependencies.disconnect = async () => {
    throw new Error(secret);
  };
  assert.deepEqual(
    await diagnostic.runManagedPricingDiagnostic(
      [shop],
      async () => dependencies,
    ),
    {
      exitCode: 1,
      result: { verified: false, code: "SESSION_CLEANUP_FAILED" },
    },
  );
});

test("SDK log output is silenced and console methods are restored after verification", async () => {
  const methods = ["log", "info", "warn", "error", "debug"];
  const original = Object.fromEntries(
    methods.map((name) => [name, console[name]]),
  );
  const output = [];
  try {
    for (const name of methods)
      console[name] = (...values) => output.push(values);
    const installed = Object.fromEntries(
      methods.map((name) => [name, console[name]]),
    );
    const dependencies = fixture();
    dependencies.verify = async () => {
      for (const name of methods) console[name](secret);
      throw new Error(secret);
    };
    await diagnostic.runManagedPricingDiagnostic([shop], async () => {
      console.info(secret);
      return dependencies;
    });
    assert.deepEqual(output, []);
    for (const name of methods) assert.equal(console[name], installed[name]);
  } finally {
    Object.assign(console, original);
  }
});

test("diagnostic exposes no charge operation and rejects an unrecognized verifier tier", async () => {
  const dependencies = fixture();
  dependencies.billing = new Proxy(
    {},
    { get: () => assert.fail("No billing writes are allowed.") },
  );
  dependencies.verify = async () => ({ plan: "Starter", accessToken: secret });
  assert.deepEqual(
    await diagnostic.runManagedPricingDiagnostic(
      [shop],
      async () => dependencies,
    ),
    { exitCode: 1, result: { verified: false, code: "VERIFICATION_FAILED" } },
  );
  const source = readFileSync(
    path.join(root, "scripts/verify-managed-pricing.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /appSubscriptionCreate|appSubscriptionCancel|\.billing\.request|confirmationUrl/,
  );
});

test("main guard leaves imports inert, and production tool builds without inlining environment", async () => {
  const filename = path.join(root, "scripts/verify-managed-pricing.ts");
  assert.equal(
    diagnostic.diagnosticIsMain(pathToFileURL(filename).href, filename),
    true,
  );
  assert.equal(
    diagnostic.diagnosticIsMain(
      pathToFileURL(filename).href,
      "another-script.mjs",
    ),
    false,
  );

  const artifactRoot = path.resolve(root, "artifacts/pro-premium");
  mkdirSync(artifactRoot, { recursive: true });
  artifactDirectory = mkdtempSync(path.join(artifactRoot, "ops-test-"));
  await buildProductionTools(artifactDirectory);
  const compiled = path.join(artifactDirectory, "verify-managed-pricing.mjs");
  const contents = readFileSync(compiled, "utf8");
  assert.ok(/env\.SHOPIFY_PARTNER_API_ACCESS_TOKEN/.test(contents));
  assert.ok(/process\.env/.test(contents));
  assert.ok(/@shopify\/shopify-app-react-router/.test(contents));
  assert.equal(contents.includes(secret), false);

  const result = spawnSync(process.execPath, [compiled, "--charge"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      SHOPIFY_API_KEY: "",
      SHOPIFY_API_SECRET: "",
      SHOPIFY_APP_URL: "",
      DATABASE_URL: "",
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    verified: false,
    code: "INVALID_ARGUMENTS",
  });
  assert.equal(result.stdout.trim().split("\n").length, 1);
});
