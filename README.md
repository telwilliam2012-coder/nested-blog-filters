# Shopify App Template - React Router

## Nested Blog Filters — Fase 2

El esquema local usa SQLite y Prisma 6. Los modelos de filtros son:

| Modelo | Responsabilidad |
| --- | --- |
| `FilterSet` | Un conjunto por tienda (`shop`) y blog (`blogId`, GID completo). |
| `Filter` | Una categoría con `key` estable, `label` visible y `position` para ordenarla. |
| `FilterOption` | Un valor único dentro de un filtro, con etiqueta y posición. |
| `Article` | Índice local de artículos del blog; `shopifyArticleId` guarda el GID completo. |
| `ArticleOption` | Relación de muchos a muchos entre artículos y opciones. |

Las claves foráneas compuestas impiden asociar opciones y artículos de conjuntos
distintos. Los borrados de un conjunto, filtro, opción o artículo eliminan sus
relaciones dependientes en cascada. `Session` conserva su estructura y sus datos.

Para preparar otra copia del proyecto con las migraciones existentes:

```shell
npm run setup
```

El servicio `app/services/filter-engine.server.ts` exporta `getFilteredArticles`.
Recibe `shop` desde el contexto autenticado del servidor, `filterSetId` y
`selections`, un objeto cuyas claves son IDs de `Filter` y cuyos valores son listas
de IDs de `FilterOption`. `page` empieza en 1; `pageSize` vale 24 por defecto y
admite valores entre 1 y 100.

El motor combina opciones de un filtro con OR y filtros diferentes con AND.
Devuelve artículos, total, paginación y filtros ordenados con `count`, `available`
y `selected` por opción. Los conteos aplican las selecciones de los demás filtros,
permitiendo cambiar de opción dentro del mismo selector. No dependen de la página
de artículos. Una selección vacía elimina esa condición; IDs inválidos o ajenos
provocan `FilterEngineError` en lugar de ignorarse.

Solo participan artículos con `publishedAt` no nulo y anterior o igual al momento
de la consulta. Los borradores y publicaciones futuras no aportan resultados ni
conteos. Sin selección se incluyen también artículos publicados sin atributos.

```shell
npm test
npm run typecheck
```

Las pruebas aplican las migraciones reales en una SQLite temporal, sin alterar
la base de desarrollo. Esta fase no importa artículos ni atributos desde Shopify:
el motor consulta el índice local que alimentarán las siguientes fases. La interfaz
de blogs existente sigue leyendo directamente la Admin API.

El inicio también muestra los totales de conjuntos, filtros, opciones y artículos
guardados de la tienda autenticada. Si existen conjuntos, permite consultar una
vista previa con selección múltiple, conteos en cascada, limpieza de filtros y
paginación. La ruta privada `/app/filter-preview` consulta el motor sin volver a
solicitar el resumen de blogs a Shopify. Esta vista no crea configuraciones ni
publica cambios en la tienda; muestra un estado vacío cuando no hay datos.

