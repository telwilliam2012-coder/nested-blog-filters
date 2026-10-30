/* eslint-env node */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const chrome = [
  process.env.NBF_TEST_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].find((file) => file && existsSync(file));
const assets = path.join(root, "extensions/nested-blog-filters/assets");
const articles = [
  {
    id: "a",
    title: "Una historia floral",
    handle: "historia-floral",
    motive: "floral",
    occasion: "wedding",
  },
  {
    id: "b",
    title: "<img src=x onerror=alert(1)>",
    handle: "historia-segura",
    motive: "abstract",
    occasion: "birthday",
  },
  {
    id: "c",
    title: "Otra historia floral",
    handle: "otra-floral",
    motive: "floral",
    occasion: "birthday",
  },
];

function payload(params) {
  const selected = Object.fromEntries(
    ["motive", "occasion"].map((id) => [id, params.getAll(`option.${id}`)]),
  );
  const matches = (article, except) =>
    Object.entries(selected).every(
      ([id, options]) =>
        id === except || !options.length || options.includes(article[id]),
    );
  const matchesAll = articles.filter((article) => matches(article));
  const page = Number(params.get("page"));
  return {
    status: "ready",
    total: matchesAll.length,
    page,
    pageSize: 2,
    totalPages: Math.ceil(matchesAll.length / 2),
    filters: [
      ["motive", "Motivo", ["floral", "abstract"]],
      ["occasion", "Ocasión", ["wedding", "birthday"]],
    ].map(([id, label, options]) => ({
      id,
      label,
      options: options.map((value) => {
        const count = articles.filter(
          (article) => matches(article, id) && article[id] === value,
        ).length;
        return {
          id: value,
          label:
            {
              celebrations: "Celebraciones",
              decorations: "Decoraciones",
              festivities: "Festividades",
              special: "Ocasiones Especiales",
              christmas: "Navidad",
              halloween: "Halloween",
            }[value] ?? value,
          count,
          available: count > 0,
          selected: selected[id].includes(value),
        };
      }),
    })),
    articles: matchesAll
      .slice((page - 1) * 2, page * 2)
      .map(({ id, title, handle }) => ({
        id,
        title,
        handle,
        publishedAt: "2020-01-01T12:00:00.000Z",
      })),
  };
}

function nestedPayload(params) {
  const selected = Object.fromEntries(
    ["root", "occasion", "holiday"].map((id) => [
      id,
      params.getAll(`option.${id}`),
    ]),
  );
  const entries = [
    {
      id: "christmas",
      title: "Fiesta de Navidad",
      handle: "fiesta-de-navidad",
      root: "celebrations",
      occasion: "festivities",
      holiday: "christmas",
      image: { url: "/fixture.svg", alt: "Decoración de Navidad" },
    },
    {
      id: "halloween",
      title: "Fiesta de Halloween",
      handle: "fiesta-de-halloween",
      root: "celebrations",
      occasion: "festivities",
      holiday: "halloween",
    },
    {
      id: "decoration",
      title: "Una decoración",
      handle: "decoracion",
      root: "decorations",
    },
  ];
  const matches = (article, ids) =>
    ids.every(
      (id) => !selected[id].length || selected[id].includes(article[id]),
    );
  const results = entries.filter((article) =>
    matches(article, ["root", "occasion", "holiday"]),
  );
  return {
    status: "ready",
    total: results.length,
    page: 1,
    pageSize: 12,
    totalPages: 1,
    filters: [
      {
        id: "root",
        label: "Motivos",
        visible: true,
        parentFilterId: null,
        values: ["celebrations", "decorations"],
        ancestors: [],
      },
      {
        id: "occasion",
        label: "Ocasión",
        visible: selected.root.includes("celebrations"),
        parentFilterId: "root",
        values: ["festivities", "special"],
        ancestors: ["root"],
      },
      {
        id: "holiday",
        label: "Festividades",
        visible:
          selected.root.includes("celebrations") &&
          selected.occasion.includes("festivities"),
        parentFilterId: "occasion",
        values: ["christmas", "halloween"],
        ancestors: ["root", "occasion"],
      },
    ].map(({ values, ancestors, ...filter }) => ({
      ...filter,
      options: values.map((value) => {
        const count = entries.filter(
          (article) =>
            matches(article, ancestors) && article[filter.id] === value,
        ).length;
        return {
          id: value,
          label:
            {
              celebrations: "Celebraciones",
              decorations: "Decoraciones",
              festivities: "Festividades",
              special: "Ocasiones Especiales",
              christmas: "Navidad",
              halloween: "Halloween",
            }[value] ?? value,
          count,
          available: count > 0,
          selected: selected[filter.id].includes(value),
        };
      }),
    })),
    articles: results,
  };
}

