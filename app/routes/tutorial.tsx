export function loader() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Quick setup tutorial / Guía rápida de configuración de Nested Blog Filters &amp; Search by Dreamers APP.">
    <title>Tutorial / Guía rápida | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 820px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h2, h3 { margin-top: 24px; font-size: 1.2rem; line-height: 1.4; }
      h1, .page-title { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      p { margin: 12px 0; }
      ol { padding-left: 24px; }
      li { padding-left: 8px; }
      code { font-size: .95em; overflow-wrap: anywhere; }
      .brand { color: #65756f; font-size: .95rem; font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      nav { display: flex; flex-wrap: wrap; gap: 12px 24px; }
      .language-nav { margin-bottom: 24px; }
      article { scroll-margin-top: 24px; }
      #tutorial-es { margin-top: 48px; padding-top: 32px; border-top: 1px solid #dce5e0; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <nav class="language-nav" aria-label="Language / Idioma">
        <a href="#tutorial-en" lang="en">English</a>
        <a href="#tutorial-es" lang="es">Español</a>
      </nav>
      <article id="tutorial-en" lang="en" aria-labelledby="tutorial-title-en">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h1 id="tutorial-title-en">Quick Setup Tutorial</h1>
          <p>Configure your categories in the app, then add the filters to a blog template in your theme.</p>
        </header>
        <ol>
          <li>
            <h2>Create a filter set for your blog</h2>
            <p>Open the app in Shopify Admin. Go to <strong>Filters → Create set</strong>, choose your blog, and name the set. Each blog has its own configuration.</p>
          </li>
          <li>
            <h2>Define categories and their relationships</h2>
            <p>Add a filter with a label such as “Category” and a stable key such as <code>category</code>. Add its options. For a nested filter, choose a previous filter as its parent and select the parent options that should reveal it. Save the set.</p>
          </li>
          <li>
            <h2>Import articles and assign options</h2>
            <p>In <strong>Articles</strong>, choose the filter set for your blog and click <strong>Sync from Shopify</strong>. Once the articles are imported, assign options individually or in bulk and save your changes to Shopify. Use article attributes for metafield filters, or matching Shopify article tags for tag filters. Only published articles appear in the blog results; synchronize again after changes made outside the app.</p>
          </li>
          <li>
            <h2>Add the app block in the theme editor</h2>
            <p>Open your theme editor, select the blog template used by your blog, and add the Nested Blog Filters app block from <strong>Apps</strong> in a section that supports app blocks. The block is intended for blog pages.</p>
            <p>See Shopify's <a href="https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration">app block documentation</a> for compatible theme sections.</p>
          </li>
          <li>
            <h2>Connect the proxy and customize the block</h2>
            <p>Keep the block's proxy path at <code>/apps/nested-filters</code>, unless your store uses a customized proxy path. This storefront path must forward to the app endpoint <code>/proxy/nested-filters</code>. Choose the articles per page, badge colors, and accent color in the block settings. You do not need to edit theme code.</p>
          </li>
          <li>
            <h2>Save and test your blog</h2>
            <p>Save the theme, open the blog, and select a category. Check that the relevant nested filters appear, test search, and clear the selections. If results are missing, check the blog's filter set, published articles, assignments, synchronization, and proxy path.</p>
          </li>
        </ol>
      </article>

      <article id="tutorial-es" lang="es" aria-labelledby="tutorial-title-es">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h2 id="tutorial-title-es" class="page-title">Guía rápida de configuración</h2>
          <p>Configura las categorías en la app y después añade los filtros a una plantilla de blog en tu tema.</p>
        </header>
        <ol>
          <li>
            <h3>Crea un conjunto de filtros para tu blog</h3>
            <p>Abre la app en Shopify Admin. Ve a <strong>Filtros → Crear conjunto</strong>, elige tu blog y asigna un nombre al conjunto. Cada blog tiene su propia configuración.</p>
          </li>
          <li>
            <h3>Define las categorías y sus relaciones</h3>
            <p>Añade un filtro con una etiqueta como “Categoría” y una clave estable como <code>categoria</code>. Añade sus opciones. Para anidar otro filtro, selecciona un filtro anterior como padre y las opciones del padre que deben mostrarlo. Guarda el conjunto.</p>
          </li>
          <li>
            <h3>Importa los artículos y asigna opciones</h3>
            <p>En <strong>Artículos</strong>, elige el conjunto de tu blog y pulsa <strong>Sincronizar desde Shopify</strong>. Una vez importados los artículos, asigna opciones de forma individual o masiva y guarda los cambios en Shopify. Utiliza atributos de artículo para filtros de metacampos o etiquetas de Shopify coincidentes para filtros de etiquetas. Solo los artículos publicados aparecen en los resultados del blog; vuelve a sincronizar después de cambios realizados fuera de la app.</p>
          </li>
          <li>
            <h3>Añade el bloque de la app en el editor de temas</h3>
            <p>Abre el editor de tu tema, selecciona la plantilla de blog que utiliza tu blog y añade el bloque de Nested Blog Filters desde <strong>Aplicaciones</strong> en una sección compatible con bloques de apps. El bloque está diseñado para páginas de blog.</p>
            <p>Consulta la <a href="https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration">documentación de bloques de Shopify</a> para conocer las secciones compatibles.</p>
          </li>
          <li>
            <h3>Conecta el proxy y personaliza el bloque</h3>
            <p>Mantén la ruta del proxy del bloque en <code>/apps/nested-filters</code>, salvo que tu tienda utilice una ruta personalizada. Esta ruta de la tienda debe apuntar al endpoint de la app <code>/proxy/nested-filters</code>. Elige los artículos por página, los colores de los badges y el color de acento en los ajustes del bloque. No necesitas editar el código del tema.</p>
          </li>
          <li>
            <h3>Guarda y prueba tu blog</h3>
            <p>Guarda el tema, abre el blog y selecciona una categoría. Comprueba que aparezcan los filtros anidados correspondientes, prueba la búsqueda y limpia las selecciones. Si faltan resultados, revisa el conjunto del blog, los artículos publicados, las asignaciones, la sincronización y la ruta del proxy.</p>
          </li>
        </ol>
      </article>
      <footer>
        <nav aria-label="Related pages / Páginas relacionadas">
          <a href="/">Home / Inicio</a>
          <a href="/docs">Technical documentation / Documentación técnica</a>
          <a href="/faq">FAQ / Preguntas frecuentes</a>
          <a href="/privacy">Privacy / Privacidad</a>
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