Referencias: [relaciones muchos a muchos de Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations/many-to-many-relations)
y [consultas con filtros](https://www.prisma.io/docs/orm/v6/prisma-client/queries/filtering-and-sorting).

## Nested Blog Filters — Fase 3

La extensión `extensions/nested-blog-filters/` contiene un App Block para
plantillas de blog, con desplegables de selección múltiple, conteos en cascada,
limpieza de filtros y una cuadrícula paginada de artículos. Sus textos están
traducidos al español y al inglés. No requiere bibliotecas de frontend.

| Archivo | Responsabilidad |
| --- | --- |
| `extensions/nested-blog-filters/blocks/blog-filters.liquid` | Bloque, configuración, textos y artículos iniciales renderizados en Shopify. |
| `extensions/nested-blog-filters/assets/filters.js` | Controles, peticiones, conteos, paginación y recuperación ante errores. |
| `extensions/nested-blog-filters/assets/filters.css` | Estilos encapsulados y adaptación móvil. |
| `app/routes/proxy.nested-filters.ts` | Ruta pública que exige autenticación de App Proxy de Shopify. |
| `app/services/storefront-filters.server.ts` | Consulta por tienda y blog, límites de entrada y respuesta pública sin credenciales. |

La configuración local del proxy en `shopify.app.toml` añade el permiso
`write_app_proxy` y define este recorrido:

```text
Tienda: /apps/nested-filters
    → Shopify firma la petición
    → App: /proxy/nested-filters
    → authenticate.public.appProxy(request)
    → motor de filtros de la tienda autenticada
```

El bloque envía `blogId` como GID completo, `page`, `pageSize` y parámetros
repetidos `option.<filterId>=<optionId>`. El servidor obtiene la tienda de la
sesión autenticada, no de un identificador proporcionado por el visitante.
Solo devuelve etiquetas, conteos, artículos publicados y paginación. Los errores
no exponen detalles internos y las respuestas desactivan el almacenamiento en caché.
El cliente inserta los títulos como texto, conserva el foco del teclado y descarta
respuestas de solicitudes anteriores si el visitante cambia de selección rápidamente.

Verificación local, sin sincronizar archivos con una tienda:

```shell
npm test
npm run typecheck
npm run build
shopify app build --json --no-input --skip-dependencies-installation
shopify theme check --path extensions/nested-blog-filters --config theme-check:theme-app-extension --output json --no-input
```

La suite incluye una prueba en Chromium cuando encuentra Chrome, Edge o Chromium.
También se puede indicar el ejecutable con `NBF_TEST_BROWSER`. Esta prueba usa un
servidor local y datos de prueba; no necesita credenciales de Shopify. El archivo
`filters.js` debe mantenerse por debajo de 10 KB. La fuente legible está en
`app/storefront/filters.js`; `npm run build:storefront` genera el recurso compacto
de la extensión, que no debe editarse directamente. Vite también lo regenera al
iniciar, compilar o modificar la fuente en desarrollo, y `npm test` lo prepara
antes de ejecutar las pruebas.

La interfaz muestra los valores elegidos en cada selector, selecciones que se
pueden quitar individualmente y un solo desplegable abierto a la vez. Los menús
se cierran al pulsar fuera o usar Escape. En móvil se abren dentro del flujo para
evitar que tapen los demás controles. Los textos siguen el idioma de la tienda.

Para probar en Shopify, una vez autorizada la sincronización de desarrollo:

1. Ejecutar `shopify app config validate --json --no-input` y `shopify app dev`
   desde la raíz del proyecto. Estos comandos contactan Shopify; el segundo
   sincroniza la extensión y la configuración de desarrollo. La instalación debe
   conceder el nuevo permiso `write_app_proxy` si Shopify lo solicita.
2. En el editor del tema de desarrollo, abrir una plantilla de **blog** y añadir
   el bloque **Filtros del blog / Blog filters** dentro de una sección que admita
   bloques de aplicaciones. Guardar el cambio en el tema de prueba.
3. Elegir entre 6, 12, 24 o 48 artículos por página. Si se personalizó el prefijo
   o la ruta del proxy en Shopify, reflejar la ruta en la configuración del bloque.
4. Probar combinaciones, limpiar selecciones y recorrer páginas. El bloque crea
   su propia cuadrícula; comprobar en el editor si se desea conservar la lista
   de artículos del tema o evitar que se muestre una segunda lista.

**Datos necesarios:** la extensión consulta el índice local de la Fase 2.
Para filtrar un blog deben existir su `FilterSet`, filtros, opciones, artículos
y asignaciones. Las pantallas de la Fase 4 permiten crear estos datos y leer los
atributos de Shopify. Si no existe un conjunto, el bloque conserva los artículos
iniciales de Liquid; el editor explica que falta configurar los filtros. Si no
hay JavaScript o falla la conexión, se conserva una alternativa para abrir el blog.

Esta implementación local no instala el bloque en un tema ni publica una versión
de la app. La verificación en una tienda sigue pendiente hasta ejecutar la
sincronización de desarrollo y añadir el bloque en el editor.

Referencias: [configuración de Theme App Extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration)
y [App Proxies](https://shopify.dev/docs/apps/build/online-store/app-proxies).

## Nested Blog Filters — Fase 4

El panel incluye ahora el constructor de filtros y la gestión de atributos de
artículos. Los accesos **Filtros** y **Artículos** están en la navegación de la app;
también hay accesos desde Inicio y desde cada blog.

| Ruta | Función |
| --- | --- |
| `/app/filters` | Listado de conjuntos guardados de la tienda autenticada. |
| `/app/filters/new` | Crear un conjunto para un blog de Shopify. |
| `/app/filters/$filterSetId` | Editar etiquetas, añadir opciones y ordenar filtros y opciones. |
| `/app/articles?filterSetId=...` | Importar artículos y editar sus atributos de forma individual o masiva. |

### Uso

1. En **Filtros → Crear conjunto**, elegir el blog y definir categorías como
   motivo, ocasión o diseño. Cada filtro tiene una etiqueta visible y una clave
   estable. Cada opción tiene una etiqueta visible y un valor persistente.
2. Guardar el conjunto. La app verifica que el blog pertenece a la tienda y crea
   las definiciones de metafields necesarias en Shopify.
3. Abrir **Gestionar artículos → Sincronizar desde Shopify**. La pantalla recorre
   automáticamente páginas de 25 artículos y guarda el avance. Si se cierra la
   página o falla Shopify, se puede reanudar o cancelar desde la misma pantalla.
4. Seleccionar un artículo para editarlo individualmente o hasta 25 artículos de
   la página para una edición masiva. Elegir el filtro y la operación:
   **añadir**, **quitar** o **reemplazar** sus opciones.
5. Pulsar **Guardar atributos en Shopify**. La app guarda una lista de valores en
   los artículos elegidos y actualiza el índice local que usa el motor de filtros.
   Reemplazar sin opciones seleccionadas vacía únicamente el filtro elegido.

Las etiquetas y posiciones se pueden editar sin cambiar los identificadores ni
perder asignaciones. Las claves y los valores ya guardados permanecen estables.
Antes de eliminar una opción o un filtro en uso, hay que quitar sus asignaciones
desde Artículos. Se admiten hasta 10 filtros por conjunto, 200 opciones configuradas
por filtro y 128 valores asignados por artículo y filtro.

### Metafields y sincronización

Los atributos se guardan en metafields **del artículo** (`ownerType: ARTICLE`),
en el namespace reservado de la app (`$app`), con claves `nbf_<clave_del_filtro>`
y tipo `list.single_line_text_field`. Los valores se envían como listas JSON.
Las definiciones se crean dinámicamente porque los filtros los configura el
comerciante. El acceso administrativo permite editarlos también en Shopify.

La pantalla consulta los atributos actuales de Shopify y sus `compareDigest`.
Antes de escribir, verifica que siguen siendo los que vio el comerciante. Cada
lote usa una única operación atómica `metafieldsSet` y no modifica otros filtros.
Si alguien cambió los atributos en otra pestaña o en Shopify, la pantalla pide
recargar en lugar de sobrescribirlos.

La migración `add_article_sync` añade `FilterSet.revision` y `ArticleSync`. Durante
una importación se bloquean los cambios de configuración y atributos del conjunto.
Los artículos eliminados o movidos se retiran del índice solo al completar el
recorrido; cancelar conserva las páginas ya importadas. Los artículos sin publicar
se guardan con `publishedAt: null`, aunque Shopify conserve una fecha anterior.
Los valores nuevos que aparezcan en los metafields se incorporan como opciones.

Shopify es la fuente de los atributos. Si Shopify confirma el guardado pero falla
la actualización local, la pantalla lo comunica y pide sincronizar. Los cambios
realizados directamente en Shopify necesitan una nueva sincronización manual;
la sincronización mediante webhooks corresponde a la Fase 5.

### Verificación local

```shell
npm run setup
npm test
npm run typecheck
npm run build
```

Después de regenerar Prisma, reiniciar el servidor de desarrollo que estuviera
abierto para que cargue el cliente nuevo. Las pruebas de administración usan SQLite
temporal y respuestas simuladas de Shopify: cubren configuración, paginación,
reanudación, cancelación, aislamiento entre tiendas, escrituras con CAS y
recuperación tras fallos. Las operaciones GraphQL se validaron localmente contra
el esquema público de Admin API **2026-07**, la versión configurada en la app.

Las escrituras reales se ejecutan al guardar desde el panel autenticado. Esta
implementación no ejecutó escrituras sobre una tienda ni modificó su tema.

Referencias: [crear definiciones de metafields](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/metafieldDefinitionCreate),
[guardar metafields](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/metafieldsSet)
y [Polaris para App Home](https://shopify.dev/docs/api/app-home/v2.0/web-components).

## Filtros anidados y etiquetas de Shopify

Cada filtro puede usar **atributos gestionados en la app** o las **etiquetas del
artículo en Shopify**. Las etiquetas se importan al sincronizar; no se modifican
en Shopify. El valor de una opción debe coincidir con la etiqueta, sin distinguir
mayúsculas ni espacios al principio o al final. Solo se usan las etiquetas que
figuran como opciones del filtro, por lo que otras etiquetas no se mezclan entre
niveles.

En el editor, **Mostrar este filtro después de** permite elegir un filtro
anterior y las opciones que activan el siguiente nivel. Las condiciones se
guardan explícitamente: Shopify no aporta una relación padre/hijo entre etiquetas.

**Usar estructura Celebraciones** prepara este formulario:

| Selector | Opciones | Cuándo aparece |
| --- | --- | --- |
| Motivos | Decoraciones, Celebraciones | Siempre |
| Ocasión | Festividades, Ocasiones Especiales | Al seleccionar Celebraciones |
| Festividades | Halloween, Navidad, Amor y Amistad | Al seleccionar Festividades |

La estructura se puede editar antes de guardar. El botón reutiliza las opciones
existentes cuando coinciden con las del ejemplo y conserva las demás. Por ejemplo,
si el filtro Motivo ya contiene Halloween y Navidad, se reutiliza como selector de
Festividades y se añaden los dos niveles anteriores. No cambia la configuración
de conjuntos guardados hasta pulsar Guardar conjunto.

Por ejemplo, el artículo **Fiesta de Navidad** debería llevar las etiquetas
`Celebraciones`, `Festividades` y `Navidad`. Si todos los artículos llevan también
`Decoraciones` y `Ocasiones Especiales`, aparecerán al elegir esas opciones:
las etiquetas comunes no permiten distinguir las ramas.

Después de guardar el conjunto, abrir **Artículos → Sincronizar desde Shopify**.
Esta sincronización vuelve a leer etiquetas, publicación e imagen de cada
artículo. Si el servidor estaba abierto al regenerar Prisma, reiniciarlo para
que cargue el cliente actualizado. Las nuevas migraciones se aplican con
`npm run setup` en otras copias del proyecto.

Los niveles inferiores permanecen ocultos hasta activar su condición. Cambiar
un selector limpia sus descendientes, y el servidor descarta selecciones de
niveles ocultos o sin coincidencias. Los conteos de un nivel no quedan limitados
por sus descendientes, para que se pueda cambiar de rama. Diseño, género y
otros filtros pueden seguir siendo independientes. La cuadrícula muestra las
imágenes de los artículos cuando están disponibles, con carga diferida.

Referencias: [etiquetas e imagen de los artículos](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Article).

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).
4. Using metafields, metaobjects, and declarative custom data definitions. Please see [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx) and [shopify.app.toml](https://github.com/Shopify/shopify-app-template-react-router/blob/main/shopify.app.toml).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)
