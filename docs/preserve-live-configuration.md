# Conservar la configuración que está guardada en Render

El servicio Free actual no ofrece Shell/SSH ni disco persistente. No lo
reinicies, no cambies su plan y no despliegues otra imagen antes de obtener y
validar una copia de las configuraciones que todavía muestra la aplicación.
La copia SQLite del equipo local es independiente y no demuestra qué contiene
el contenedor de Render.

## Qué conserva esta exportación

`scripts/export-live-configuration.browser.js` es una herramienta puntual para
la versión actualmente publicada con React Router 7.18.2. Usa los mismos loaders
GET autenticados que utiliza el panel; no llama a acciones, no guarda cambios,
no cambia las URLs de Shopify y no despliega código nuevo.

Conserva los conjuntos y sus blogs, nombres, revisiones, fechas, filtros,
opciones, orden, IDs estables y condiciones de anidación. No copia sesiones,
tokens, contraseñas, clientes, estadísticas, cachés de artículos ni asignaciones
locales `ArticleOption`. Por tanto es una copia de **configuración**, no un backup
completo de SQLite. Las etiquetas y metafields que ya estén en Shopify se deben
comprobar al reconstruir el índice de artículos después de la migración.

## Pasos antes de reiniciar Render

1. Abre **Nested Blog Filters → Filtros** desde el Admin de la tienda autorizada
   `test-blog-store-weyqozsk.myshopify.com`. Debes ver los conjuntos guardados.
   Si la lista ya está vacía o faltan conjuntos, detente y avisa; una exportación
   vacía no recupera configuraciones perdidas anteriormente.
2. Espera a que terminen las importaciones. Guarda los cambios pendientes que
   quieras conservar y evita editar desde otras pestañas durante la exportación.
3. Abre las herramientas de desarrollo del navegador. Selecciona el contexto del
   iframe **`https://nested-blog-filters.onrender.com`**, no el documento superior
   `admin.shopify.com` ni otra tienda.
4. Revisa el archivo `scripts/export-live-configuration.browser.js`. En
   **Sources → Snippets**, crea un snippet con ese contenido y ejecútalo en el
   contexto de la app. Está vinculado expresamente al origen, client ID público
   y tienda indicados; no introduzcas ni pegues tokens o cookies.
5. Se descargará un único archivo `nested-blog-filters-config-…json`. Mantén
   abierta la pantalla y no navegues mientras trabaja. La herramienta relee los
   conjuntos para detectar cambios y tiene un máximo de tres minutos, cien
   conjuntos y 16 MiB. Si falla no descarga una copia parcial.
6. Guarda el JSON en la carpeta local ignorada `backups/`, fuera de Git. Comunica
   únicamente su ruta local y el número de conjuntos. **No pegues el archivo ni
   credenciales en el chat.** Antes de modificar Render, valida el archivo con la
   herramienta privada de transferencia, confirma el SHA-256 y compara sus
   nombres, filtros y opciones con lo que muestra el panel.

## Si se detiene

- `SELECT_THE_APP_IFRAME`: el snippet se ejecutó fuera del iframe de Render.
- `OPEN_THE_FILTER_LIST`: abre la página Filtros y espera que termine de cargar.
- `WRONG_APP` / `WRONG_SHOP`: la app o tienda no corresponde al destino autorizado.
- `APP_CHANGED_OR_REQUIRES_LOGIN`: la pantalla navegó, mostró un error o requiere
  iniciar sesión normalmente. No exportes hasta que Filtros vuelva a funcionar.
- `IMPORT_IN_PROGRESS`: espera a que termine la importación antes de repetir.
- `CONFIGURATIONS_CHANGED`: otro cambio ocurrió durante la lectura; detén las
  ediciones, recarga la lista y repite.
- `REQUEST_TIMEOUT` / `EXPORT_TIMEOUT`: no se pudo terminar la lectura. Revisa
  que la app siga respondiendo; no reinicies el servicio para intentar rescatar
  una SQLite que todavía está dentro de ese contenedor.
- `INVALID_SAVED_CONFIGURATION`, `INCOMPLETE_LOADER_RESPONSE`,
  `WRONG_CONFIGURATION_RESPONSE` u otro error: conserva la pantalla y comparte
  sólo el código del error. Un blog eliminado en Shopify, por ejemplo, puede
  impedir que el loader actual entregue su conjunto. Hace falta revisar ese caso
  antes de considerar la copia completa.

La herramienta no trata una identidad ausente como una tienda vacía. Incluso si
hay cero conjuntos, comprueba la identidad autenticada mediante el loader Inicio.
Depende de la interfaz interna del router de esa versión y falla de forma cerrada
si no está disponible. No debe incorporarse como funcionalidad pública de la app.

Referencias: [Shell y SSH en Render](https://render.com/docs/ssh),
[límites de servicios Free](https://render.com/docs/free).
