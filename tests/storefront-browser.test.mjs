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

function matchesQuery(article, params) {
  const query = (params.get("q") ?? "").trim().toLocaleLowerCase("es");
  return [article.title, article.handle].some((value) =>
    value.toLocaleLowerCase("es").includes(query),
  );
}

function payload(params) {
  const selected = Object.fromEntries(
    ["motive", "occasion"].map((id) => [id, params.getAll(`option.${id}`)]),
  );
  const matches = (article, except) =>
    matchesQuery(article, params) &&
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
    matchesQuery(article, params) &&
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
    <h2 class="nbf__sr-only">Ideas para celebrar</h2>
    <div class="nbf__search-bar"><form class="nbf__search" action="/search" method="get" role="search" data-search-form><svg class="nbf__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><input type="hidden" name="type" value="article"><label class="nbf__sr-only" for="search-${id}">Buscar artículos del blog</label><input id="search-${id}" type="search" name="q" maxlength="200" placeholder="Buscar artículos…" data-search-input><button class="nbf__search-submit" type="submit">Buscar</button></form></div>
    <section class="nbf__toolbar" data-toolbar hidden><div class="nbf__filter-row"><div class="nbf__filters" data-filters></div><button class="nbf__clear" data-clear>Limpiar filtros</button></div><div class="nbf__active" data-active hidden></div></section>
    <p class="nbf__status" data-status role="status" aria-live="polite"></p><button data-retry hidden>Reintentar</button>
    <div data-results-container><ul class="nbf__articles" data-results><li>Artículo de Liquid</li></ul></div>
    <nav class="nbf__pagination" data-pagination hidden><button class="nbf__button" data-previous>Anterior</button><span data-page></span><button class="nbf__button" data-next>Siguiente</button></nav>
    <p data-blog-link><a href="/blogs/historias">Ver el blog</a></p>
  </nested-blog-filters>`;
}

test(
  "storefront works in Chromium: single selection, races, safe text, recovery, lifecycle and mobile layout",
  {
    skip:
      !chrome &&
      "Set NBF_TEST_BROWSER to a Chromium executable to run browser checks",
    timeout: 60000,
  },
  async () => {
    let mode = "ready";
    let requests = 0;
    let race = false;
    const selectionRequests = [];
    const nestedRequests = [];
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/apps/nested-filters") {
        requests++;
        selectionRequests.push(url.searchParams);
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
      let port;
      for (let attempt = 0; !port && attempt < 100; attempt++) {
        try {
          const candidate = readFileSync(portFile, "utf8")
            .split("\n")[0]
            .trim();
          if (/^\d+$/.test(candidate)) port = candidate;
        } catch (error) {
          if (!["ENOENT", "EBUSY", "EPERM"].includes(error.code)) throw error;
        }
        if (!port) await delay(50);
      }
      assert.ok(port, "Chromium did not open its local debugging port");
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
        await delay(360);
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
        await evaluate(
          "document.querySelectorAll('#one input[type=radio]').length",
        ),
        4,
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('input[type=checkbox]').length",
        ),
        0,
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
      assert.equal(
        await evaluate(
          "document.querySelector('#one summary').getBoundingClientRect().height >= 44 && getComputedStyle(document.querySelector('#one summary')).borderRadius === '12px'",
        ),
        true,
      );
      assert.equal(
        await evaluate("document.querySelector('#one .nbf__header') === null"),
        true,
      );
      assert.deepEqual(
        await evaluate(`(() => {
          const details = document.querySelector('#one .nbf__filter');
          details.querySelector('summary').click();
          details.animation.pause();
          details.animation.currentTime = 0;
          const style = getComputedStyle(details.querySelector('.nbf__menu'));
          const start = [style.transform, style.opacity];
          details.animation.cancel();
          details.open = false;
          return start;
        })()`),
        ["matrix(1, 0, 0, 1, 0, -4)", "0"],
      );
      await evaluate(
        "document.querySelector('#one [data-search-input]').value='historia'; document.querySelector('#one [data-search-form]').requestSubmit()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3' && document.querySelector('#one').query === 'historia' && document.querySelector('#one [data-results-container]').getAttribute('aria-busy') === 'false'",
      );
      await evaluate("document.querySelector('#one [data-next]').click()");
      await waitFor(
        "document.querySelector('#one [data-page]').textContent === 'Página 2 de 2'",
      );
      await evaluate(
        "document.querySelector('#one [data-search-input]').value='floral'; document.querySelector('#one [data-search-form]').requestSubmit()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2' && document.querySelector('#one').page === 1",
      );
      await evaluate(
        "document.querySelector('#one [data-search-input]').value=''; document.querySelector('#one [data-search-input]').dispatchEvent(new Event('search'))",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      await evaluate(
        "document.querySelector('#one input[value=abstract]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      const beforeColorChange = requests;
      await evaluate(`{
        const style = document.createElement('style');
        style.id = 'branding-preview';
        style.textContent = '#one { --nbf-badge-bg: #7c3aed; --nbf-badge-text: #fff8e1; --nbf-accent: #b91c1c; }';
        document.head.prepend(style);
      }`);
      await waitFor(
        "getComputedStyle(document.querySelector('#one .nbf__filter--selected .nbf__step')).backgroundColor === 'rgb(124, 58, 237)'",
      );
      assert.deepEqual(
        await evaluate(`[
          getComputedStyle(document.querySelector('#one .nbf__filter--selected .nbf__step')).color,
          getComputedStyle(document.querySelector('#one .nbf__selection-count')).backgroundColor,
          getComputedStyle(document.querySelector('#one .nbf__selection-count')).color,
          getComputedStyle(document.querySelector('#one input:checked + .nbf__choice'), '::before').borderTopColor,
          getComputedStyle(document.querySelector('#one .nbf__search-submit')).backgroundColor,
          getComputedStyle(document.querySelector('#two .nbf__search-submit')).backgroundColor,
          getComputedStyle(document.querySelector('#one .nbf__trigger')).borderRadius,
          getComputedStyle(document.querySelector('#one .nbf__menu')).borderRadius
        ]`),
        [
          "rgb(255, 248, 225)",
          "rgb(124, 58, 237)",
          "rgb(255, 248, 225)",
          "rgb(185, 28, 28)",
          "rgb(185, 28, 28)",
          "rgb(36, 92, 76)",
          "12px",
          "12px",
        ],
      );
      await capture("storefront-custom-colors.png");
      await evaluate(
        "document.querySelector('#branding-preview').textContent = '#one { --nbf-badge-bg: #9a3412; --nbf-badge-text: #ffffff; --nbf-accent: #1d4ed8; }'",
      );
      await waitFor(
        "getComputedStyle(document.querySelector('#one .nbf__filter--selected .nbf__step')).backgroundColor === 'rgb(154, 52, 18)' && getComputedStyle(document.querySelector('#one .nbf__search-submit')).backgroundColor === 'rgb(29, 78, 216)'",
      );
      assert.equal(requests, beforeColorChange);
      await evaluate("document.querySelector('#branding-preview').remove()");
      await waitFor(
        "getComputedStyle(document.querySelector('#one .nbf__filter--selected .nbf__step')).backgroundColor === 'rgb(14, 90, 68)' && getComputedStyle(document.querySelector('#one .nbf__filter--selected .nbf__step')).color === 'rgb(255, 255, 255)'",
      );
      await evaluate(
        "document.querySelector('#one [data-search-input]').value='floral'; document.querySelector('#one [data-search-form]').requestSubmit()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 0'",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one input[value=abstract]').checked",
        ),
        true,
      );
      await evaluate("document.querySelector('#one [data-clear]').click()");
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one [data-search-input]').value",
        ),
        "",
      );
      await evaluate(
        "document.querySelector('#one [data-search-input]').value='floral'; document.querySelector('#one [data-search-form]').requestSubmit()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2'",
      );
      await evaluate(
        "const input=document.querySelector('#one [data-search-input]'); input.value=''; input.dispatchEvent(new Event('search'))",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 3'",
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
          "getComputedStyle(document.querySelector('#one')).isolation === 'isolate' && getComputedStyle(document.querySelector('#one .nbf__menu')).borderRadius === '12px' && getComputedStyle(document.querySelector('#one .nbf__menu')).boxShadow !== 'none' && getComputedStyle(document.querySelector('#one .nbf__input')).opacity === '0'",
        ),
        true,
      );
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "ArrowDown",
        code: "ArrowDown",
        windowsVirtualKeyCode: 40,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "ArrowDown",
        code: "ArrowDown",
        windowsVirtualKeyCode: 40,
      });
      await waitFor(
        "document.querySelector('#one input[value=abstract]').checked && document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      await call("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "ArrowUp",
        code: "ArrowUp",
        windowsVirtualKeyCode: 38,
      });
      await call("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "ArrowUp",
        code: "ArrowUp",
        windowsVirtualKeyCode: 38,
      });
      await waitFor(
        "document.querySelector('#one input[value=floral]').checked && document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2'",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#two [data-status]').textContent",
        ),
        "Artículos encontrados: 3",
      );
      await evaluate(
        "document.querySelector('#two input[value=floral]').click()",
      );
      await waitFor(
        "document.querySelector('#two [data-status]').textContent === 'Artículos encontrados: 2'",
      );
      await evaluate(
        "document.querySelector('#two input[value=abstract]').click()",
      );
      await waitFor(
        "document.querySelector('#two [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one input[value=floral]').checked && document.querySelector('#two input[value=abstract]').checked && !document.querySelector('#two input[value=floral]').checked",
        ),
        true,
      );
      await evaluate("document.querySelector('#two [data-clear]').click()");
      await waitFor(
        "document.querySelector('#two [data-status]').textContent === 'Artículos encontrados: 3'",
      );
      await evaluate(
        "document.querySelector('#one input[value=abstract]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 1'",
      );
      assert.equal(
        await evaluate(
          "document.querySelectorAll('#one input:checked').length",
        ),
        1,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one input[value=floral]').checked",
        ),
        false,
      );
      assert.deepEqual(selectionRequests.at(-1).getAll("option.motive"), [
        "abstract",
      ]);
      await waitFor(
        "document.querySelectorAll('#one [data-active] button').length === 1 && document.querySelector('#one [data-remove][value=floral]') === null",
      );
      const beforeReselect = requests;
      await evaluate(
        "document.querySelector('#one input[value=abstract]').click()",
      );
      assert.equal(requests, beforeReselect);
      race = true;
      await evaluate(
        "document.querySelector('#one input[value=floral]').click(); document.querySelector('#one input[value=abstract]').click(); document.querySelector('#one input[value=floral]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-status]').textContent === 'Artículos encontrados: 2' && document.querySelector('#one input[value=floral]').checked && document.querySelectorAll('#one input:checked').length === 1",
      );
      assert.deepEqual(selectionRequests.at(-1).getAll("option.motive"), [
        "floral",
      ]);
      race = false;
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
          "document.querySelector('#one summary[data-filter-id=root]').getAttribute('aria-label').includes('Celebraciones')",
        ),
        true,
      );
      assert.equal(
        await evaluate(
          "document.querySelector('#one summary[data-filter-id=holiday] .nbf__filter-label').textContent === 'Festividades' && document.querySelector('#one details[data-filter-id=holiday]').dataset.depth === '2'",
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
      await waitFor(
        "document.querySelectorAll('#one details[open]').length === 0",
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
      await waitFor(
        "document.querySelectorAll('#one details[open]').length === 0",
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
        "document.querySelector('#one input[value=halloween]').click()",
      );
      await waitFor(
        "document.querySelector('#one [data-results]').textContent.includes('Fiesta de Halloween') && document.querySelector('#one input[value=halloween]').checked && document.querySelector('#one [data-results-container]').getAttribute('aria-busy') === 'false'",
      );
      assert.deepEqual(nestedRequests.at(-1).getAll("option.holiday"), [
        "halloween",
      ]);
      await waitFor(
        "!document.querySelector('#one input[value=christmas]').checked && document.querySelectorAll('#one [data-active] button').length === 3",
      );
      await evaluate(
        "document.querySelector('#one input[value=christmas]').click()",
      );
      await waitFor(
        "document.querySelector('#one input[value=christmas]').checked && document.querySelector('#one [data-results]').textContent.includes('Fiesta de Navidad') && document.querySelector('#one [data-results-container]').getAttribute('aria-busy') === 'false'",
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
        "document.querySelector('#one input[value=decorations]').click()",
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
      await call("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      await evaluate(`{
        const style = document.createElement('style');
        style.id = 'theme-collision';
        style.textContent = 'button,summary,input,fieldset,label{padding:70px;border:9px solid red;background:red;letter-spacing:6px;text-transform:uppercase}summary::after{content:"THEME"}';
        document.head.append(style);
        const probe = document.createElement('button');
        probe.id = 'theme-probe';
        probe.textContent = 'Theme';
        document.body.append(probe);
      }`);
      assert.equal(
        await evaluate(`
        getComputedStyle(document.querySelector('#theme-probe')).paddingTop === '70px' &&
        getComputedStyle(document.querySelector('#one .nbf__trigger')).paddingTop === '10px' &&
        getComputedStyle(document.querySelector('#one .nbf__trigger')).textTransform === 'none' &&
        getComputedStyle(document.querySelector('#one .nbf__trigger'), '::after').content === 'none' &&
        getComputedStyle(document.querySelector('#one .nbf__menu')).paddingTop === '8px' &&
        getComputedStyle(document.querySelector('#one .nbf__trigger')).fontFamily === getComputedStyle(document.querySelector('#one')).fontFamily
      `),
        true,
      );
      await call("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 850,
        deviceScaleFactor: 1,
        mobile: true,
      });
      await evaluate(`{
        document.querySelector('#one').dir = 'rtl';
        document.querySelector('#one .nbf__filter-value').textContent = 'Una selección con un nombre muy largo '.repeat(8);
        document.querySelector('#one summary').click();
      }`);
      await waitFor(
        "document.querySelector('#one details').open && document.querySelector('#one details .nbf__menu').inert === false",
      );
      assert.equal(
        await evaluate(`
        document.documentElement.scrollWidth <= 320 &&
        document.querySelector('#one .nbf__menu').getBoundingClientRect().left >= 0 &&
        document.querySelector('#one .nbf__menu').getBoundingClientRect().right <= 320 &&
        getComputedStyle(document.querySelector('#one .nbf__trigger')).transitionDuration === '0s'
      `),
        true,
      );
      await evaluate(
        "document.querySelector('#theme-probe').remove(); document.querySelector('#theme-collision').remove()",
      );
      mode = "unconfigured";
      const before = requests;
      await evaluate(
        "{const element=document.querySelector('#one'); element.remove(); document.body.prepend(element);}",
      );
      await waitFor(
        "document.querySelector('#one [data-toolbar]').hidden && document.querySelector('#one [data-results]').textContent.includes('Artículo de Liquid')",
      );
      assert.equal(requests, before + 1);
      for (const params of selectionRequests) {
        for (const key of new Set(params.keys())) {
          if (key.startsWith("option."))
            assert.equal(params.getAll(key).length, 1);
        }
      }
    } finally {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ id: 1_000_000, method: "Browser.close" }));
        await Promise.race([
          new Promise((resolve) => browser.once("exit", resolve)),
          delay(1500),
        ]);
      }
      socket?.close();
      if (browser.exitCode === null) browser.kill();
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
          maxRetries: 10,
          retryDelay: 200,
        });
      }
    }
  },
);
