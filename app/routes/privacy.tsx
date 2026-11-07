import { DREAMERS_SUPPORT_EMAIL } from "../support/contact";

export function loader() {
  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Política de privacidad de Nested Blog Filters &amp; Search, una aplicación de Dreamers APP para Shopify.">
    <title>Política de privacidad | Nested Blog Filters &amp; Search</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #20332e; background: #f5f7f6; }
      * { box-sizing: border-box; }
      body { margin: 0; padding: 32px 20px; line-height: 1.7; }
      main { max-width: 820px; margin: 0 auto; padding: clamp(24px, 5vw, 48px); background: #fff; border: 1px solid #dce5e0; border-radius: 12px; }
      header { padding-bottom: 24px; border-bottom: 1px solid #dce5e0; }
      h1 { margin: 8px 0 12px; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1.25; }
      h2 { margin-top: 32px; font-size: 1.2rem; line-height: 1.4; }
      p { margin: 12px 0; }
      .brand, .updated { color: #65756f; font-size: .95rem; }
      .brand { font-weight: 600; }
      a { color: #245c4c; overflow-wrap: anywhere; text-underline-offset: 3px; }
      a:focus-visible { outline: 2px solid #245c4c; outline-offset: 4px; }
      footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #dce5e0; }
    </style>
  </head>
  <body>
    <main>
      <header>
        <p class="brand">Dreamers APP · Nested Blog Filters &amp; Search</p>
        <h1>Política de privacidad</h1>
        <p class="updated">Última actualización: <time datetime="2026-11-07">7 de noviembre de 2026</time></p>
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

      <section aria-labelledby="contacto">
        <h2 id="contacto">5. Contacto de soporte</h2>
        <p>Para preguntas sobre esta política o el tratamiento de tus datos, contacta con Dreamers APP en <a href="mailto:${DREAMERS_SUPPORT_EMAIL}">${DREAMERS_SUPPORT_EMAIL}</a>.</p>
      </section>

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
