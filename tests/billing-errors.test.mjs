/* eslint-env node */
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  BillingError,
  GraphqlQueryError,
  HttpResponseError,
} from "@shopify/shopify-api";
import { createServer } from "vite";

let vite, describe;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    configFile: false,
    appType: "custom",
    server: {
      middlewareMode: true,
      watch: null,
      hmr: { server: createHttpServer() },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  ({ describeBillingFailure: describe } = await vite.ssrLoadModule(
    "/app/services/billing-errors.server.ts",
  ));
});
after(async () => {
  await vite?.close();
});

test("SDK BillingError keeps its concrete class and userErrors instead of a generic 502", () => {
  const error = new BillingError({
    message: "Error while billing the store",
    errorData: [{ field: ["returnUrl"], message: "Return URL is not allowed" }],
  });
  assert.equal(error.name, "Error");
  const result = describe(error);
  assert.equal(result.status, 422);
  assert.equal(result.diagnostic.errorType, "BillingError");
  assert.deepEqual(result.diagnostic.shopifyErrors, [
    { field: "returnUrl", message: "Return URL is not allowed" },
  ]);
  assert.deepEqual(result.details, ["Return URL is not allowed"]);
});

test("GraphQL schema validation errors are reported with their provider message", () => {
  const error = new GraphqlQueryError({
    message: "GraphQL Client: errors",
    response: {},
    headers: {},
    body: {
      errors: { graphQLErrors: [{ message: "Invalid interval value" }] },
    },
  });
  assert.equal(describe(error).status, 422);
  assert.deepEqual(describe(error).details, ["Invalid interval value"]);
});

test("network failures stay distinct from rejected billing requests", () => {
  const unavailable = new HttpResponseError({
    message: "Shopify unavailable",
    code: 503,
    statusText: "Unavailable",
    body: "<html>private upstream page</html>",
    headers: { Authorization: "Bearer secret" },
  });
  const result = describe(unavailable);
  assert.equal(result.status, 503);
  assert.equal(result.diagnostic.upstreamStatus, 503);
  assert.equal(JSON.stringify(result).includes("private upstream page"), false);
  assert.equal(JSON.stringify(result).includes("Bearer secret"), false);
  const wrapped = new BillingError({
    message: "Client failure",
    errorData: { networkStatusCode: 503 },
  });
  assert.equal(describe(wrapped).status, 503);
  const connection = new TypeError("fetch failed", {
    cause: Object.assign(new Error("connect failed"), { code: "ECONNRESET" }),
  });
  assert.equal(describe(connection).status, 503);
});

test("billing diagnostics redact credentials, email and excessive provider text", () => {
  const error = new BillingError({
    message: "Authorization: Bearer private-token",
    errorData: [
      {
        field: ["name"],
        message:
          "accessToken=private-access&hmac=private-hmac user@example.com shpat_private123",
      },
      ...Array.from({ length: 15 }, () => ({ message: "x".repeat(3000) })),
    ],
  });
  const result = describe(error);
  const text = JSON.stringify(result);
  for (const secret of [
    "private-token",
    "private-access",
    "private-hmac",
    "user@example.com",
    "shpat_private123",
  ])
    assert.equal(text.includes(secret), false, secret);
  assert.equal(result.details.length, 8);
  assert.ok(result.details.every((value) => value.length <= 600));
  assert.equal(describe(new Error("Unexpected local failure")).status, 500);
});
