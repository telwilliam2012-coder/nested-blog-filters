/* eslint-env node */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const chrome = [
  process.env.NBF_TEST_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].find((file) => file && existsSync(file));
const catalogs = Object.fromEntries(
  ["es", "en", "de", "it", "fr"].map((locale) => [
    locale,
    JSON.parse(
      readFileSync(
        new URL(`../app/locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ),
  ]),
);

test(
  "admin language and help preserve drafts, validate contact, work on mobile and keep per-shop preferences",
  {
    skip: !chrome && "Set NBF_TEST_BROWSER to a Chromium executable",
    timeout: 120000,
  },
  async (context) => {
    const vite = await createServer({
      root,
      configFile: false,
      appType: "custom",
      cacheDir: "node_modules/.cache/vite-i18n-browser",
      server: { host: "127.0.0.1", port: 0, hmr: false },
      optimizeDeps: { include: ["react", "react-dom/client", "react-router"] },
    });
    vite.middlewares.use((request, response, next) => {
      if (!request.url.startsWith("/__i18n")) return next();
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(
        '<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root"></div><script type="module" src="/tests/i18n-browser-entry.tsx"></script></body></html>',
      );
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const profile = mkdtempSync(path.join(tmpdir(), "nbf-i18n-browser-"));
    const browser = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-extensions",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: "ignore", windowsHide: true },
    );
    let socket;
    try {
      let port;
      for (let attempt = 0; !port && attempt < 150; attempt++) {
        try {
          const candidate = readFileSync(
            path.join(profile, "DevToolsActivePort"),
            "utf8",
          )
            .split("\n")[0]
            .trim();
          if (/^\d+$/.test(candidate)) port = candidate;
        } catch (error) {
          if (!["ENOENT", "EBUSY", "EPERM"].includes(error.code)) throw error;
        }
        if (!port) await delay(50);
      }
      assert.ok(port, "Chromium did not open its debugging port");
      const page = (
        await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      ).find((target) => target.type === "page");
      socket = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      let id = 0;
      const pending = new Map();
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const handler = pending.get(message.id);
        if (!handler) return;
        pending.delete(message.id);
        clearTimeout(handler.timer);
        message.error
          ? handler.reject(message.error)
          : handler.resolve(message.result);
      };
      const call = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const messageId = ++id;
          const timer = setTimeout(() => {
            pending.delete(messageId);
            reject(new Error(`CDP timeout: ${method}`));
          }, 10000);
          pending.set(messageId, { resolve, reject, timer });
          socket.send(JSON.stringify({ id: messageId, method, params }));
        });
      const evaluate = async (expression) => {
        const result = await call("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        assert.equal(
          result.exceptionDetails,
          undefined,
          JSON.stringify(result.exceptionDetails),
        );
        return result.result.value;
      };
      const waitFor = async (expression) => {
        for (let attempt = 0; attempt < 300; attempt++) {
          if (await evaluate(expression)) return;
          await delay(30);
        }
        assert.fail(`Browser condition timed out: ${expression}`);
      };
      const go = async (query = "") => {
        await call("Page.navigate", { url: `${origin}/__i18n${query}` });
        await waitFor(
          "document.querySelector('#nbf-admin-language') !== null && document.documentElement.lang !== ''",
        );
      };
      const choose = async (locale) => {
        await evaluate(
          `{ const select = document.querySelector('#nbf-admin-language'); select.value = '${locale}'; select.dispatchEvent(new Event('change', { bubbles: true })); }`,
        );
        await waitFor(`document.documentElement.lang === '${locale}'`);
      };
      await call("Page.enable");
      await go();
      for (const locale of ["es", "en", "de", "it", "fr"]) {
        await choose(locale);
        assert.deepEqual(
          await evaluate(
            "[document.querySelector('s-section').getAttribute('heading'), document.querySelector('s-app-nav s-link').textContent, localStorage.getItem('nbf.admin.locale:one.myshopify.com')]",
          ),
          [
            catalogs[locale]["Filtros de tus blogs"],
            catalogs[locale].Inicio,
            locale,
          ],
        );
        assert.equal(
          await evaluate(
            `document.body.textContent.includes(${JSON.stringify(new Intl.NumberFormat(locale).format(10000))})`,
          ),
          true,
        );
      }
      await go();
      await waitFor("document.documentElement.lang === 'fr'");
      await evaluate(
        "document.querySelector('s-app-nav s-link[href=\"/app/filters\"]').click()",
      );
      await waitFor(
        `document.querySelector('s-page')?.getAttribute('heading') === ${JSON.stringify(catalogs.fr["Crear conjunto de filtros"])}`,
      );
      await evaluate(
        "{ const field = document.querySelector('s-text-field'); field.value = 'Borrador intacto'; field.dispatchEvent(new Event('input', {bubbles:true})); localStorage.setItem('nbf.admin.locale:one.myshopify.com','de'); window.dispatchEvent(new StorageEvent('storage', {key:'nbf.admin.locale:one.myshopify.com', newValue:'de', storageArea:localStorage})); }",
      );
      await waitFor(
        `document.querySelector('s-page')?.getAttribute('heading') === ${JSON.stringify(catalogs.de["Crear conjunto de filtros"])}`,
      );
      assert.deepEqual(
        await evaluate(
          "[document.querySelector('s-text-field').value, Boolean(document.querySelector('s-text-field[value=motivo]')), Boolean(document.querySelector('s-text-field[value=Navidad]'))]",
        ),
        ["Borrador intacto", true, true],
      );
      await evaluate(`{
        window.__supportOpened = [];
        window.open = (...args) => { window.__supportOpened.push(args); return null; };
        const origin = document.createElement('button');
        origin.id = 'support-focus-origin';
        origin.textContent = 'Focus origin';
        document.body.append(origin);
        origin.focus();
        document.querySelector('[data-help-launcher]').click();
      }`);
      await waitFor(
        "document.querySelector('#nbf-help-drawer').open && document.querySelector('#nbf-help-drawer').getBoundingClientRect().right <= innerWidth + 0.5",
      );
      assert.deepEqual(
        await evaluate(
          "{ const node = document.querySelector('[data-help-launcher]').parentElement; const style = getComputedStyle(node); [style.position, style.bottom, style.right, style.zIndex]; }",
        ),
        ["fixed", "20px", "20px", "100"],
      );
      await waitFor(
        "document.querySelector('#nbf-help-drawer').contains(document.activeElement)",
      );
      const drawerGeometry = await evaluate(
        "{ const dialog = document.querySelector('#nbf-help-drawer'); ({width:dialog.getBoundingClientRect().width, activeTag:document.activeElement.tagName, activeId:document.activeElement.id}); }",
      );
      assert.ok(drawerGeometry.width <= 480.5, JSON.stringify(drawerGeometry));
      await evaluate(
        "document.querySelector('[data-support-form] s-button[type=submit]').click()",
      );
      await waitFor(
        "document.querySelectorAll('[data-support-field][error]').length === 2",
      );
      assert.equal(await evaluate("window.__supportOpened.length"), 0);
      await evaluate(`{
        for (const [field, value] of [['subject','No aparecen filtros'],['message','Me faltan filtros tras sincronizar.'],['replyEmail','merchant@example.com']]) {
          const input = document.querySelector('[data-support-field="' + field + '"]');
          input.value = value;
          input.dispatchEvent(new Event('input', {bubbles:true}));
        }
      }`);
      await evaluate(
        "document.querySelector('[data-support-form] s-button[type=submit]').click()",
      );
      await waitFor(
        "document.querySelector('[data-support-prepared]') !== null",
      );
      const prepared = new URL(
        await evaluate(
          "document.querySelector('[data-support-prepared]').getAttribute('href')",
        ),
      );
      assert.equal(prepared.pathname, "telwilliam2012@gmail.com");
      assert.ok(
        prepared.searchParams.get("body").includes("Seite: /app/filters"),
      );
      assert.equal(await evaluate("window.__supportOpened.length"), 1);
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await waitFor(
        "!document.querySelector('#nbf-help-drawer').open && document.activeElement.id === 'support-focus-origin'",
      );
      await evaluate("document.querySelector('[data-help-launcher]').click()");
      await waitFor("document.querySelector('#nbf-help-drawer').open");
      assert.equal(
        await evaluate(
          "document.querySelector('[data-support-field=subject]').value",
        ),
        "No aparecen filtros",
      );
      await evaluate(
        "document.querySelector('#nbf-help-drawer s-button[icon=\"book-open\"]').click()",
      );
      await waitFor(
        "document.querySelector('[data-help-inline-docs]') !== null",
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('[data-help-inline-docs] details').length",
        ),
        6,
      );
      await evaluate(
        "document.querySelector('[data-help-inline-docs] summary').click()",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('[data-help-inline-docs] details').open",
        ),
        true,
      );
      assert.equal(
        await evaluate("document.querySelector('s-text-field').value"),
        "Borrador intacto",
      );
      await evaluate(
        "document.querySelector('[data-help-back]').click(); localStorage.setItem('nbf.admin.locale:one.myshopify.com','fr'); window.dispatchEvent(new StorageEvent('storage', {key:'nbf.admin.locale:one.myshopify.com', newValue:'fr', storageArea:localStorage}))",
      );
      await waitFor(
        `document.querySelector('#nbf-help-heading').textContent === ${JSON.stringify(catalogs.fr["Ayuda de Dreamers APP"])}`,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('[data-support-field=subject]').getAttribute('label')",
        ),
        catalogs.fr.Asunto,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('[data-support-field=subject]').value",
        ),
        "No aparecen filtros",
      );
      await call("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 780,
        deviceScaleFactor: 1,
        mobile: true,
      });
      const mobileGeometry = await evaluate(`({
        innerWidth,
        documentWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        drawerWidth: document.querySelector('#nbf-help-drawer').getBoundingClientRect().width,
      })`);
      const mobileDiagnostic = JSON.stringify(mobileGeometry);
      assert.equal(mobileGeometry.documentWidth, 375, mobileDiagnostic);
      assert.equal(mobileGeometry.innerWidth, 375, mobileDiagnostic);
      assert.equal(
        mobileGeometry.drawerWidth <= 375 &&
          mobileGeometry.scrollWidth <= mobileGeometry.innerWidth,
        true,
        mobileDiagnostic,
      );
      await call("Emulation.clearDeviceMetricsOverride");
      await evaluate(
        "document.querySelector('[data-help-close]').click(); localStorage.setItem('nbf.admin.locale:one.myshopify.com','de'); window.dispatchEvent(new StorageEvent('storage', {key:'nbf.admin.locale:one.myshopify.com', newValue:'de', storageArea:localStorage}));",
      );
      await waitFor(
        "!document.querySelector('#nbf-help-drawer').open && document.documentElement.lang === 'de'",
      );
      await evaluate(
        "document.querySelector('#support-focus-origin').remove()",
      );
      await evaluate(
        "document.querySelector('s-app-nav s-link[href=\"/app/articles\"]').click()",
      );
      await waitFor(
        `document.querySelector('s-page')?.getAttribute('heading') === ${JSON.stringify(catalogs.de["Atributos de artículos"])}`,
      );
      assert.equal(
        await evaluate(
          `document.body.textContent.includes(${JSON.stringify(catalogs.de["Guardar etiquetas en Shopify"])})`,
        ),
        true,
      );
      await go("?shop=two.myshopify.com");
      await waitFor("document.documentElement.lang === 'es'");
      await choose("it");
      await go();
      await waitFor("document.documentElement.lang === 'de'");
      await evaluate(
        "localStorage.setItem('nbf.admin.locale:one.myshopify.com','xx')",
      );
      await go();
      await waitFor("document.documentElement.lang === 'es'");
      const script = await call("Page.addScriptToEvaluateOnNewDocument", {
        source:
          "Storage.prototype.getItem = Storage.prototype.setItem = function(){throw new DOMException('Blocked','SecurityError')}",
      });
      await go("?locale=fr");
      await waitFor("document.documentElement.lang === 'fr'");
      await choose("en");
      await call("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: script.identifier,
      });
    } finally {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 1000000, method: "Browser.close" }));
        await Promise.race([
          new Promise((resolve) => browser.once("exit", resolve)),
          delay(1500),
        ]);
      }
      socket?.close();
      if (browser.exitCode === null) {
        browser.kill();
        await delay(500);
      }
      await vite.close();
      if (
        path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) &&
        path.basename(profile).startsWith("nbf-i18n-browser-")
      ) {
        try {
          rmSync(profile, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 200,
          });
        } catch (error) {
          if (!["EPERM", "EBUSY", "ENOTEMPTY"].includes(error.code))
            throw error;
          context.diagnostic(
            "Windows retained a locked temporary Chromium profile.",
          );
        }
      }
    }
  },
);