function block(id) {
  return `<nested-blog-filters id="${id}" class="nbf" data-blog-id="gid://shopify/Blog/1"
    data-blog-url="/blogs/historias" data-proxy-url="/apps/nested-filters" data-page-size="2"
    data-locale="es" data-loading="Cargando…" data-error="Error al consultar" data-empty="Sin coincidencias"
    data-results-label="Artículos encontrados: [count]" data-page-label="Página [current] de [total]" data-read-label="Leer artículo"
    data-choose-label="Elige una opción" data-remove-label="Quitar [value]" data-empty-title="Probemos otra combinación">
    <header class="nbf__header"><p class="nbf__eyebrow">Inspiración para cada celebración</p><h2 class="nbf__heading">Ideas para celebrar a tu manera</h2><p>Encuentra inspiración para tu próxima fiesta. Elige un motivo y descubre las opciones relacionadas.</p></header>
    <section class="nbf__toolbar" data-toolbar hidden><div class="nbf__panel-heading"><h3 class="nbf__filter-title">Encuentra tu idea</h3><button class="nbf__clear" data-clear>Limpiar filtros</button></div><div class="nbf__filters" data-filters></div><div class="nbf__active" data-active hidden></div><p class="nbf__guide">Empieza por un motivo y sigue las opciones que aparecen. Puedes elegir varias en cada filtro.</p></section>
    <p class="nbf__status" data-status role="status" aria-live="polite"></p><button data-retry hidden>Reintentar</button>
    <div data-results-container><ul class="nbf__articles" data-results><li>Artículo de Liquid</li></ul></div>
    <nav class="nbf__pagination" data-pagination hidden><button class="nbf__button" data-previous>Anterior</button><span data-page></span><button class="nbf__button" data-next>Siguiente</button></nav>
    <p data-blog-link><a href="/blogs/historias">Ver el blog</a></p>
  </nested-blog-filters>`;
}

