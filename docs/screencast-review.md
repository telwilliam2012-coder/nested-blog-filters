# Screencast de revisión: Nested Blog Filters & Search

Duración prevista: **5 minutos y 45 segundos**. Instrucciones de grabación en
español y narración en inglés. Esta guía prepara la grabación; las funciones que
aparezcan deben haberse comprobado en la versión publicada.

## Preparación de la demostración

Antes de filmar, confirma la suscripción real de la tienda, el backend desplegado
en Render y la extensión de tema publicada. La grabación de estadísticas requiere
una suscripción Premium verificada, el bloque activo y eventos reales recibidos.
Un resultado de pruebas locales no acredita estos puntos.

Usa una tienda de demostración autorizada, con cuatro artículos publicados en un
mismo blog. Prepara el contenido antes de grabar, conservando los siguientes
nombres o sustituyéndolos de forma coherente en toda la demostración. La tabla
muestra las etiquetas finales: para demostrar un cambio masivo real, prepara
los dos artículos de Navidad sin `navidad` y añade esa etiqueta en la toma de
Artículos.

| Artículo                | Etiquetas finales de Shopify           |
| ----------------------- | -------------------------------------- |
| Christmas balloon ideas | `celebraciones`, `navidad`, `globos`   |
| Christmas table ideas   | `celebraciones`, `navidad`, `mesa`     |
| Halloween balloon ideas | `celebraciones`, `halloween`, `globos` |
| Everyday ideas          | `cotidiano`                            |

El contenido de prueba debe existir realmente en Shopify y tener fecha de
publicación vigente. Elige un blog que aún no tenga un conjunto si vas a mostrar
la creación desde cero. Cada blog admite un conjunto; conserva las configuraciones
existentes.

Para los tres filtros, usa **Shopify article tags / Etiquetas de los artículos en
Shopify** como origen:

| Etiqueta visible | Identificador estable | Opciones: etiqueta → valor                             | Condición                        |
| ---------------- | --------------------- | ------------------------------------------------------ | -------------------------------- |
| Category         | `category`            | Celebrations → `celebraciones`; Everyday → `cotidiano` | Always visible / Siempre visible |
| Occasion         | `occasion`            | Christmas → `navidad`; Halloween → `halloween`         | Category = Celebrations          |
| Design           | `design`              | Balloons → `globos`; Table → `mesa`                    | Occasion = Christmas             |

Escribe esos valores al crear las opciones y antes del primer guardado. Las
relaciones se configuran con **Show this filter after / Mostrar este filtro
después de** y sus opciones activadoras. Los guiones bajos en una etiqueta no
generan el árbol automáticamente.

Prepara tres pestañas: Shopify Admin con la app, editor del tema y blog público.
Configura **App language / Idioma de la aplicación** en English desde
Home / Inicio si quieres que la interfaz coincida con la narración. Los nombres
de contenido definidos por el comerciante conservan su propio texto.

Graba la ventana del navegador a una resolución legible, con el cursor visible y
las notificaciones cerradas. Mantén fuera del encuadre contraseñas, tokens, `.env`,
consolas de desarrollo y datos privados. La voz puede grabarse después; los
subtítulos en inglés deben corresponder a las acciones que se ven. Shopify pide
mostrar la configuración y el resultado de las funciones en inglés o con
subtítulos en inglés. [Preparación de la revisión de Shopify](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices).

## Secuencia y narración

### 00:00–00:35 · Entrada y plan

**En pantalla:** abre la app desde Shopify Admin. Muestra Home / Inicio y entra
en Plans / Planes. Si se está grabando una instalación nueva autorizada, incluye
el flujo nativo de instalación y selección del plan, con las credenciales fuera
de la captura. Al regresar a la app, muestra el plan que Shopify haya verificado.
Si necesitas más tiempo para esta primera instalación, amplía la toma manteniendo
el video completo dentro de los 3–8 minutos indicados en Partners.

**Narración:**

> This is Nested Blog Filters & Search, running inside Shopify Admin. The app
> helps merchants organize blog articles with nested filters and article search.
> Shopify manages plan selection and subscription approval. Pro includes one blog
> and up to three filters. Premium supports all store blogs, up to ten filters per
> blog, bulk editing, and usage analytics. This demonstration uses a verified
> Premium subscription.

Di la última frase solo cuando el plan mostrado sea realmente Premium. Para
demostrar el estado restringido de Pro, usa una toma de una suscripción Pro
verificada: Analytics / Estadísticas muestra el acceso a Premium. El precio de
una suscripción antigua o un parámetro de URL no demuestra el plan activo.

### 00:35–01:50 · Crear la jerarquía

**En pantalla:** Filters / Filtros → Create filter set / Crear conjunto. Selecciona
el blog y nombra el conjunto. Crea los tres filtros de la tabla, con sus opciones y
origen de etiquetas. Muestra las condiciones del segundo y tercer nivel. Pulsa
Save filter set / Guardar conjunto y espera la confirmación real.

**Narración:**

> I select the blog and create its filter set. Each filter has a visible label,
> a stable identifier, and a list of options. Here the options use Shopify article
> tags. Each saved option value matches an article tag.
>
> Category is always visible. Occasion appears when the reader selects
> Celebrations. Design appears when Christmas is selected. I define these
> relationships in the builder, then save the configuration.

