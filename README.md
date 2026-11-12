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
vista previa con selección única por filtro, conteos en cascada, limpieza de filtros y
paginación. La ruta privada `/app/filter-preview` consulta el motor sin volver a
solicitar el resumen de blogs a Shopify. Esta vista no crea configuraciones ni
publica cambios en la tienda; muestra un estado vacío cuando no hay datos.

Referencias: [relaciones muchos a muchos de Prisma 6](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations/many-to-many-relations)
y [consultas con filtros](https://www.prisma.io/docs/orm/v6/prisma-client/queries/filtering-and-sorting).

## Nested Blog Filters — Fase 3

La extensión `extensions/nested-blog-filters/` contiene un App Block para
plantillas de blog, con desplegables de selección única por filtro, conteos en cascada,
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
`option.<filterId>=<optionId>`, con un único valor por filtro. El servidor obtiene la tienda de la
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

La cabecera muestra un buscador y una fila compacta de filtros. La búsqueda por
título o identificador de URL se aplica a todos los artículos publicados del
índice del blog, se combina con los filtros y conserva la paginación y los conteos.
Sin JavaScript se usa la búsqueda estándar de Shopify restringida a artículos.
Las selecciones pueden quitarse individualmente y solo hay un desplegable abierto a la vez. Los menús
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

## Interfaz del bloque de tienda

El bloque usa CSS nativo encapsulado bajo `nested-blog-filters.nbf` y clases
`nbf__`, sin Tailwind ni Polaris en la tienda. Los botones muestran el nivel,
la categoría, el valor elegido y un badge de selección. Los menús incluyen
el contexto del filtro padre. Los indicadores visuales son pseudoelementos CSS;
los controles mantienen radios nativos para permitir una sola opción por filtro
y navegación con las flechas del teclado.

Las aperturas y cierres duran 300 ms, con opacidad y un desplazamiento de 4 px
definido por `--nbf-menu-offset`. Las etiquetas se eliminan con una
transición de opacidad y escala. Se respeta `prefers-reduced-motion`. En móvil
los menús se abren dentro del flujo y las etiquetas comparten una fila compacta
con la acción de limpiar. Las propiedades lógicas permiten texto RTL.

Los colores se personalizan por bloque desde **Tienda online → Temas → Personalizar**,
en la plantilla de blog, seleccionando **Filtros del blog**. Los controles
**Color de fondo del Badge** (`#0e5a44`), **Color de texto del Badge** (`#ffffff`)
y **Color de acento general** (`#245c4c`) actualizan los indicadores numéricos
activos, las selecciones y los estados de los botones. También se pueden configurar:

- **Paleta general**: texto principal, texto secundario e iconos (incluido el
  placeholder del buscador), fondo del bloque y desplegables, fondos suaves y bordes.
- **Buscador**: fondo del recuadro y colores de fondo y texto del botón Buscar.
- **Selecciones activas**: fondo y texto de filtros/opciones seleccionados y de
  las etiquetas que aparecen debajo de los filtros, incluido su icono de quitar.

Los colores específicos de buscador y selecciones son opcionales. Al dejarlos
vacíos se usa la paleta general; el botón Buscar conserva el acento y texto blanco.
Los estados de foco y hover también respetan los colores configurados. Las variables
`--nbf-badge-bg`, `--nbf-badge-text` y `--nbf-accent` quedan
limitadas al ID del bloque; las variables de uso `--nbf-color-badge-bg`,
`--nbf-color-badge-text` y `--nbf-color-accent` las consumen mediante `var()` con respaldo,
sin autorreferencias. Varios bloques pueden usar colores diferentes. Si se borra un color,
se utiliza su valor predeterminado. El bloque usa `{% style %}` para la vista
previa de colores del editor, sin JavaScript adicional. Se conservan los bordes
de 12 px de los desplegables y sus sombras, que toman el color de acento.

Los tiempos se ajustan mediante las variables `--nbf-*` al inicio
de `extensions/nested-blog-filters/assets/filters.css`. El JavaScript legible
permanece en `app/storefront/filters.js`; ejecutar `npm run build:storefront`
regenera el recurso de la extensión y comprueba que no supere 10 KB.

La prueba de Chromium comprueba selección única, teclado, foco, cierre con
Escape y clic exterior, animaciones, pantallas de 320 px, RTL, nombres largos
y estilos genéricos de un tema externo. `NBF_SCREENSHOT_DIR` permite guardar
capturas reales de escritorio y móvil.

## Idiomas de la tienda y del panel

La interfaz admite español (`es`), inglés (`en`), alemán (`de`), italiano (`it`)
y francés (`fr`). Los diccionarios completos se guardan en tres grupos:

| Superficie | Archivos | Selección del idioma |
| --- | --- | --- |
| Tienda | `extensions/nested-blog-filters/locales/{es,en.default,de,it,fr}.json` | Idioma activo de Shopify para el visitante. |
| Editor de temas | `extensions/nested-blog-filters/locales/{es,en.default,de,it,fr}.schema.json` | Idioma del administrador en Shopify. |
| Panel de la app | `app/locales/{es,en,de,it,fr}.json` | Selector **Idioma de la aplicación** en Inicio. |

Shopify resuelve los textos de Liquid mediante `t` y el idioma de la solicitud.
El bloque transmite esos mismos textos al JavaScript mediante atributos `data-*`;
los conteos y fechas usan `data-locale`. Para ofrecer los idiomas en la tienda,
el comerciante debe añadirlos y publicarlos en la configuración de idiomas de
Shopify. Los controles `badge_bg_color`, `badge_text_color` y `accent_color`
se traducen mediante los archivos `.schema.json`, no mediante los de la tienda.

`AdminI18nProvider`, montado en `/app`, comparte el idioma con Inicio, Blogs,
la navegación, el constructor de filtros y la gestión de Artículos. El idioma
inicial procede del parámetro `locale` de Shopify o de `Accept-Language`;
los idiomas regionales se reducen a su idioma base y el respaldo es español.
Después de hidratar se recupera la elección del navegador, guardada por tienda
en `nbf.admin.locale:<shop>`. La elección persiste al navegar y recargar y se
sincroniza entre pestañas. Si el navegador bloquea el almacenamiento, la
selección sigue funcionando durante la sesión de la app. No cambia el idioma
del escaparate ni las preferencias generales de Shopify.

Los componentes usan `useAdminI18n()` para obtener `locale`, `setLocale`, `t` y
`formatNumber`. Las claves del Admin usan los mensajes de origen, principalmente en español, y las
interpolaciones usan `{{v0}}`, `{{v1}}`, etc. Los avisos existentes del servidor
se traducen al mostrarlos, incluidos los motivos de validación y los conteos.
Los nombres, títulos, etiquetas y valores del comerciante se conservan;
este sistema traduce la interfaz, no el contenido de los blogs. Los mensajes
externos desconocidos conservan el texto proporcionado por Shopify.

Las pruebas comprueban la paridad de claves e interpolaciones, el renderizado
de las pantallas en cinco idiomas, la negociación inicial y, en Chromium, el
selector, la navegación, los borradores y las preferencias de cada tienda.
Las pruebas de navegador usan componentes de la app con elementos de prueba
para los eventos Polaris; no requieren una sesión ni escrituras en Shopify.

Referencia: [locales de Shopify](https://shopify.dev/docs/storefronts/themes/architecture/locales).

## Ayuda y soporte de Dreamers APP

El menú **Ayuda** abre `/app/help`, con la guía de inicio, la configuración de
etiquetas, seis preguntas desplegables y el contacto de Dreamers APP. Inicio
también ofrece un acceso a la documentación y otro a la ayuda rápida.

Un asistente fijo aparece en la esquina inferior derecha de todas las pantallas
del Admin. Su panel lateral muestra los tres pasos de inicio, la documentación
completa y un formulario de contacto, sin navegar fuera de la configuración.
El formulario conserva su borrador al cerrar el panel o consultar la guía.
El diálogo nativo gestiona el foco y Escape, usa controles y tarjetas oficiales
de Polaris Web Components y respeta la preferencia de movimiento reducido.
Esta versión de Polaris no expone una posición lateral para `s-modal`.

El correo oficial se centraliza en `app/support/contact.ts`:
`telwilliam2012@gmail.com`. El formulario valida el asunto, el mensaje y el correo
opcional de respuesta, y prepara un enlace `mailto:` con el dominio de la tienda,
el idioma y la ruta actual. No añade parámetros de URL. Abre un borrador en el
cliente de correo del comerciante; el comerciante lo revisa y envía desde allí.
Si el navegador no abre ese cliente, se ofrece un enlace al borrador preparado.
No hay envío desde el servidor, almacenamiento de consultas ni servicio SMTP.

La ayuda está traducida a los cinco idiomas mediante `useAdminI18n()`. Sus textos
documentan la lógica actual: las etiquetas se comparan con valores completos y
el árbol se configura mediante las relaciones del constructor. Una etiqueta como
`Categoría_Subcategoría` no genera niveles automáticamente. El ejemplo de
Celebraciones prepara una jerarquía explícita; no cambia esta regla.

Componentes principales: `help-content.tsx`, `admin-support.tsx` y
`support-contact-form.tsx`. `AdminSupportProvider` se monta una sola vez dentro
del contexto global de idioma en `app/routes/app.tsx`. Las pruebas verifican las
FAQs en cinco idiomas, la validación y codificación del correo, el panel móvil,
Escape y la conservación de los borradores. Las pruebas simulan la apertura
del cliente de correo y no envían mensajes reales. `npm test` ejecuta los archivos
en serie para evitar que los navegadores de prueba compitan por recursos y
bloqueen sus perfiles temporales en Windows.

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
artículo en Shopify**. Las etiquetas se importan al sincronizar y se pueden editar
desde **Artículos**. El valor de una opción debe coincidir con la etiqueta, sin distinguir
mayúsculas ni espacios al principio o al final. Solo se usan las etiquetas que
figuran como opciones del filtro, por lo que otras etiquetas no se mezclan entre
niveles.

En **Artículos**, selecciona hasta 25 artículos, el filtro y la operación
**añadir**, **quitar** o **reemplazar**. El botón **Guardar etiquetas en Shopify**
modifica únicamente las etiquetas que corresponden a las opciones del filtro.
Reemplazar sin elegir opciones vacía ese filtro; las etiquetas ajenas se conservan.
La app vuelve a leer Shopify y actualiza el índice local al terminar, sin exigir
otra sincronización manual.

Antes de escribir se comprueba que las opciones del filtro no hayan cambiado
desde que se abrió la pantalla. Las escrituras usan `tagsAdd` y `tagsRemove`,
de modo que no sustituyen la lista completa de etiquetas ni borran etiquetas
ajenas añadidas por otra sesión. Estas operaciones no ofrecen el CAS de los
metafields ni una transacción entre artículos. Si Shopify rechaza parte del lote,
la app lo indica y reconcilia el índice con el estado disponible; si no puede
confirmarlo, solicita sincronizar el blog antes de continuar.

Referencias: [añadir etiquetas](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/tagsAdd)
y [quitar etiquetas](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/tagsRemove).

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

## Fase 5 — Recepción local de webhooks

`shopify.app.toml` dirige `app/uninstalled`, `customers/data_request`,
`customers/redact` y `shop/redact` a **POST `/api/webhooks`**. Los tres eventos
de privacidad se registran mediante `compliance_topics`; `app/scopes_update`
conserva su ruta existente.

El receptor valida el HMAC sobre el cuerpo original usando `webhooks.validate`
del SDK oficial de Shopify y el adaptador Web API para Request. Devuelve 401
si la firma falta o es incorrecta. No necesita cargar sesiones ni renovar tokens,
por lo que puede procesar una desinstalación con credenciales revocadas.

`app/uninstalled` y `shop/redact` eliminan los conjuntos y sesiones de esa tienda
en una transacción de SQLite. Las relaciones de Prisma eliminan en cascada filtros,
opciones, artículos indexados, asignaciones y sincronizaciones. Antes del borrado,
el dominio del payload firmado debe coincidir con la cabecera de tienda. Los
reintentos devuelven 200 aunque los registros ya no existan. Si falla la base de
datos, la transacción revierte y no se confirma el evento como procesado.

La app no almacena clientes ni pedidos. `customers/data_request` y
`customers/redact` devuelven 200 con cuerpo vacío sin guardar ni registrar su
payload. Si se incorpora información de clientes, estos casos deberán implementar
su exportación o borrado antes de confirmar el procesamiento.

La antigua ruta `/webhooks/app/uninstalled` comparte el nuevo controlador para
aceptar entregas de configuraciones previas. Las pruebas usan firmas reales y una
SQLite temporal con las migraciones del proyecto; no alteran `prisma/dev.sqlite`.
La configuración queda preparada localmente; su registro y la verificación de
entregas desde Shopify requieren aplicar la configuración en una tienda de desarrollo.

Referencias: [privacidad de Shopify](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
y [validación de entregas](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries).

## Fase 5 — Facturación recurrente

El modo normal usa **Shopify App Pricing / Managed Pricing**. Los planes y las pruebas
se configuran en el panel de precios de Shopify; el archivo `shopify.app.toml`
no define planes mediante un bloque `[billing]`. Los valores compartidos de
`app/billing-plans.ts` alimentan las tarjetas locales y los identificadores del
SDK. No publican ni modifican los precios de Shopify.

| Plan | Mensual | Anual | Prueba gratis |
| --- | --- | --- | --- |
| Pro | 4.99 USD | 40.99 USD | 7 días |
| Premium | 9.99 USD | 90.99 USD | 7 días |

El control local solicitado consulta la Admin API autenticada mediante
`billing.check({ isTest: true })` en desarrollo.
El loader principal y cada loader/action de datos exigen una suscripción
recurrente `ACTIVE` de Pro o Premium. Una compra única o una suscripción
pendiente, congelada, cancelada o con otro nombre no habilitan el panel.
Una tienda sin pago activo se dirige a `/app/billing`; Ayuda permanece accesible
con autenticación. Un fallo de la API no se trata como una aprobación.

En producción, `managed-pricing.server.ts` consulta la Active Subscription API
de Partner `2026-07`. Obtiene los IDs de tienda y app mediante la Admin API
autenticada y comprueba que ambos y el client ID coincidan con el contrato.
El nivel procede de los `items.handle` actuales `pro` o `premium` con precio
`FlatRatePrice`, nunca de parámetros, importes o cambios de plan pendientes.
Un contrato nulo significa ausencia de suscripción activa; los errores impiden
el acceso con 503 y no se convierten en aprobación ni en una segunda compra.

Configura `SHOPIFY_PARTNER_ID` y `SHOPIFY_PARTNER_API_ACCESS_TOKEN` en Render
con un cliente Partner API que tenga permiso `Manage apps`. El Partner ID de
la URL de Partners no es el organization ID del Dev Dashboard. Los accesos
administrativos fuerzan una consulta fresca; el storefront usa caché positiva
de hasta 30 segundos, acotada a 512 tiendas y a los próximos bordes de ciclo o
ensayo, sin reutilizar datos vencidos cuando falle la API. Desarrollo y pruebas
conservan Admin legacy, salvo opt-in `SHOPIFY_BILLING_VERIFICATION=partner`.

El entorno local activa temporalmente `SHOPIFY_BILLING_MODE=manual_test` en
`.env`. Solo funciona con `NODE_ENV=development` o `test`; en producción se
conserva el modo normal aunque esa variable esté presente. Al pulsar Elegir Pro
o Premium, el POST autenticado comprueba primero si ya existe una suscripción activa.
Si no existe, ejecuta directamente `appSubscriptionCreate` mediante la Admin API,
con `test: true` literal, 7 días de prueba y un cargo cada 30 días: Pro 4.99 USD
o Premium 9.99 USD. Los términos proceden de las constantes del servidor; se ignoran
importes, pruebas y URLs que envíe el navegador. No se crean cargos en un GET.

La mutación hace un único intento y muestra los `userErrors` reales de Shopify.
Si recibe una `confirmationUrl` HTTPS de la tienda autenticada o de
`admin.shopify.com`, usa la redirección del SDK con `target: "_top"`.
La URL de retorno estable lleva a `/app` dentro del Admin para volver a comprobar
la suscripción; crear un registro pendiente no habilita el panel. No hay cobros
reales en este modo. Para desactivarlo, elimina `SHOPIFY_BILLING_MODE` o establece
`managed` y reinicia `npm run dev`.

**Esta opción no evita las restricciones de plataforma.** La mutación no crea
un catálogo de planes Managed ni cambia el método de precios registrado para
la app. Si Shopify prohíbe Billing API para esa app, también rechazará la
mutación de prueba: habrá que habilitar Manual Pricing donde Shopify lo permita
o configurar los planes Managed en Partner Dashboard. La configuración de
precios pertenece a Partner Dashboard, aunque el desarrollo esté en Dev Dashboard.
No se altera automáticamente esa configuración remota.

En el modo normal, el loader autenticado comprueba el acceso y consulta
`currentAppInstallation { app { handle } }` para construir el enlace de cada tarjeta.
El handle registrado en Shopify tiene prioridad sobre `SHOPIFY_APP_HANDLE`;
la variable se usa únicamente si Shopify devuelve un handle vacío. Un error de
consulta no utiliza ese respaldo. Los botones abren fuera del iframe:

`https://admin.shopify.com/store/{store_handle}/charges/{app_handle}/pricing_plans`

Ambas tarjetas abren la misma pantalla nativa: allí se selecciona y aprueba el
plan definitivo. La configuración local usa `handle = "nested-blog-filters-search"` en
`shopify.app.toml` y `SHOPIFY_APP_HANDLE=nested-blog-filters-search` en `.env`, con el slug
verificado mediante la Admin API. Debe coincidir con el handle real de la app en Shopify;
no es el client ID ni el nombre visible. Si cambia, actualiza ambos archivos y
reinicia `npm run dev` para cargar el entorno. La tienda procede de la sesión y el destino se valida en
el servidor. Importes, URLs y pruebas enviados por el navegador se ignoran.
En el modo normal no se llama a `appSubscriptionCreate`. Ninguno de los dos modos usa `billing.request` ni `billing.require`.

Los botones usan `href` y `target="_top"`, omitiendo atributos booleanos inactivos
para que React 18 no los convierta en controles deshabilitados. El POST de respaldo
usa `context.redirect(url, { target: "_top" })` del SDK, conservando
sus respuestas de App Bridge para salir del iframe. Ese POST conserva únicamente
`shop`, `host`, `embedded`, `locale` y `admin_theme`, sin copiar tokens ni
firmas. Las respuestas de autenticación y redirección se propagan intactas.
Los errores conservan el tipo real y los detalles de Shopify saneados en el log;
los fallos de validación devuelven 422 y los de conexión 503, sin convertirlos
en un 502 ni reintentar la creación de cargos.

Configura el Welcome link de ambos planes como `/app` en Shopify. Al volver,
el servidor consulta otra vez el pago; `charge_id`, `approved` y `plan_handle`
no conceden acceso. Si no se confirma una suscripción, se muestran de nuevo las
tarjetas locales, sin redirigir automáticamente a la pantalla nativa en un bucle.

En desarrollo, `isTest: true` permite comprobar las suscripciones de prueba de
la integración Admin legacy. Los contratos nuevos de Partner no tienen un campo
`test` ni `status`; el objeto activo, sus items y las fechas de ciclo/ensayo son
la fuente de verificación. Un ensayo puede tener `currentBillingCycle: null`
y un contrato de desarrollo puede tener precio cero. Las condiciones del flujo
hosted las controla Shopify. El panel y sus errores usan los cinco idiomas.

Las pruebas ejecutan el SDK real con respuestas GraphQL locales y SQLite
temporal, simulan las mutaciones de prueba y verifican la salida del iframe,
el control de acceso y el retorno. No crean suscripciones reales. La aprobación
y visibilidad de la suscripción todavía requieren una prueba en la tienda.

En desarrollo, Vite escucha en `127.0.0.1` con `strictPort: true` para conservar
el puerto asignado por Shopify CLI. El watcher excluye `artifacts/` para evitar
recargas o bloqueos `EBUSY` por registros de verificación en Windows. Si el túnel
devuelve HTML de error, el panel muestra un mensaje traducido de conexión y
conserva el tratamiento de las respuestas de autenticación.

Referencias: [facturación del SDK](https://shopify.dev/docs/api/shopify-app-react-router/latest/apis/billing),
[Shopify App Pricing](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing)
y [redirección a planes y comprobación del estado](https://shopify.dev/docs/apps/launch/billing/shopify-app-pricing/redirect-plan-selection-page).

### Funciones y permisos por plan

| Función | Pro | Premium |
| --- | --- | --- |
| Blogs activos | 1 | Todos los blogs configurados |
| Filtros por blog | Hasta 3 | Hasta 10 (límite técnico) |
| Filtros anidados y búsqueda | Sí | Sí |
| Edición de artículos | Individual | Individual y masiva |
| Colores y cinco idiomas | Sí | Sí |
| Estadísticas | No | Vistas, filtros y búsquedas |
| Informes | No | Por blog/día; 7, 30 o 90 días |

Los límites se verifican en el servidor. Pro activa el conjunto más antiguo
(createdAt/id) y sus tres primeros filtros en orden. Al bajar de plan se guardan
los demás datos, pero dejan de estar activos en la tienda. Los conjuntos que
exceden el plan pueden editarse sin aumentar su número de filtros. Las altas
concurrentes se protegen con transacciones Serializable; las acciones masivas
de Pro se rechazan antes de mutar Shopify. El plan no procede de formularios ni URL.

La pantalla /app/billing permite gestionar el plan actual o cambiarlo. El antiguo
nombre Starter ya no concede acceso y una suscripción antigua llamada Pro no se
convierte automáticamente en Premium por su precio anterior.

### Estadísticas Premium

/app/analytics muestra vistas de páginas con el bloque, interacciones con filtros
y búsquedas enviadas, además del top 10 de filtros por interacciones. No son
personas únicas, conversiones ni tráfico histórico.
analytics.js se carga aparte del bundle principal. Solo envía eventos si
customerPrivacy.analyticsProcessingAllowed() permite análisis; si la API falta
o falla, no envía nada. El editor de temas queda excluido.

El POST firmado /apps/nested-filters/events llega a /proxy/nested-filters/events.
El servidor verifica la tienda y Premium. No se guardan IP, cookies, identidades,
URL completas ni texto buscado. Los tokens aleatorios viven en el documento;
los recibos son hashes acotados al conjunto/tienda. Al recibir eventos o consultar
informes se eliminan los agregados fuera de la ventana de 90 días y recibos de más
de dos días. El borrado de conjuntos elimina métricas y recibos en cascada.
`FilterUsageDaily` almacena únicamente el ID del filtro y sus conteos diarios.
Los cambios de selección y retiradas individuales se atribuyen al filtro validado
contra la tienda/blog. Limpiar todos suma solo al contador general. Los eventos
anteriores sin ID de filtro no se convierten en rankings históricos ficticios.

SQLite local y PostgreSQL tienen esquemas e historiales separados. Para Render
con la base existente, sigue [la guía PostgreSQL](docs/deployment-postgresql.md):
hay que revisar el esquema y su historial antes de adoptar el baseline.
La inspección de producción debe realizarse en solo lectura antes de migrar;
configurar una `DATABASE_URL` no demuestra que el servicio ya use esa base.

### Campos para Shopify Partners

Display name: Pro (handle pro) y Premium (handle premium), ambos por debajo de
18 caracteres. Precios: 4.99 USD mensual / 40.99 USD anual para Pro; 9.99 USD
mensual / 90.99 USD anual para Premium. Prueba de 7 días para ambos.

Copia estos Top features en inglés: cada entrada tiene menos de 40 caracteres
y ninguna columna supera las ocho entradas disponibles.

| Pro | Premium |
| --- | --- |
| 1 blog | All store blogs |
| Up to 3 filters per blog | Up to 10 filters per blog |
| Nested filters and article search | Blog views and usage analytics |
| Individual article editing | Bulk article editing |
| Custom colors and 5 languages | Reports by blog and day |
| Theme editor app block | 7, 30 and 90-day reports |
| | Custom colors and 5 languages |
| | Everything in Pro |

Si se pide Welcome link dentro de la app, usa /app. Los precios se configuran en
Shopify, las tarjetas locales no crean planes. El verificador Partner de producción
está implementado y probado con respuestas simuladas. Su validación real requiere
configurar las credenciales en Render, revisar la PostgreSQL existente y desplegar
el backend y la extensión de tema. Un test local no acredita por sí solo el estado
de esos servicios externos.

## URLs públicas de desarrollo y ficha de Partners

`shopify.app.toml` usa `https://nested-blog-filters.onrender.com`. En Render,
`SHOPIFY_APP_URL` debe contener ese mismo origen estable. Los retornos OAuth son
`/auth/callback` y `/auth/shopify/callback`; el App Proxy apunta al controlador
`/proxy/nested-filters` y sus eventos llegan a `/proxy/nested-filters/events`.

La ruta pública `/privacy`, en `app/routes/privacy.tsx`, devuelve HTML en español
con la política de Nested Blog Filters & Search: datos de Shopify, PostgreSQL
en producción (confirmado por el responsable de la app), seguridad, no venta
de datos y soporte en `telwilliam2012@gmail.com`. `/tos` conserva su respuesta
provisional independiente. Sus direcciones completas se guardan como
`PRIVACY_POLICY_URL` y `TOS_URL` en el entorno y se documentan como comentarios
en el TOML.
Los nombres `privacy_policy_url` y `tos_url` no son campos nativos del esquema
TOML instalado: los enlaces de la ficha se introducen en Shopify Partners.
La raíz `https://trycloudflare.com` pertenece al proveedor y no sirve estas rutas.

El desarrollo local puede utilizar un túnel temporal con una configuración
separada. No sustituyas las URLs de producción por ese túnel. Modificar archivos
locales no actualiza por sí solo la ficha de Partners ni publica la extensión.

El archivo `react-router.config.ts` configura `routeDiscovery.mode = "initial"`
para incluir todos los metadatos de rutas desde la primera carga. Así, la
navegación de Polaris a Ayuda no necesita descubrir la ruta mediante una
petición adicional a `/__manifest`. Los módulos JavaScript y los loaders siguen
cargándose según se necesitan; autenticación y facturación se mantienen en sus
loaders. Después de cambiar esta configuración, reinicia el servidor de
desarrollo y vuelve a abrir la app desde Shopify.


## Producción en Render con PostgreSQL

Usa [la guía PostgreSQL](docs/deployment-postgresql.md), `Dockerfile.postgresql`
y las variables de `.env.production.example`. El historial PostgreSQL y la
generación del cliente están separados del entorno SQLite local. Revisa y
preserva los datos del contenedor actual antes de cambiar el proveedor.

### Alternativa con SQLite y volumen persistente

La preparación queda local: no se ha desplegado ningún servicio ni cambiado la
ficha de Partners. El servidor usa `SHOPIFY_APP_URL` en tiempo de ejecución.
`npm start` fuerza `NODE_ENV=production`, comprueba la configuración, aplica
`prisma migrate deploy` y solo después abre el servidor de React Router.
Un error de migración impide el arranque. `HOST` vale `0.0.0.0` por defecto y
se respeta el `PORT` asignado por el proveedor. El modo manual de cobros de prueba
queda desactivado en producción por su control existente.

Prisma conserva SQLite y las cuatro migraciones existentes. La URL procede de
`DATABASE_URL`: en local, `file:dev.sqlite` sigue señalando a
`prisma/dev.sqlite`; en nube, usa `file:/data/dev.sqlite` y monta un volumen
persistente en **/data**, incluido su journal/WAL. El directorio debe existir y
ser escribible antes de arrancar. Una ruta absoluta por sí sola no crea un
volumen persistente: hay que adjuntarlo en el proveedor. Usa **una sola instancia**.
Sin volumen, los archivos pueden perderse al reiniciar o desplegar.

### Variables y arranque

Para esta alternativa, adapta `DATABASE_URL` y usa el Dockerfile SQLite;
no subas el `.env` local. Define `SHOPIFY_APP_URL` con el origen HTTPS estable
asignado por Render o Railway, `SHOPIFY_API_KEY` y `SHOPIFY_API_SECRET` de la misma
app, `SCOPES` igual a los permisos configurados, y `DATABASE_URL=file:/data/dev.sqlite`.
Mantén `SHOPIFY_BILLING_MODE=managed` y `SHOPIFY_BILLING_TEST=false`. El proceso
rechaza una URL vacía, HTTP o un quick tunnel de trycloudflare.com en producción.
Las credenciales de la plataforma tienen prioridad sobre cualquier archivo local.

La imagen Docker genera Prisma y compila con dependencias de build; la etapa
final conserva las dependencias de producción, Prisma CLI, migraciones, scripts
y build. Excluye `.env`, metadatos del CLI y archivos SQLite del contexto Docker.
El contenedor ejecuta directamente `node scripts/start-production.mjs`, el mismo
script de `npm start`, para recibir y propagar las señales de apagado.
`npm run docker-start` es un alias de `npm start`.

### Render

1. Crea un Web Service con runtime Docker desde la carpeta que contiene el
   Dockerfile. Puedes usar `render.yaml`, que declara una instancia, disco de
   1 GB en `/data`, plan Starter y comprobación `/health`. El disco requiere un
   servicio de pago; no se ha contratado desde esta sesión.
2. Completa las variables secretas y el dominio HTTPS asignado al servicio.
   Si la URL todavía no aparece al crear el servicio, introdúcela desde Environment
   en cuanto Render la asigne y vuelve a desplegar.
3. Deja el comando predeterminado del Dockerfile (equivalente a `npm start`). No pongas las migraciones
   en pre-deploy: el disco solo está disponible en el proceso de ejecución.

### Railway

1. Importa el proyecto con su Dockerfile y `railway.json`; se define una sola
   réplica y healthcheck `/health`; se conserva el arranque del Dockerfile.
2. **Adjunta manualmente un volumen en /data**. `railway.json` no lo crea.
3. Genera el dominio público desde Networking y pon su origen HTTPS en
   `SHOPIFY_APP_URL`. Añade el resto de variables de la plantilla y despliega.
   Respeta el `PORT` que Railway inyecta; no actives suspensión/serverless para
   esta app, que debe recibir webhooks aunque el comerciante no esté conectado.

### Migrar la base actual sin incluirla en la imagen

No basta con generar tablas: hay que importar la base local para conservar
filtros y sesiones. La base contiene tokens de Shopify; transfiérela por un canal
privado y conserva una copia segura fuera de Git.

1. Pausa las modificaciones locales durante la migración y crea una carpeta
   `backups`. Ejecuta:

   `npm run db:backup -- backups/dev-backup.sqlite`

   El script usa `VACUUM INTO` para generar un snapshot consistente, incluyendo
   los datos confirmados que estén en WAL. No sobrescribe una copia existente.
   No se ha copiado ni publicado la base real como parte de esta preparación.
2. Levanta el servicio con su volumen, todavía **sin cambiar las URLs de Partners**.
   El primer arranque puede crear una base vacía con sus tablas. Sube la copia
   como `/data/import.sqlite`, nunca directamente sobre un archivo abierto:
   en Render usa SSH/SCP según su panel; en Railway selecciona explícitamente
   el proyecto/servicio/volumen y usa `railway volume files upload` para cargar
   `backups/dev-backup.sqlite` como `/import.sqlite` dentro del volumen.
3. En la Shell del servicio, sin tráfico comercial, usa el SQLite CLI incluido
   en la imagen para comprobar e importar mediante su API de backup:

   `sqlite3 /data/import.sqlite "PRAGMA integrity_check;"`

   `sqlite3 /data/dev.sqlite ".backup '/data/before-import.sqlite'"`

   `sqlite3 /data/dev.sqlite ".restore '/data/import.sqlite'"`

   La comprobación debe devolver `ok`. Si SQLite informa `busy`, detén la operación
   y repítela en una ventana sin escrituras; conserva las copias originales.
   No reemplaces la base con `cp` mientras haya conexiones abiertas.
4. Reinicia el servicio para cerrar conexiones antiguas y volver a aplicar las
   migraciones pendientes. Comprueba `/health` (200), `/privacy` y `/tos`;
   verifica los datos importados sin mostrar tokens, por ejemplo el número de
   filas de `FilterSet`. Reinicia otra vez y confirma que el recuento permanece.
5. Configura backups periódicos del volumen y snapshots SQLite con una política
   de retención; no guardes la única copia en el mismo disco.

### Cambiar las URLs solo después de verificar el servicio

Cuando el dominio estable, la importación y la persistencia estén comprobados,
actualiza la configuración de producción de Shopify: `application_url` al origen
estable y `auth.redirect_urls` a ese origen más `/auth/callback`. En una configuración
TOML separada de producción, usa `automatically_update_urls_on_dev=false` para que
una sesión local no cambie esa URL. Webhooks y proxy siguen utilizando sus rutas
relativas. Después se publica la configuración con el flujo autorizado del CLI.
Los enlaces de privacidad y términos se cambian en la ficha de Partners cuando
sus documentos definitivos estén listos; las rutas actuales siguen siendo borradores.

Fuentes: [discos Render](https://render.com/docs/disks),
[volúmenes Railway](https://docs.railway.com/volumes),
[SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html)
y [variables de Prisma 6](https://www.prisma.io/docs/orm/v6/more/dev-environment/environment-variables).

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
