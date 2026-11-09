# Despliegue aislado con PostgreSQL

Este despliegue conserva el entorno local SQLite y utiliza un cliente Prisma y
un historial de migraciones propios para PostgreSQL. Los archivos se prepararon
y validaron sin conectar una base de datos. La base de producción existente y su
historial todavía deben revisarse antes de activar este despliegue.

## Archivos y separación de entornos

- `prisma/schema.prisma` y `prisma/migrations/`: desarrollo y pruebas con SQLite.
- `prisma/postgresql/schema.prisma`: mismos modelos, proveedor PostgreSQL.
- `prisma/postgresql/migrations/00000000000000_initial_postgresql`: baseline de
  los modelos anteriores a analíticas.
- `prisma/postgresql/migrations/20261107150000_premium_analytics`: incorporación
  aditiva de `AnalyticsDaily` y `AnalyticsReceipt`.
- `prisma/postgresql/migrations/20261108120000_filter_usage`: contadores de uso
  atribuidos a cada filtro, sin reconstruir estadísticas históricas inexistentes.
- `Dockerfile.postgresql`: genera el cliente PostgreSQL dentro de la imagen.
- `scripts/start-postgresql.mjs`: valida la configuración, comprueba el proveedor
  del cliente generado, aplica exclusivamente el historial PostgreSQL y arranca
  React Router si las migraciones terminan correctamente.
- `scripts/inspect-postgresql.mjs`: compara metadatos del destino con las
  migraciones revisadas, en una transacción de solo lectura.

La imagen usa su propio `Dockerfile.postgresql.dockerignore` para excluir
credenciales, `.env`, bases SQLite, copias de seguridad y artefactos locales.
El arranque no crea archivos SQLite ni carga un `.env`.

No ejecutes `prisma generate --schema prisma/postgresql/schema.prisma` en el
entorno local compartido: el cliente estándar de `@prisma/client` se sustituiría
por el de PostgreSQL y las pruebas SQLite dejarían de usar el proveedor correcto.
La generación PostgreSQL debe ocurrir en el contenedor o en un entorno de build
aislado. `npm run setup` y el arranque SQLite anterior no son los comandos de este
despliegue.

## Revisión previa de una base PostgreSQL existente

Antes de desplegar sobre una base que ya contiene datos:

1. Obtén una copia de seguridad recuperable y confirma la base y el servicio de
   destino sin compartir credenciales en el repositorio o el chat.
2. Inspecciona su esquema e historial `_prisma_migrations` mediante acceso de
   solo lectura autorizado. No supongas que el historial SQLite del repositorio
   describe la PostgreSQL existente.
3. Compara las tablas, columnas, tipos, valores predeterminados, índices y claves
   foráneas con el SQL del baseline PostgreSQL. Revisa también cualquier tabla
   analítica que ya exista. Una comparación debe detectar diferencias reales;
   omitir errores con `IF NOT EXISTS` no demuestra equivalencia.
4. Si el esquema y su historial coinciden con estas migraciones, el responsable
   puede autorizar `migrate deploy` con este esquema. Si la estructura base existe
   pero todavía no tiene este baseline registrado, hay que preparar y revisar
   expresamente su adopción antes del primer arranque. Si difiere, prepara una
   migración de reconciliación específica, sin destruir los datos.

No se realiza un baseline automático ni se proporciona un `migrate resolve`
incondicional. No uses `migrate reset`, `db push --force-reset` ni borres el
historial para ocultar diferencias. Una migración fallida también requiere
inspeccionar qué se aplicó antes de registrar una resolución manual.

El servidor no arranca si `migrate deploy` falla. Las migraciones de esta
carpeta utilizan transacciones y no incluyen eliminación de tablas o datos.
Esto no sustituye la revisión del destino y sus copias de seguridad.

### Ejecutar la inspección de metadatos

Usa una Shell o un trabajo controlado de Render que tenga esta revisión del
repositorio y sus dependencias instaladas. Mantén la `DATABASE_URL` real en el
entorno seguro de Render; no la pases como argumento, no la pegues en el chat ni
la copies al repositorio. No cambies todavía el comando de arranque del servicio
activo por el migrador de PostgreSQL.

Ejecuta únicamente:

```sh
node scripts/inspect-postgresql.mjs
```

El inspector genera un cliente Prisma separado bajo
`artifacts/postgresql-inspection/`, lo elimina al terminar y conserva el cliente
normal del proyecto. La carpeta del proyecto debe permitir escribir esos
artefactos temporales. El generador trabaja con una URL ficticia y no recibe las
credenciales reales. El inspector no carga `.env`.

Antes de consultar metadatos, abre una transacción `REPEATABLE READ` y ejecuta
`SET TRANSACTION READ ONLY`. Solo consulta `pg_catalog` y seis columnas técnicas
de `_prisma_migrations`; no lee filas de tiendas, sesiones, clientes ni artículos.
El informe JSON omite credenciales, URL de conexión y valores de defaults que
puedan contener información privada.

La comparación verifica tipos, nulabilidad, defaults, índices y claves foráneas
compuestas, además de sus nombres. Las tablas analíticas ausentes se identifican
como migraciones pendientes; si existen sin su historial o difieren del contrato,
requieren revisión. Una estructura básica equivalente sin baseline registrado
también requiere revisión manual.

