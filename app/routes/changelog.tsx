export function loader() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Changelog / Historial de versiones de Nested Blog Filters &amp; Search by Dreamers APP.">
    <title>Changelog / Historial de versiones | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 820px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h2, h3 { margin-top: 32px; font-size: 1.2rem; line-height: 1.4; }
      h1, .page-title { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      p { margin: 12px 0; }
      li { margin: 8px 0; }
      .brand { color: #65756f; font-size: .95rem; font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      nav { display: flex; flex-wrap: wrap; gap: 12px 24px; }
      .language-nav { margin-bottom: 24px; }
      article { scroll-margin-top: 24px; }
      #changelog-es { margin-top: 48px; padding-top: 32px; border-top: 1px solid #dce5e0; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <nav class="language-nav" aria-label="Language / Idioma">
        <a href="#changelog-en" lang="en">English</a>
        <a href="#changelog-es" lang="es">Español</a>
      </nav>
      <article id="changelog-en" lang="en" aria-labelledby="changelog-title-en">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h1 id="changelog-title-en">Changelog</h1>
        </header>
        <section aria-labelledby="release-1-0-0-en">
          <h2 id="release-1-0-0-en">v1.0.0 — Initial release</h2>
          <ul>
            <li>Nested filters for Shopify blogs.</li>
            <li>Advanced article search.</li>
            <li>App Proxy support.</li>
          </ul>
        </section>
      </article>

      <article id="changelog-es" lang="es" aria-labelledby="changelog-title-es">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h2 id="changelog-title-es" class="page-title">Historial de versiones</h2>
        </header>
        <section aria-labelledby="release-1-0-0-es">
          <h3 id="release-1-0-0-es">v1.0.0 — Lanzamiento inicial</h3>
          <ul>
            <li>Sistema de filtros anidados para blogs de Shopify.</li>
            <li>Búsqueda avanzada de artículos.</li>
            <li>Soporte para App Proxy.</li>
          </ul>
        </section>
      </article>
      <footer>
        <nav aria-label="Related pages / Páginas relacionadas">
          <a href="/">Home / Inicio</a>
          <a href="/privacy">Privacy Policy / Privacidad</a>
          <a href="/faq">FAQ / Preguntas frecuentes</a>
        </nav>
      </footer>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