### 01:50–02:35 · Sincronizar y gestionar artículos

**En pantalla:** Articles / Artículos → selecciona el conjunto → Synchronize from
Shopify / Sincronizar desde Shopify. Espera a que termine. Revisa las etiquetas de
los artículos importados. Con Premium, selecciona los dos artículos de Navidad,
elige el filtro Occasion y añade Christmas con Add options / Añadir opciones y
Save tags to Shopify / Guardar etiquetas en Shopify. Comprueba el resultado
guardado: ambos deben tener `navidad` junto a sus demás etiquetas.

**Narración:**

> I synchronize the blog to import its current articles and tags. Only published
> articles are eligible for storefront results. I can assign options to one
> article, or update several articles together with Premium. This action saves
> the selected tags to Shopify while preserving other article tags. Changes made
> outside the app should be synchronized again.

### 02:35–03:25 · Activar y personalizar el bloque

**En pantalla:** abre el editor del tema y la plantilla de blog correspondiente.
En una sección compatible, añade Apps / Aplicaciones → Blog filters / Filtros del
blog. Mantén App proxy path / Ruta del App Proxy en `/apps/nested-filters`, salvo
que la tienda tenga otra ruta configurada. Cambia General accent color / Color de
acento general y Search box background / Fondo del buscador. Muestra también
Number badges / Badges numéricos o Active selections / Selecciones activas.
Guarda el tema y comprueba que los colores respondan.

**Narración:**

> In the theme editor, I add the Blog filters app block to the blog template. The
> storefront uses the app proxy to request results. No theme code editing is
> required. I can customize the accent, search box, active selections, and number
> badges directly in the block settings. I save the theme and open the blog.

### 03:25–04:35 · Recorrido del visitante

**En pantalla:** abre el blog fuera del editor de temas. Usa los controles reales
de privacidad de la tienda para permitir analytics. Selecciona Celebrations →
Christmas → Balloons: debe quedar el artículo Christmas balloon ideas. Cambia a
Table y comprueba el artículo correspondiente. Vuelve al primer nivel y selecciona
Everyday: comprueba que se oculten los niveles dependientes. Limpia las selecciones
y busca una palabra existente en los títulos, por ejemplo `balloon`.

**Narración:**

> This is the customer experience. Selecting Celebrations reveals Occasion, and
> selecting Christmas reveals Design. The article results and available options
> update as selections change. Selecting Balloons shows the matching Christmas
> article; selecting Table shows the table article.
>
> Choosing Everyday hides the dependent filters. Readers can clear their
> selections or search for a word in the articles. The visible results follow the
> saved configuration and published content.

### 04:35–05:30 · Estadísticas de Premium

**En pantalla:** regresa a la app y abre Analytics / Estadísticas. Selecciona
Last 7 days / Últimos 7 días, el blog de prueba y Apply / Aplicar. Muestra Blog
page views / Vistas del blog, Filter interactions / Interacciones con filtros,
Submitted searches / Búsquedas enviadas, el detalle diario y Most used filters /
Filtros más utilizados. Si acabas de empezar, unos pocos conteos reales son
suficientes.

**Narración:**

> Premium analytics reports consented views of pages containing the filter block,
> filter interactions, and submitted searches. These are block page views, not
> unique visitors or all store traffic. The report supports seven, thirty, and
> ninety-day periods, with a blog selector and a daily breakdown.
>
> Most used filters ranks up to ten filters by their attributed interactions.
> Tracking starts with new events after deployment and visitor consent; past
> totals are not reconstructed into a ranking. Search text and visitor identities
> are not stored in these reports.

La vista del editor de temas no genera estadísticas. Si faltan datos, realiza
interacciones reales en el blog con Premium y consentimiento, espera su recepción
y vuelve a aplicar el informe. Conserva el estado vacío si no se reciben eventos
y resuelve la causa antes de filmar esta sección. No sustituyas los conteos por
datos sembrados, capturas de pruebas o números editados.

### 05:30–05:45 · Ayuda y cierre

**En pantalla:** Help / Ayuda → guía de inicio y una FAQ. Abre el asistente de
ayuda sin enviar un correo. Termina en el blog con los filtros funcionando.

**Narración:**

> Merchants can open Help for setup guidance, frequently asked questions, and
> Dreamers APP support. This completes the merchant setup and the reader's
> filtering and search experience.

## Publicación y entrega de la URL

Exporta una grabación legible con audio claro o subtítulos en inglés y revísala
completa. Los cortes pueden acortar esperas, manteniendo visibles las acciones,
los guardados y sus resultados reales.

Sube el archivo desde tu cuenta de YouTube. En YouTube Studio, establece la
visibilidad en **Unlisted / No listado** y guarda. Quien tenga el enlace puede
reproducirlo sin una cuenta de Google, según la
[documentación de YouTube](https://support.google.com/youtube/answer/157177?co=GENIE.Platform%3DDesktop&hl=en).

Título sugerido: **Nested Blog Filters & Search — Setup and Feature Demo**.

Abre el enlace real en una ventana sin sesión y reproduce el video completo.
Cuando funcione, pega esa URL en **Screencast URL** de Shopify Partners. La URL se
obtiene después de publicar el video; este documento no proporciona una URL de
ejemplo para ese campo.
