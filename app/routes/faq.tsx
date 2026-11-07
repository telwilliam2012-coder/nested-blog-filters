export function loader() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Frequently asked questions / Preguntas frecuentes sobre Nested Blog Filters &amp; Search by Dreamers APP.">
    <title>FAQ / Preguntas frecuentes | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 820px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h2, h3 { margin-top: 32px; font-size: 1.2rem; line-height: 1.4; }
      h1, .page-title { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      p { margin: 12px 0; }
      .brand { color: #65756f; font-size: .95rem; font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      nav { display: flex; flex-wrap: wrap; gap: 12px 24px; }
      .language-nav { margin-bottom: 24px; }
      article { scroll-margin-top: 24px; }
      #faq-es { margin-top: 48px; padding-top: 32px; border-top: 1px solid #dce5e0; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <nav class="language-nav" aria-label="Language / Idioma">
        <a href="#faq-en" lang="en">English</a>
        <a href="#faq-es" lang="es">Español</a>
      </nav>
      <article id="faq-en" lang="en" aria-labelledby="faq-title-en">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h1 id="faq-title-en">Frequently Asked Questions</h1>
        </header>
        <section aria-labelledby="faq-install-en">
          <h2 id="faq-install-en">How do I install the filters in my store?</h2>
          <p>Add the Nested Blog Filters &amp; Search app block from the Shopify theme editor. The integrated App Proxy connects the filters to your blog data without requiring changes to your theme's code.</p>
        </section>
        <section aria-labelledby="faq-speed-en">
          <h2 id="faq-speed-en">Will it affect my blog's loading speed?</h2>
          <p>Data is retrieved using optimized queries to help keep your blog loading quickly.</p>
        </section>
        <section aria-labelledby="faq-structure-en">
          <h2 id="faq-structure-en">How do I create a nested filter structure?</h2>
          <p>From the app's dashboard in Shopify Admin, create a filter set for your blog, add its options, and configure the relationships between the levels of the filter tree.</p>
        </section>
      </article>

      <article id="faq-es" lang="es" aria-labelledby="faq-title-es">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h2 id="faq-title-es" class="page-title">Preguntas frecuentes</h2>
        </header>
        <section aria-labelledby="faq-install-es">
          <h3 id="faq-install-es">¿Cómo se instalan los filtros en mi tienda?</h3>
          <p>Añade el bloque de Nested Blog Filters &amp; Search desde el editor de temas de Shopify. El App Proxy integrado conecta los filtros con los datos del blog sin que tengas que modificar el código del tema.</p>
        </section>
        <section aria-labelledby="faq-speed-es">
          <h3 id="faq-speed-es">¿Afecta la velocidad de carga de mi blog?</h3>
          <p>Los datos se consultan de forma optimizada para ayudar a mantener una carga rápida del blog.</p>
        </section>
        <section aria-labelledby="faq-structure-es">
          <h3 id="faq-structure-es">¿Cómo creo una estructura de filtros anidados?</h3>
          <p>Desde el panel de control de la app en Shopify Admin, crea un conjunto de filtros para tu blog, añade sus opciones y configura las relaciones entre los niveles del árbol de filtros.</p>
        </section>
      </article>
      <footer>
        <nav aria-label="Related pages / Páginas relacionadas">
          <a href="/">Home / Inicio</a>
          <a href="/privacy">Privacy Policy / Privacidad</a>
          <a href="/changelog">Changelog / Historial de versiones</a>
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
