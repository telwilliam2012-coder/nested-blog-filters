/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { before, after, test } from "node:test";
import { createServer } from "vite";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["es", "en", "de", "it", "fr"];
const json = (file) =>
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
const flatten = (object, prefix = "") =>
  Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) =>
      typeof value === "string"
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flatten(value, `${prefix}${key}.`)),
    ),
  );
const parameters = (text) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();
const escapeHtml = (text) =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
      })[character],
  );
let vite,
  localeHelpers,
  messages,
  renderAdminViews,
  renderAdminResponse,
  adminHeaders;
before(async () => {
  vite = await createServer({
    root,
    configFile: false,
    appType: "custom",
    server: {
      middlewareMode: true,
      watch: null,
      hmr: { server: createHttpServer() },
    },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  localeHelpers = await vite.ssrLoadModule("/app/i18n/locale.ts");
  messages = await vite.ssrLoadModule("/app/i18n/messages.ts");
  ({ renderAdminViews, renderAdminResponse, adminHeaders } =
    await vite.ssrLoadModule("/tests/i18n-render.tsx"));
});
after(async () => {
  await vite?.close();
});

test("all five storefront and theme editor catalogs preserve keys and interpolation parameters", () => {
  for (const suffix of [".json", ".schema.json"]) {
    const reference = flatten(
      json(`extensions/nested-blog-filters/locales/en.default${suffix}`),
    );
    for (const language of languages) {
      const name = language === "en" ? "en.default" : language;
      const catalog = flatten(
        json(`extensions/nested-blog-filters/locales/${name}${suffix}`),
      );
      assert.deepEqual(
        Object.keys(catalog).sort(),
        Object.keys(reference).sort(),
        `${language}${suffix}`,
      );
      for (const [key, value] of Object.entries(catalog)) {
        assert.ok(value.trim(), `${language}: ${key}`);
        assert.deepEqual(
          parameters(value),
          parameters(reference[key]),
          `${language}: ${key}`,
        );
      }
      if (suffix === ".schema.json")
        for (const key of [
          "badge_bg_color",
          "badge_text_color",
          "accent_color",
        ])
          assert.ok(catalog[`filters.${key}`]);
    }
  }
});

test("every literal UI message has translations in all five admin catalogs", () => {
  const reference = json("app/locales/es.json");
  for (const language of languages) {
    const catalog = json(`app/locales/${language}.json`);
    assert.deepEqual(
      Object.keys(catalog).sort(),
      Object.keys(reference).sort(),
    );
    for (const [key, value] of Object.entries(catalog)) {
      assert.ok(value.trim(), `${language}: ${key}`);
      assert.deepEqual(
        parameters(value),
        parameters(key),
        `${language}: ${key}`,
      );
    }
  }
  function scan(folder) {
    for (const entry of readdirSync(new URL(`../${folder}`, import.meta.url), {
      withFileTypes: true,
    })) {
      const file = `${folder}/${entry.name}`;
      if (entry.isDirectory()) scan(file);
      else if (/\.tsx?$/.test(file)) {
        const tree = ts.createSourceFile(
          file,
          readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX,
        );
        function visit(node) {
          if (
            ts.isCallExpression(node) &&
            node.expression.getText(tree) === "t" &&
            ts.isStringLiteralLike(node.arguments[0])
          )
            assert.ok(
              Object.hasOwn(reference, node.arguments[0].text),
              `${file}: ${node.arguments[0].text}`,
            );
          ts.forEachChild(node, visit);
        }
        visit(tree);
      }
    }
  }
  scan("app");
});

test("admin language negotiation respects Shopify locale, regional tags and accepted-language priorities", () => {
  const resolve = (query, accepted) =>
    localeHelpers.requestAdminLocale(
      new Request(`https://example.test/app${query}`, {
        headers: { "Accept-Language": accepted },
      }),
    );
  assert.equal(resolve("?locale=fr-CA", "de-DE"), "fr");
  assert.equal(resolve("?locale=ja", "en;q=0.5,de-CH;q=0.9,it;q=0"), "de");
  assert.equal(resolve("", "fr;q=0,en;q=0.4,it-IT;q=0.8"), "it");
  assert.equal(resolve("", "ja,fr;q=invalid"), "es");
  assert.equal(localeHelpers.normalizeAdminLocale("EN_us"), "en");
  for (const value of [null, undefined, {}, "xx", "<script>"])
    assert.equal(localeHelpers.normalizeAdminLocale(value), null);
  assert.notEqual(
    localeHelpers.adminLocaleStorageKey("one.myshopify.com"),
    localeHelpers.adminLocaleStorageKey("two.myshopify.com"),
  );
});

test("legacy server errors and success messages translate with their details and nested validation reasons", () => {
  const translate = messages.translateAdmin;
  assert.equal(
    translate("de", "Cambios guardados en 25 artículos."),
    "Änderungen in 25 Artikeln gespeichert.",
  );
  assert.equal(
    translate(
      "fr",
      "Identificador del filtro 2: introduce un texto de entre 1 y 40 caracteres.",
    ),
    "Identifiant du filtre 2 : saisissez entre 1 et 40 caractères.",
  );
  const reason =
    "Usa de 2 a 40 caracteres: letras sin acentos, números y guion bajo. Empieza con una letra; por ejemplo, ocasion o temporada.";
  const translated = translate("en", `Filtro 2: ${reason}`);
  assert.ok(translated.startsWith("Filter 2: Use 2–40 characters:"));
  assert.ok(!translated.includes("Usa de"));
  assert.equal(
    translate("it", "Mi contenido personalizado"),
    "Mi contenido personalizado",
  );
  assert.equal(translate("en", "__proto__"), "__proto__");
});

test("translated error pages preserve Shopify App Bridge control responses", async () => {
  const html = await renderAdminResponse(
    "fr",
    404,
    "El blog ya no está disponible.",
  );
  assert.ok(
    html.includes(
      escapeHtml(json("app/locales/fr.json")["El blog ya no está disponible."]),
    ),
  );
  const bridgeMarkup =
    "<script data-auth-control>window.__bridge = true;</script>";
  const bridge = await renderAdminResponse("fr", 200, bridgeMarkup);
  assert.ok(bridge.includes(bridgeMarkup));
  assert.equal(bridge.includes("Impossible de terminer"), false);
});

test("translated route boundaries retain Shopify reauthorization headers and inherited document headers", () => {
  const reauthorization = new Headers({
    "X-Shopify-API-Request-Failure-Reauthorize-Url":
      "https://example.test/auth",
  });
  const result = adminHeaders({ errorHeaders: reauthorization });
  assert.equal(
    result.get("X-Shopify-API-Request-Failure-Reauthorize-Url"),
    "https://example.test/auth",
  );
  const ordinary = adminHeaders({
    parentHeaders: new Headers({
      "Content-Security-Policy": "frame-ancestors https://admin.shopify.com",
    }),
    loaderHeaders: new Headers({ "Cache-Control": "private" }),
  });
  assert.equal(
    ordinary.get("Content-Security-Policy"),
    "frame-ancestors https://admin.shopify.com",
  );
  assert.equal(ordinary.get("Cache-Control"), "private");
});

for (const language of languages)
  test(`home, filter builder and article manager render in ${language} without changing merchant values`, async () => {
    const html = await renderAdminViews(language);
    const catalog = json(`app/locales/${language}.json`);
    assert.ok(html.includes(`lang="${language}"`));
    for (const source of [
      "Filtros de tus blogs",
      "Guardar conjunto",
      "Atributos de artículos",
      "Guardar etiquetas en Shopify",
    ])
      assert.ok(
        html.includes(escapeHtml(catalog[source])),
        `${language}: ${source}`,
      );
    assert.ok(html.includes('id="nbf-admin-language"'));
    assert.ok(html.includes('value="motivo"'));
    assert.ok(html.includes('value="Navidad"'));
    assert.ok(html.includes("Mi categoría"));
    assert.ok(html.includes(new Intl.NumberFormat(language).format(10000)));
    assert.equal(/\{\{\w+\}\}/.test(html), false);
  });
