/* eslint-env node */
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { before, after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite, renderArticleManager, getPlanAccess;
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
  ({ renderArticleManager } = await vite.ssrLoadModule(
    "/tests/article-manager-render.tsx",
  ));
  ({ getPlanAccess } = await vite.ssrLoadModule("/app/billing-plans.ts"));
});
after(async () => {
  await vite?.close();
});

async function renderManager(sources, plan = "Premium", withArticles = false) {
  const filters = sources.map((source, index) => ({
    id: `filter-${index}`,
    source,
    label: ["Motivos", "Ocasión", "Festividades"][index],
    options: [{ id: `option-${index}`, value: "Navidad", label: "Navidad" }],
  }));
  const props = {
    sets: [{ id: "set", name: "Filtros del blog" }],
    loadError: null,
    planAccess: getPlanAccess(plan),
    management: {
      set: { id: "set", revision: 0, sync: null, filters },
      articles: withArticles
        ? [
            { id: "article-1", title: "Primera", attributes: {} },
            { id: "article-2", title: "Segunda", attributes: {} },
          ]
        : [],
      total: withArticles ? 2 : 0,
      page: 1,
      totalPages: 0,
    },
  };
  return renderArticleManager(props);
}

test("a tag-only set displays all three filters and selects the first one", async () => {
  const html = await renderManager(["tag", "tag", "tag"]);
  for (const [index, label] of ["Motivos", "Ocasión", "Festividades"].entries())
    assert.ok(
      html.includes(`<s-option value="filter-${index}">${label}</s-option>`),
    );
  assert.match(html, /label="Filtro que quieres editar" value="filter-0"/);
  assert.ok(html.includes("Guardar etiquetas en Shopify"));
  assert.ok(
    html.includes("Puedes añadirlas, quitarlas o reemplazarlas desde aquí"),
  );
});

test("Pro keeps individual editing and hides the bulk selection control", async () => {
  const html = await renderManager(["tag"], "Pro", true);
  assert.ok(html.includes("Edición individual incluida"));
  assert.ok(html.includes('href="/app/billing"'));
  assert.ok(!html.includes('label="Seleccionar los artículos de esta página"'));
  assert.ok(html.includes('label="Seleccionar Primera"'));
  assert.ok(html.includes('label="Seleccionar Segunda"'));
});

test("Premium retains bulk selection", async () => {
  const html = await renderManager(["tag"], "Premium", true);
  assert.ok(html.includes('label="Seleccionar los artículos de esta página"'));
  assert.ok(!html.includes("Edición individual incluida"));
});

test("mixed sets retain metadata filters and tag filters in the same selector", async () => {
  const html = await renderManager(["metafield", "tag"]);
  assert.ok(html.includes('<s-option value="filter-0">Motivos</s-option>'));
  assert.ok(html.includes('<s-option value="filter-1">Ocasión</s-option>'));
  assert.ok(html.includes("Guardar atributos en Shopify"));
});

test("a set without filters offers configuration instead of an empty editing selector", async () => {
  const html = await renderManager([]);
  assert.ok(html.includes("Configurar filtros"));
  assert.equal(html.includes('label="Filtro que quieres editar"'), false);
});