test(
  "storefront works in Chromium: multi-select, races, safe text, recovery, lifecycle and mobile layout",
  {
    skip:
      !chrome &&
      "Set NBF_TEST_BROWSER to a Chromium executable to run browser checks",
    timeout: 30000,
  },
  async () => {
    let mode = "ready";
    let requests = 0;
    let race = false;
    const nestedRequests = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/apps/nested-filters") {
        requests++;
        const result = ["nested", "preview"].includes(mode)
          ? nestedPayload(url.searchParams)
          : payload(url.searchParams);
        if (mode === "preview")
          result.articles.forEach((article) => {
            delete article.image;
          });
        if (mode === "nested") nestedRequests.push(url.searchParams);
        const responseMode = mode;
        if (
          race &&
          url.searchParams.has("option.motive") &&
          !url.searchParams.has("option.occasion")
        )
          await delay(180);
        response.writeHead(responseMode === "error" ? 503 : 200, {
          "Content-Type": "application/json",
        });
        response.end(
          JSON.stringify(
            responseMode === "unconfigured"
              ? { status: "unconfigured" }
              : result,
          ),
        );
      } else if (url.pathname === "/fixture.svg") {
        response.setHeader("Content-Type", "image/svg+xml");
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="red"/></svg>',
        );
      } else if (
        url.pathname === "/filters.js" ||
        url.pathname === "/filters.css"
      ) {
        response.setHeader(
          "Content-Type",
          url.pathname.endsWith("js") ? "text/javascript" : "text/css",
        );
        response.end(readFileSync(path.join(assets, url.pathname.slice(1))));
      } else {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<!doctype html><html lang="es"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/filters.css"><style>body{font:16px system-ui;margin:0;color:#1f2937}button,input{font:inherit}</style><body>${block("one")}${block("two")}<script src="/filters.js" defer></script></body></html>`,
        );
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = mkdtempSync(path.join(tmpdir(), "nbf-browser-"));
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
      const portFile = path.join(profile, "DevToolsActivePort");
      for (let attempt = 0; !existsSync(portFile) && attempt < 100; attempt++)
        await delay(50);
      assert.ok(
        existsSync(portFile),
        "Chromium did not open its local debugging port",
      );
      const port = readFileSync(portFile, "utf8").split("\n")[0];
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
        if (handler) {
          pending.delete(message.id);
          clearTimeout(handler.timer);
          message.error
            ? handler.reject(message.error)
            : handler.resolve(message.result);
        }
      };
      const call = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const messageId = ++id;
          const timer = setTimeout(() => {
            pending.delete(messageId);
            reject(new Error(`CDP timeout: ${method}`));
          }, 5000);
          pending.set(messageId, { resolve, reject, timer });
          socket.send(JSON.stringify({ id: messageId, method, params }));
        });
      const evaluate = async (expression) => {
        const result = await call("Runtime.evaluate", {
          expression,
          returnByValue: true,
          awaitPromise: true,
        });
        assert.equal(
          result.exceptionDetails,
          undefined,
          JSON.stringify(result.exceptionDetails),
        );
        return result.result.value;
      };
      const waitFor = async (expression) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (await evaluate(expression)) return;
          await delay(30);
        }
        assert.fail(`Browser condition timed out: ${expression}`);
      };
      const capture = async (name) => {
        if (!process.env.NBF_SCREENSHOT_DIR) return;
        await delay(180);
        mkdirSync(process.env.NBF_SCREENSHOT_DIR, { recursive: true });
        const { cssContentSize } = await call("Page.getLayoutMetrics");
        const screenshot = await call("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
          clip: {
            x: 0,
            y: 0,
            width: cssContentSize.width,
            height: cssContentSize.height,
            scale: 1,
          },
        });
        writeFileSync(
          path.join(process.env.NBF_SCREENSHOT_DIR, name),
          Buffer.from(screenshot.data, "base64"),
        );
      };
      await call("Page.enable");
      await call("Page.navigate", { url: origin });
      await waitFor(
        `document.querySelector('#one [data-status]')?.textContent === 'Artículos encontrados: 3' && document.querySelector('#two [data-status]')?.textContent === 'Artículos encontrados: 3'`,
      );
      assert.equal(
        await evaluate("document.querySelectorAll('img').length"),
        0,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one [data-results]').textContent.includes('<img src=x onerror=alert(1)>')",
        ),
        true,
      );
      await evaluate("document.querySelector('#one [data-next]').click()");
      await waitFor(
        "document.querySelector('#one [data-page]').textContent === 'Página 2 de 2'",
      );
      await evaluate(
        "document.querySelector('#one input[value=floral]').closest('details').open=true; document.querySelector('#one input[value=floral]').focus(); document.querySelector('#one input[value=floral]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2'",
      );
      assert.equal(await evaluate("document.activeElement.value"), "floral");
      assert.equal(
        await evaluate(
          "document.querySelector('#two [data-status]').textContent",
        ),
        "Artículos encontrados: 3",
      );
      await evaluate(
        "document.querySelector('#one input[value=abstract]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#one input:checked').length",
        ),
        2,
      );
      await evaluate("document.querySelector('#one [data-clear]').click()");
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      race = true;
      await evaluate(
        "document.querySelector('#one input[value=floral]').click(); document.querySelector('#one input[value=wedding]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      await delay(250);
      assert.equal(
        await evaluate(
          "document.querySelector('#one [data-status]').textContent",
        ),
        "Artículos encontrados: 1",
      );
      mode = "error";
      await evaluate("document.querySelector('#one [data-clear]').click()");
      await waitFor(
        "document.querySelector('#one [data-retry]').hidden === false",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one [data-results-container]').hidden",
        ),
        true,
      );
      mode = "ready";
      await evaluate("document.querySelector('#one [data-retry]').click()");
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      await call("Emulation.setDeviceMetricsOverride", {
        width: 375,
        height: 850,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.equal(
        await evaluate("document.documentElement.scrollWidth <= 375"),
        true,
      );
      if (process.env.NBF_SCREENSHOT_DIR) {
        mkdirSync(process.env.NBF_SCREENSHOT_DIR, { recursive: true });
        const screenshot = await call("Page.captureScreenshot", {
          format: "png",
        });
        writeFileSync(
          path.join(process.env.NBF_SCREENSHOT_DIR, "storefront-mobile.png"),
          Buffer.from(screenshot.data, "base64"),
        );
      }
      mode = "nested";
      race = false;
      await evaluate("document.querySelector('#one [data-retry]').click()");
      await waitFor(
        "document.querySelector('#one input[value=celebrations]') !== null",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one details[data-filter-id=occasion]') === null",
        ),
        true,
      );
      assert.equal(
        await evaluate("document.querySelector('#one .nbf__image').alt"),
        "Decoración de Navidad",
      );
      await evaluate(
        "document.querySelector('#one input[value=celebrations]').click()",
      );
      await waitFor(
        "document.querySelector('#one input[value=festivities]') !== null",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one input[value=special]') === null",
        ),
        true,
      );
      await evaluate(
        "document.querySelector('#one input[value=festivities]').click()",
      );
      await waitFor(
        "document.querySelector('#one input[value=christmas]') !== null",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one summary[data-filter-id=root]').textContent.includes('Celebraciones')",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one summary[data-filter-id=holiday]').textContent.includes('Elige una opción')",
        ),
        true,
      );
      await evaluate(
        "document.querySelector('#one summary[data-filter-id=root]').click(); document.querySelector('#one summary[data-filter-id=occasion]').click()",
      );
      await waitFor(
        "document.querySelectorAll('#one details[open]').length === 1 && document.querySelector('#one details[data-filter-id=occasion]').open",
      );
      await evaluate(
        "document.querySelector('#one summary[data-filter-id=occasion]').dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true}))",
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#one details[open]').length",
        ),
        0,
      );
      assert.equal(
        await evaluate("document.activeElement.dataset.filterId"),
        "occasion",
      );
      await evaluate(
        "document.querySelector('#one summary[data-filter-id=holiday]').click()",
      );
      await call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: 5,
        y: 5,
        button: "left",
        clickCount: 1,
      });
      await call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: 5,
        y: 5,
        button: "left",
        clickCount: 1,
      });
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#one details[open]').length",
        ),
        0,
      );
      await evaluate(
        "document.querySelector('#one input[value=christmas]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one input[value=halloween]').disabled",
        ),
        false,
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#one [data-active] button').length",
        ),
        3,
      );
      await evaluate(
        "document.querySelector('#one [data-remove][value=christmas]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2' && document.querySelectorAll('#one [data-active] button').length === 2",
      );
      await evaluate(
        "document.querySelector('#one input[value=christmas]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      await evaluate(
        "document.querySelector('#one input[value=celebrations]').click(); document.querySelector('#one input[value=decorations]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-results]').textContent.includes('Una decoración') && document.querySelector('#one details[data-filter-id=occasion]') === null && document.querySelector('#one input[value=decorations]').checked && document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      const switchedParams = nestedRequests.findLast((params) =>
        params.getAll("option.root").includes("decorations"),
      );
      assert.ok(switchedParams);
      assert.deepEqual(switchedParams.getAll("option.root"), ["decorations"]);
      assert.equal(switchedParams.has("option.occasion"), false);
      assert.equal(switchedParams.has("option.holiday"), false);
      await evaluate("document.querySelector('#one [data-clear]').click()");
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      if (process.env.NBF_SCREENSHOT_DIR) {
        mode = "preview";
        await evaluate(
          "document.querySelector('#two').hidden = true; document.querySelector('#one [data-retry]').click()",
        );
        await waitFor(
          "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3' && document.querySelectorAll('#one img').length === 0",
        );
        await call("Emulation.setDeviceMetricsOverride", {
          width: 1280,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await capture("storefront-desktop.png");
        await evaluate(
          "document.querySelector('#one input[value=celebrations]').click()",
        );
        await waitFor(
          "document.querySelector('#one input[value=festivities]') !== null",
        );
        await evaluate(
          "document.querySelector('#one input[value=festivities]').click()",
        );
        await waitFor(
          "document.querySelector('#one input[value=christmas]') !== null",
        );
        await evaluate(
          "document.querySelector('#one summary[data-filter-id=holiday]').click()",
        );
        await capture("storefront-nested-desktop.png");
        await call("Emulation.setDeviceMetricsOverride", {
          width: 375,
          height: 900,
          deviceScaleFactor: 1,
          mobile: true,
        });
        assert.equal(
          await evaluate("document.documentElement.scrollWidth <= 375"),
          true,
        );
        await capture("storefront-nested-mobile.png");
      }
      mode = "unconfigured";
      const before = requests;
      await evaluate(
        "{const element=document.querySelector('#one'); element.remove(); document.body.prepend(element);}",
      );
      await waitFor(
        "document.querySelector('#one [data-toolbar]').hidden && document.querySelector('#one [data-results]').textContent.includes('Artículo de Liquid')",
      );
      assert.equal(requests, before + 1);
    } finally {
      socket?.close();
      browser.kill();
      await delay(400);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (
        path.dirname(path.resolve(profile)) === path.resolve(tmpdir()) &&
        path.basename(profile).startsWith("nbf-browser-")
      ) {
        rmSync(profile, {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 200,
        });
      }
    }
  },
);
