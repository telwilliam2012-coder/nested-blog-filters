export function loader() {
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Technical documentation / Documentación técnica de Nested Blog Filters &amp; Search: data model, App Proxy and article tags.">
    <title>Documentation / Documentación | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 960px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h2, h3 { margin-top: 32px; font-size: 1.2rem; line-height: 1.4; }
      h1, .page-title { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      p { margin: 12px 0; }
      code { font-size: .95em; overflow-wrap: anywhere; }
      pre { padding: 16px; background: #f5f7f6; border-radius: 8px; overflow-x: auto; }
      pre code { white-space: pre-wrap; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; }
      caption { text-align: left; font-weight: 600; margin: 12px 0; }
      th, td { text-align: left; vertical-align: top; padding: 12px; border-bottom: 1px solid #dce5e0; }
      .brand { color: #65756f; font-size: .95rem; font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      nav { display: flex; flex-wrap: wrap; gap: 12px 24px; }
      .language-nav { margin-bottom: 24px; }
      article { scroll-margin-top: 24px; }
      #docs-es { margin-top: 48px; padding-top: 32px; border-top: 1px solid #dce5e0; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <nav class="language-nav" aria-label="Language / Idioma">
        <a href="#docs-en" lang="en">English</a>
        <a href="#docs-es" lang="es">Español</a>
      </nav>
      <article id="docs-en" lang="en" aria-labelledby="docs-title-en">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h1 id="docs-title-en">Technical Documentation</h1>
          <p>Data structures, nested selection rules, storefront requests, and article tagging.</p>
        </header>
        <section aria-labelledby="data-en">
          <h2 id="data-en">Data model</h2>
          <p>Prisma manages the application's relational model. Each filter set belongs to a Shopify store and blog; Shopify blog and article identifiers use full GIDs.</p>
          <div class="table-wrap">
            <table>
              <caption>Core models</caption>
              <thead><tr><th scope="col">Model</th><th scope="col">Purpose and relationships</th></tr></thead>
              <tbody>
                <tr><th scope="row"><code>FilterSet</code></th><td>Unique per <code>shop</code> and <code>blogId</code>. Contains the filters and indexed articles for that blog.</td></tr>
                <tr><th scope="row"><code>Filter</code></th><td>Stable <code>key</code>, display <code>label</code>, <code>position</code>, and <code>source</code> (<code>tag</code> or <code>metafield</code>). Optional <code>parentKey</code> and <code>parentValues</code> define its dependency.</td></tr>
                <tr><th scope="row"><code>FilterOption</code></th><td>Belongs to one filter; stores a stable <code>value</code>, a display label, and its order.</td></tr>
                <tr><th scope="row"><code>Article</code></th><td>Local index of a Shopify article: Shopify ID, title, handle, publication date, tags, and image.</td></tr>
                <tr><th scope="row"><code>ArticleOption</code></th><td>Links articles to multiple options. Shared <code>filterSetId</code> references keep assignments within the same store and blog configuration.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="hierarchy-en">
          <h2 id="hierarchy-en">Nested filters and matching rules</h2>
          <p><code>parentKey</code> refers to the key of an earlier filter. <code>parentValues</code> is a JSON list of that parent's option values, not option IDs. A child becomes visible when its parent is active and a selected parent option matches one of these values. Hidden selections are discarded.</p>
          <p>The engine applies <strong>AND between different filters</strong> and <strong>OR between options in the same filter</strong>. Option counts update with the selections. Only articles published by the time of the request are included; text search uses the article title and handle.</p>
        </section>
        <section aria-labelledby="proxy-en">
          <h2 id="proxy-en">App Proxy: <code>/proxy/nested-filters</code></h2>
          <p>The theme calls <code>/apps/nested-filters</code> on the store domain by default. Shopify forwards this request to the app's <code>/proxy/nested-filters</code> endpoint. If the store customizes its proxy prefix or subpath, update the block's proxy path accordingly.</p>
          <p>The backend authenticates Shopify's proxy signature with <code>authenticate.public.appProxy</code> and uses the authenticated session's store. The storefront does not receive Admin API credentials. This endpoint accepts <strong>GET only</strong>; other methods return <code>405</code>.</p>
          <div class="table-wrap">
            <table>
              <caption>Query parameters</caption>
              <thead><tr><th scope="col">Parameter</th><th scope="col">Value</th></tr></thead>
              <tbody>
                <tr><th scope="row"><code>blogId</code></th><td>Required Shopify Blog GID, such as <code>gid://shopify/Blog/123</code>.</td></tr>
                <tr><th scope="row"><code>page</code></th><td>Page number starting at 1; defaults to 1.</td></tr>
                <tr><th scope="row"><code>pageSize</code></th><td>Between 1 and 48 articles; defaults to 12.</td></tr>
                <tr><th scope="row"><code>q</code></th><td>Optional search text, up to 200 characters.</td></tr>
                <tr><th scope="row"><code>option.&lt;filterId&gt;</code></th><td>An option ID from the response. Repeat the parameter to select several options in the same filter. These are app IDs, not labels or Shopify GIDs.</td></tr>
              </tbody>
            </table>
          </div>
          <p>Example storefront request; replace the example Blog ID with your blog's ID:</p>
          <pre><code>GET /apps/nested-filters?blogId=gid%3A%2F%2Fshopify%2FBlog%2F123&amp;page=1&amp;pageSize=12</code></pre>
          <p>A configured blog returns <code>status: "ready"</code>, filters with availability and counts, articles, and pagination fields (<code>total</code>, <code>page</code>, <code>pageSize</code>, <code>totalPages</code>). A blog without a filter set returns <code>status: "unconfigured"</code>. Invalid input returns <code>400</code>; an invalid signature or missing session is rejected before store data is read.</p>
          <p>Opening the backend endpoint directly without a signed Shopify proxy request does not provide access. See the <a href="https://shopify.dev/docs/apps/build/online-store/app-proxies">Shopify App Proxy documentation</a>.</p>
        </section>
        <section aria-labelledby="tags-en">
          <h2 id="tags-en">Tags and article attributes</h2>
          <p>For a <code>tag</code> filter, configure option values and assign matching Shopify tags to the articles. Matching compares the complete value using Unicode NFKC normalization, trims surrounding whitespace, and ignores letter case. Accents remain significant. A tag such as <code>Category_Subcategory</code> is one complete value; define its nesting in the filter builder.</p>
          <p>For a <code>metafield</code> filter, saving the set creates the required article metafield definitions. Article assignments write lists of values to the app-owned <code>$app</code> namespace, using <code>nbf_&lt;filterKey&gt;</code> keys and type <code>list.single_line_text_field</code>. Synchronization reads those values and refreshes the local article index.</p>
          <p>Use the app's Articles screen to manage assignments individually or in bulk, and synchronize after external changes. Keep filter keys and option values stable; display labels can be renamed.</p>
        </section>
      </article>

      <article id="docs-es" lang="es" aria-labelledby="docs-title-es">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h2 id="docs-title-es" class="page-title">Documentación técnica</h2>
          <p>Estructura de datos, reglas de selección anidada, consultas desde la tienda y gestión de etiquetas.</p>
        </header>
        <section aria-labelledby="data-es">
          <h3 id="data-es">Modelo de datos</h3>
          <p>Prisma gestiona el modelo relacional de la aplicación. Cada conjunto pertenece a una tienda y un blog de Shopify; los identificadores de blogs y artículos utilizan GID completos.</p>
          <div class="table-wrap">
            <table>
              <caption>Modelos principales</caption>
              <thead><tr><th scope="col">Modelo</th><th scope="col">Propósito y relaciones</th></tr></thead>
              <tbody>
                <tr><th scope="row"><code>FilterSet</code></th><td>Único por <code>shop</code> y <code>blogId</code>. Contiene los filtros y artículos indexados de ese blog.</td></tr>
                <tr><th scope="row"><code>Filter</code></th><td><code>key</code> estable, <code>label</code> visible, <code>position</code> y <code>source</code> (<code>tag</code> o <code>metafield</code>). Los campos opcionales <code>parentKey</code> y <code>parentValues</code> definen su dependencia.</td></tr>
                <tr><th scope="row"><code>FilterOption</code></th><td>Pertenece a un filtro; guarda un <code>value</code> estable, una etiqueta visible y su orden.</td></tr>
                <tr><th scope="row"><code>Article</code></th><td>Índice local de un artículo de Shopify: ID de Shopify, título, handle, fecha de publicación, etiquetas e imagen.</td></tr>
                <tr><th scope="row"><code>ArticleOption</code></th><td>Relaciona artículos con múltiples opciones. Las referencias compartidas a <code>filterSetId</code> mantienen las asignaciones dentro de la misma configuración de tienda y blog.</td></tr>
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="hierarchy-es">
          <h3 id="hierarchy-es">Filtros anidados y reglas de coincidencia</h3>
          <p><code>parentKey</code> referencia la clave de un filtro anterior. <code>parentValues</code> es una lista JSON con valores de opciones del padre, no sus IDs. El hijo se muestra cuando el padre está activo y una opción seleccionada coincide con uno de esos valores. Las selecciones ocultas se descartan.</p>
          <p>El motor aplica <strong>AND entre filtros distintos</strong> y <strong>OR entre opciones de un mismo filtro</strong>. Los conteos de opciones se actualizan con las selecciones. Solo se incluyen artículos publicados hasta el momento de la consulta; la búsqueda de texto utiliza el título y el handle del artículo.</p>
        </section>
        <section aria-labelledby="proxy-es">
          <h3 id="proxy-es">App Proxy: <code>/proxy/nested-filters</code></h3>
          <p>Por defecto, el tema consulta <code>/apps/nested-filters</code> en el dominio de la tienda. Shopify reenvía la petición al endpoint <code>/proxy/nested-filters</code> de la app. Si la tienda personaliza el prefijo o subruta del proxy, actualiza también la ruta en el bloque.</p>
          <p>El backend autentica la firma del proxy de Shopify mediante <code>authenticate.public.appProxy</code> y utiliza la tienda de la sesión autenticada. El frontend no recibe credenciales de la Admin API. El endpoint acepta <strong>solo GET</strong>; los demás métodos devuelven <code>405</code>.</p>
          <div class="table-wrap">
            <table>
              <caption>Parámetros de consulta</caption>
              <thead><tr><th scope="col">Parámetro</th><th scope="col">Valor</th></tr></thead>
              <tbody>
                <tr><th scope="row"><code>blogId</code></th><td>GID de blog de Shopify obligatorio, como <code>gid://shopify/Blog/123</code>.</td></tr>
                <tr><th scope="row"><code>page</code></th><td>Número de página desde 1; por defecto 1.</td></tr>
                <tr><th scope="row"><code>pageSize</code></th><td>Entre 1 y 48 artículos; por defecto 12.</td></tr>
                <tr><th scope="row"><code>q</code></th><td>Texto de búsqueda opcional, con un máximo de 200 caracteres.</td></tr>
                <tr><th scope="row"><code>option.&lt;filterId&gt;</code></th><td>ID de opción obtenido de la respuesta. Repite el parámetro para seleccionar varias opciones de un filtro. Son IDs de la app, no etiquetas ni GID de Shopify.</td></tr>
              </tbody>
            </table>
          </div>
          <p>Ejemplo de consulta desde la tienda; sustituye el ID de ejemplo por el de tu blog:</p>
          <pre><code>GET /apps/nested-filters?blogId=gid%3A%2F%2Fshopify%2FBlog%2F123&amp;page=1&amp;pageSize=12</code></pre>
          <p>Un blog configurado devuelve <code>status: "ready"</code>, filtros con disponibilidad y conteos, artículos y los campos de paginación (<code>total</code>, <code>page</code>, <code>pageSize</code>, <code>totalPages</code>). Si no tiene conjunto, devuelve <code>status: "unconfigured"</code>. Los parámetros inválidos devuelven <code>400</code>; una firma inválida o sesión ausente se rechaza antes de leer los datos de la tienda.</p>
          <p>Visitar directamente el endpoint del backend sin una petición firmada del proxy de Shopify no da acceso a los datos. Consulta la <a href="https://shopify.dev/docs/apps/build/online-store/app-proxies">documentación de App Proxy de Shopify</a>.</p>
        </section>
        <section aria-labelledby="tags-es">
          <h3 id="tags-es">Etiquetas y atributos de artículos</h3>
          <p>En un filtro de origen <code>tag</code>, configura los valores de opciones y asigna etiquetas de Shopify coincidentes a los artículos. La comparación utiliza el valor completo, normalización Unicode NFKC, elimina espacios exteriores y no distingue mayúsculas. Los acentos sí son significativos. Una etiqueta como <code>Categoria_Subcategoria</code> es un único valor completo; define su anidamiento en el constructor de filtros.</p>
          <p>En un filtro de origen <code>metafield</code>, guardar el conjunto crea las definiciones necesarias para artículos. Las asignaciones escriben listas de valores en el namespace de la app <code>$app</code>, con claves <code>nbf_&lt;filterKey&gt;</code> y tipo <code>list.single_line_text_field</code>. La sincronización lee esos valores y actualiza el índice local de artículos.</p>
          <p>Utiliza la pantalla Artículos para gestionar asignaciones individuales o masivas y sincroniza después de cambios externos. Conserva las claves de filtros y los valores de opciones; las etiquetas visibles sí se pueden renombrar.</p>
        </section>
      </article>
      <footer>
        <nav aria-label="Related pages / Páginas relacionadas">
          <a href="/">Home / Inicio</a>
          <a href="/tutorial">Quick tutorial / Guía rápida</a>
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
