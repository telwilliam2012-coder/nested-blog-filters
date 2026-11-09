import { DREAMERS_SUPPORT_EMAIL } from "../support/contact";

export function loader() {
  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Política de privacidad / Privacy Policy for Nested Blog Filters &amp; Search, a Shopify application by Dreamers APP.">
    <title>Política de privacidad / Privacy Policy | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 820px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h2, h3 { margin-top: 32px; font-size: 1.2rem; line-height: 1.4; }
      h1, .policy-title { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      p { margin: 12px 0; }
      .brand, .updated { color: #65756f; font-size: .95rem; }
      .brand { font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      .language-nav { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-bottom: 24px; }
      article { scroll-margin-top: 24px; }
      #privacy-en { margin-top: 48px; padding-top: 32px; border-top: 1px solid #dce5e0; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <nav class="language-nav" aria-label="Idioma / Language">
        <a href="#privacy-es" lang="es">Español</a>
        <a href="#privacy-en" lang="en">English</a>
      </nav>
      <article id="privacy-es" lang="es" aria-labelledby="privacy-title-es">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h1 id="privacy-title-es">Política de privacidad</h1>
          <p class="updated">Última actualización: <time datetime="2026-11-08">8 de noviembre de 2026</time></p>
          <p>Esta política explica cómo Dreamers APP trata la información necesaria para ofrecer Nested Blog Filters &amp; Search, una aplicación para organizar, filtrar y buscar artículos de blogs de Shopify.</p>
        </header>

        <section aria-labelledby="datos-shopify">
          <h2 id="datos-shopify">1. Datos de Shopify y finalidad</h2>
          <p>Al conectar una tienda, tratamos su identificador y dominio, datos de sesión y autorización, y el contenido necesario de blogs y artículos, como títulos, etiquetas, metacampos e información de filtros. Shopify también puede facilitar datos de los usuarios autorizados, como nombre y correo electrónico.</p>
          <p>Utilizamos esta información para autenticar la conexión, sincronizar el contenido, guardar las configuraciones de búsqueda y filtros, y prestar soporte técnico. Si nos contactas, utilizamos los datos que compartas para atender tu consulta.</p>
        </section>

        <section aria-labelledby="almacenamiento">
          <h2 id="almacenamiento">2. Almacenamiento en PostgreSQL y seguridad</h2>
          <p>En producción, la información necesaria para operar la aplicación se almacena en una base de datos PostgreSQL. Restringimos el acceso a los sistemas y personas autorizados para operar y mantener el servicio.</p>
          <p>Aplicamos controles de acceso y autenticación para proteger los datos. La conexión pública a la aplicación utiliza HTTPS, y las credenciales de Shopify se utilizan para las operaciones autorizadas de la aplicación.</p>
        </section>

        <section aria-labelledby="terceros">
          <h2 id="terceros">3. No venta de datos a terceros</h2>
          <p>No vendemos, alquilamos ni comercializamos los datos de las tiendas ni de sus usuarios. Podemos utilizar proveedores de alojamiento, base de datos y soporte para operar el servicio, compartiendo únicamente la información necesaria para esas funciones o para atender obligaciones legales aplicables.</p>
        </section>

        <section aria-labelledby="conservacion">
          <h2 id="conservacion">4. Conservación y solicitudes sobre tus datos</h2>
          <p>Conservamos la información durante el tiempo necesario para prestar el servicio y atender las obligaciones aplicables. Procesamos los avisos de privacidad y desinstalación enviados por Shopify para gestionar los datos de la tienda.</p>
          <p>Puedes solicitar información, corrección o eliminación de tus datos a través del correo de soporte. Para proteger la información, podemos necesitar verificar que estás autorizado para actuar en nombre de la tienda.</p>
        </section>

        <section aria-labelledby="analitica">
          <h2 id="analitica">5. Estadísticas de uso con consentimiento</h2>
          <p>Si la tienda utiliza Premium y el visitante permite el análisis mediante la API de privacidad de Shopify, contamos vistas de páginas del blog que contienen el bloque de filtros, interacciones con filtros y búsquedas enviadas. Son contadores de actividad; no identifican visitantes únicos.</p>
          <p>No guardamos en estas métricas direcciones IP, cookies, nombres, correos electrónicos, URL completas ni el texto de las búsquedas. Los eventos de filtro pueden incluir el identificador interno del filtro para contar su uso. Utilizamos tokens aleatorios limitados a cada documento y hashes técnicos temporales para evitar duplicados.</p>
          <p>Los informes cubren una ventana de hasta 90 días UTC. Al recibir eventos o generar informes, eliminamos las agrupaciones anteriores a esa ventana y los recibos de deduplicación de más de dos días. La vista previa del editor de temas no genera estadísticas.</p>
        </section>

        <section aria-labelledby="contacto">
          <h2 id="contacto">6. Contacto de soporte</h2>
          <p>Para preguntas sobre esta política o el tratamiento de tus datos, contacta con Dreamers APP en <a href="mailto:${DREAMERS_SUPPORT_EMAIL}">${DREAMERS_SUPPORT_EMAIL}</a>.</p>
        </section>
      </article>

      <article id="privacy-en" lang="en" aria-labelledby="privacy-title-en">
        <header>
          <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
          <h2 id="privacy-title-en" class="policy-title">Privacy Policy</h2>
          <p class="updated">Last updated: <time datetime="2026-11-08">November 8, 2026</time></p>
          <p>This policy explains how Dreamers APP handles the information needed to provide Nested Blog Filters &amp; Search, an application for organizing, filtering, and searching Shopify blog articles.</p>
        </header>

        <section aria-labelledby="en-data-collection">
          <h3 id="en-data-collection">Data Collection</h3>
          <p>When you connect a store, we process its identifier and domain, session and authorization data, and the blog and article content needed to provide the service, such as titles, tags, metafields, and filter information. Shopify may also provide information about authorized users, such as their names and email addresses.</p>
          <p>We use this information to authenticate the connection, synchronize content, save search and filter settings, and provide technical support. If you contact us, we use the information you share to respond to your inquiry.</p>
        </section>

        <section aria-labelledby="en-data-storage">
          <h3 id="en-data-storage">Data Storage (PostgreSQL)</h3>
          <p>In production, the information needed to operate the application is stored in a PostgreSQL database. We restrict access to the systems and people authorized to operate and maintain the service.</p>
          <p>We apply access controls and authentication to protect the data. The application's public connection uses HTTPS, and Shopify credentials are used for authorized application operations.</p>
        </section>

        <section aria-labelledby="en-third-party-sharing">
          <h3 id="en-third-party-sharing">Third-Party Sharing</h3>
          <p>We do not sell, rent, or trade store or user data. We may use hosting, database, and support providers to operate the service, sharing only the information needed for those functions or to meet applicable legal obligations.</p>
        </section>

        <section aria-labelledby="en-data-retention">
          <h3 id="en-data-retention">Data Retention and Requests</h3>
          <p>We retain information for as long as needed to provide the service and meet applicable obligations. We process privacy and uninstallation notices sent by Shopify to manage store data.</p>
          <p>You may request information about your data, or its correction or deletion, by contacting our support email address. To protect the information, we may need to verify that you are authorized to act on behalf of the store.</p>
        </section>

        <section aria-labelledby="en-analytics">
          <h3 id="en-analytics">Usage Analytics and Consent</h3>
          <p>If the store uses Premium and the visitor permits analytics through Shopify's privacy API, we count views of blog pages containing the filter block, filter interactions, and submitted searches. These are activity counters; they do not identify unique visitors.</p>
          <p>These metrics do not store IP addresses, cookies, names, email addresses, full URLs, or search text. Filter events may include the filter's internal identifier to count its usage. We use random tokens limited to each document and temporary technical hashes to prevent duplicates.</p>
          <p>Reports cover a window of up to 90 UTC days. On event ingestion or report generation, we remove aggregates outside that window and deduplication receipts older than two days. Theme editor previews do not generate analytics.</p>
        </section>

        <section aria-labelledby="en-contact">
          <h3 id="en-contact">Contact Information</h3>
          <p>If you have questions about this policy or how your data is handled, contact Dreamers APP at <a href="mailto:${DREAMERS_SUPPORT_EMAIL}">${DREAMERS_SUPPORT_EMAIL}</a>.</p>
        </section>
      </article>

      <footer><p class="brand">Nested Blog Filters &amp; Search · Dreamers APP</p></footer>
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