| Código de salida | Significado                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`              | Los metadatos comparados coinciden y el historial reconocido no presenta incidencias. Sigue siendo una inspección, no una autorización para desplegar. |
| `2`              | Hay diferencias, falta un baseline registrado o el historial necesita revisión. Detén el despliegue y revisa el informe.                               |
| `1`              | La inspección no pudo terminar; revisa permisos de conexión, configuración y disponibilidad del runtime.                                               |

No ejecutes comandos de resolución basándote únicamente en el código de salida.
Si Render permite ejecutar una comprobación previa con la imagen nueva, este
comando puede utilizarse como puerta de revisión antes del arranque migrador.
En ningún caso debe sustituirse por `start-postgresql.mjs` para inspeccionar: ese
otro script sí intenta aplicar migraciones.

## Base PostgreSQL nueva y vacía

Una base nueva y vacía puede aplicar el baseline y después las migraciones analíticas
con el historial incluido. Al iniciar la imagen, el script ejecuta:

```sh
node node_modules/prisma/build/index.js migrate deploy --schema prisma/postgresql/schema.prisma
```

El script no genera un cliente en producción ni decide por sí mismo que una base
existente equivale al baseline.

## Configuración del servicio en Render

Después de revisar la base de destino, configura un servicio Docker con la raíz
del repositorio como contexto y `Dockerfile.postgresql` como Dockerfile. No uses
el `Dockerfile`, `render.yaml` ni el arranque SQLite anterior para este servicio.
El `CMD` de la nueva imagen ejecuta `node scripts/start-postgresql.mjs`.

Define las variables desde el panel seguro del proveedor:

| Variable                           | Valor esperado                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `SHOPIFY_APP_URL`                  | Origen HTTPS estable de la aplicación, sin ruta; por ejemplo el origen asignado al servicio Render.                              |
| `SHOPIFY_API_KEY`                  | Clave de la misma app de Shopify que utiliza la tienda.                                                                          |
| `SHOPIFY_API_SECRET`               | Secreto de esa app, almacenado como secreto del proveedor.                                                                       |
| `DATABASE_URL`                     | Conexión PostgreSQL proporcionada por el servidor, con el TLS que requiera el proveedor. Admite `postgresql://` o `postgres://`. |
| `SHOPIFY_APP_HANDLE`               | Handle de la página de planes de la app.                                                                                         |
| `SHOPIFY_BILLING_MODE`             | `managed`.                                                                                                                       |
| `SHOPIFY_BILLING_TEST`             | `false` para cobros reales; usa únicamente el modo de pruebas autorizado para una tienda de desarrollo.                          |
| `SHOPIFY_PARTNER_ID`               | ID numérico del Partner Dashboard propietario de la app; no es el ID de organización del Dev Dashboard.                          |
| `SHOPIFY_PARTNER_API_ACCESS_TOKEN` | Token de un cliente Partner API con permiso **Manage apps**, configurado como secreto únicamente en Render.                      |
| `SCOPES`                           | Permisos de la app configurados en Shopify.                                                                                      |
| `HOST`                             | `0.0.0.0`, predeterminado en la imagen.                                                                                          |
| `PORT`                             | Puerto asignado por Render; predeterminado 3000.                                                                                 |

La verificación de Shopify App Pricing en producción utiliza Partner API. La
`SHOPIFY_API_KEY` debe corresponder a la misma app que posee ese Partner. No
necesitas configurar `SHOPIFY_APP_GID` ni un ID de organización; la app verifica
su identidad desde el contexto autenticado. En desarrollo o pruebas, el modo
Partner se activa expresamente mediante `SHOPIFY_BILLING_VERIFICATION=partner`.

Para automatizar Render desde el equipo de desarrollo, sus credenciales
`RENDER_API_KEY` y `RENDER_SERVICE_ID` pueden mantenerse en el archivo local
ignorado `.env.deploy.local`. Son distintas de los secretos Partner del servicio
y no deben incluirse en Git. El inspector de PostgreSQL no necesita ni lee ese
archivo: usa solamente la conexión ya existente en el entorno de Render.

La URL ficticia de build de `Dockerfile.postgresql` solo permite generar Prisma;
no se consulta ni se copia como conexión de ejecución. La conexión real se
inyecta al arrancar. PostgreSQL se mantiene en su servicio de base de datos, sin
requerir el volumen SQLite `/data`.

Tras un despliegue autorizado, confirma que las migraciones terminaron, que el
servicio responde y que la tienda autenticada puede leer sus datos. Actualiza
las URLs de Shopify únicamente después de estas comprobaciones.

## Comprobaciones locales sin base de datos

```sh
node --test tests/postgresql-deployment.test.mjs tests/postgresql-inspection.test.mjs
```

Estas pruebas verifican la paridad de modelos, la separación de las migraciones,
la validación de variables y la inspección con metadatos simulados. No leen `.env`,
no generan clientes y no abren conexiones de base de datos. Deben seguir pasando
cuando cambien los modelos canónicos.
