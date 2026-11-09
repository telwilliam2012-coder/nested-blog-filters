/* eslint-env node */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

test(
  "public landing links to privacy, app entry preserves Shopify context and the initial manifest contains Help",
  { timeout: 45000 },
  async () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const directory = mkdtempSync(path.join(tmpdir(), "nbf-route-manifest-"));
    const environment = Object.fromEntries(
      ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET"].map((key) => [
        key,
        process.env[key],
      ]),
    );
    // The standalone GDPR handler initializes its API verifier when the complete
    // server build is imported. Supply fixture values; no real request is authenticated.
    process.env.SHOPIFY_API_KEY = "route-manifest-test-api-key";
    process.env.SHOPIFY_API_SECRET = "route-manifest-test-api-secret";
    let server;
    try {
      server = await createServer({
        root,
        mode: "test",
        configFile: path.join(root, "vite.config.ts"),
        envDir: directory,
        cacheDir: path.join(directory, "vite-cache"),
        plugins: [
          {
            name: "isolated-route-manifest-services",
            enforce: "pre",
            resolveId(id) {
              if (/(?:^|\/)shopify\.server(?:\.tsx?)?$/.test(id))
                return "\0manifest-test-shopify";
              if (/(?:^|\/)db\.server(?:\.tsx?)?$/.test(id))
                return "\0manifest-test-db";
            },
            load(id) {
              if (id === "\0manifest-test-db") {
                return `export default new Proxy({}, { get() { throw new Error("The manifest test must never access SQLite"); } });`;
              }
              if (id === "\0manifest-test-shopify") {
                return `
              const forbidden = () => { throw new Error("The entry test must never authenticate or call Shopify"); };
              const admin = async (request) => {
                if (new URL(request.url).pathname !== "/app/help") forbidden();
                return {
                  session: { shop: "manifest-test.myshopify.com" },
                  admin: new Proxy({}, { get: forbidden }),
                  billing: new Proxy({}, { get: forbidden }),
                };
              };
              export const authenticate = { admin, public: forbidden, webhook: forbidden };
              export const login = forbidden;
              export const addDocumentResponseHeaders = () => {};
              export const unauthenticated = {};
              export const sessionStorage = {};
              export const registerWebhooks = forbidden;
              export const apiVersion = "2026-07";
              export default {};
            `;
              }
            },
          },
        ],
        server: {
          host: "127.0.0.1",
          port: 0,
          strictPort: true,
          hmr: false,
          watch: null,
        },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      await server.listen();
      const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      const landing = await fetch(origin + "/", {
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });
      const landingHtml = await landing.text();
      assert.equal(landing.status, 200);
      assert.ok(landingHtml.includes("Nested Blog Filters &amp; Search"));
      assert.match(landingHtml, /href="\/privacy"/);
      assert.ok(!landingHtml.includes("A short heading about [your app]"));
      for (const query of [
        "?shop=manifest-test.myshopify.com",
        "?host=YWRtaW4uc2hvcGlmeS5jb20%3D",
        "?embedded=1",
        "?id_token=fake%2Etoken",
        "?host=YWRtaW4uc2hvcGlmeS5jb20%3D&embedded=1&locale=es&id_token=fake%2Etoken&hmac=a%2Bb%2Fc%3D&note=two%20words&tag=a&tag=b&returnTo=https%3A%2F%2Funtrusted.example%2F",
        "?shop=manifest-test.myshopify.com&host=YWRtaW4uc2hvcGlmeS5jb20%3D&embedded=1&locale=fr",
      ]) {
        const entry = await fetch(origin + "/" + query, {
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        });
        assert.equal(entry.status, 302);
        assert.equal(entry.headers.get("Cache-Control"), "no-store");
        const destination = new URL(entry.headers.get("Location"), origin);
        assert.equal(destination.origin, origin);
        assert.equal(destination.pathname, "/app");
        // React Router canonicalizes query encoding before invoking loaders.
        // Preserve every value and duplicate, including signed Shopify context.
        assert.deepEqual(
          [...destination.searchParams],
          [...new URL(origin + "/" + query).searchParams],
        );
        await entry.body?.cancel();
      }
      const response = await fetch(origin + "/app/help?locale=es", {
        signal: AbortSignal.timeout(20000),
      });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.ok(html.includes("Ayuda y documentación"));
      assert.ok(!html.includes("A short heading about [your app]"));
      assert.match(html, /"routeDiscovery":\{"mode":"initial"\}/);
      // Initial discovery imports the complete manifest in the first document;
      // lazy discovery would only inline the current page and fetch patches later.
      const manifestImport = html.match(
        /import\s+["']([^"']*manifest[^"']*)["']/,
      );
      assert.ok(
        manifestImport,
        "the document must load the complete route manifest",
      );
      const manifestResponse = await fetch(new URL(manifestImport[1], origin), {
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(manifestResponse.status, 200);
      const manifest = await manifestResponse.text();
      assert.match(manifest, /["']routes\/app\.help["']\s*:\s*\{/);
      assert.match(manifest, /["']routes\/app\.billing["']\s*:\s*\{/);
      assert.ok(
        !html.includes("window.__reactRouterManifest ="),
        "initial discovery must not inline a partial route manifest",
      );
    } finally {
      await server?.close();
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      if (
        path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
        path.basename(directory).startsWith("nbf-route-manifest-")
      ) {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
);
