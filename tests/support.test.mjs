/* eslint-env node */
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { before, after, test } from "node:test";
import { createServer } from "vite";

let vite, contact, translateAdmin, renderSupport;
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
  contact = await vite.ssrLoadModule("/app/support/contact.ts");
  ({ translateAdmin } = await vite.ssrLoadModule("/app/i18n/messages.ts"));
  ({ renderSupport } = await vite.ssrLoadModule("/tests/support-render.tsx"));
});
after(async () => {
  await vite?.close();
});
const valid = {
  subject: "Ayuda & colores",
  message:
    "No aparecen mis filtros al abrir el blog.\nYa sincronicé los artículos.",
  replyEmail: "merchant+test@example.com",
};

test("support email drafts preserve Unicode, encode user content and omit query credentials", () => {
  const href = contact.supportMailto(
    valid,
    {
      shop: "one.myshopify.com",
      pathname: "/app/filters/example?id_token=secret#private",
      locale: "fr",
    },
    (source, values) => translateAdmin("fr", source, values),
  );
  const url = new URL(href);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "telwilliam2012@gmail.com");
  assert.deepEqual([...url.searchParams.keys()], ["subject", "body"]);
  assert.equal(
    url.searchParams.get("subject"),
    "[Nested Blog Filters] Ayuda & colores",
  );
  const body = url.searchParams.get("body");
  assert.ok(body.includes(valid.message));
  assert.ok(body.includes("Boutique: one.myshopify.com"));
  assert.ok(body.includes("Écran: /app/filters/example"));
  assert.ok(body.includes("Langue: fr"));
  assert.ok(body.includes(valid.replyEmail));
  assert.equal(body.includes("id_token"), false);
  assert.equal(body.includes("secret"), false);
  assert.equal(body.includes("#private"), false);
});

test("support validation rejects empty, oversized and header-injection inputs", () => {
  assert.deepEqual(contact.validateSupportDraft(valid), {
    subject: false,
    message: false,
    replyEmail: false,
  });
  assert.deepEqual(
    contact.validateSupportDraft({
      subject: "  ",
      message: "short",
      replyEmail: "not an email",
    }),
    { subject: true, message: true, replyEmail: true },
  );
  assert.deepEqual(contact.validateSupportDraft({ ...valid, replyEmail: "" }), {
    subject: false,
    message: false,
    replyEmail: false,
  });
  for (const subject of ["Hi\r\nBcc: victim@example.com", "x".repeat(121)]) {
    assert.equal(
      contact.validateSupportDraft({ ...valid, subject }).subject,
      true,
    );
    assert.throws(() =>
      contact.supportMailto(
        { ...valid, subject },
        { shop: "one.myshopify.com", pathname: "/app", locale: "es" },
        (value) => value,
      ),
    );
  }
  assert.equal(
    contact.validateSupportDraft({ ...valid, message: "x".repeat(1501) })
      .message,
    true,
  );
  const url = new URL(
    contact.supportMailto(
      { ...valid, subject: "Colores?cc=victim@example.com" },
      { shop: "one.myshopify.com", pathname: "/app", locale: "es" },
      (value) => value,
    ),
  );
  assert.equal(url.searchParams.has("cc"), false);
});

for (const locale of ["es", "en", "de", "it", "fr"])
  test(`help cards, six native FAQs and contact fields render in ${locale}`, () => {
    const html = renderSupport(locale);
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../app/locales/${locale}.json`, import.meta.url),
        "utf8",
      ),
    );
    const escaped = (value) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("'", "&#x27;")
        .replaceAll('"', "&quot;");
    for (const source of [
      "Cómo organizar las etiquetas",
      "Preguntas frecuentes",
      "¿Cómo cambio los colores desde el tema?",
      "Preparar correo",
      "No. Cada etiqueta se interpreta como un valor completo. Crea las relaciones entre filtros en el constructor y elige las opciones que activan cada nivel.",
    ])
      assert.ok(
        html.includes(escaped(catalog[source])),
        `${locale}: ${source}`,
      );
    assert.equal((html.match(/<details\b/g) ?? []).length, 6);
    assert.equal((html.match(/<summary\b/g) ?? []).length, 6);
    assert.ok(html.includes(`mailto:${contact.DREAMERS_SUPPORT_EMAIL}`));
    assert.ok(html.includes("Celebraciones → Festividades → Navidad"));
    assert.equal(html.includes("{{"), false);
  });
