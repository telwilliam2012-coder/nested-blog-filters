# Transferencia privada de configuraciones

La herramienta `scripts/configuration-transfer.ts` permite conservar conjuntos,
filtros, opciones y sus condiciones entre SQLite y PostgreSQL. No expone una ruta
pública ni utiliza el SDK o las APIs de Shopify. `npm run build` genera el CLI
privado `build/ops/configuration-transfer.mjs` junto al diagnóstico de planes.

## Respaldo del servicio que está funcionando

Un archivo SQLite local no demuestra que contenga la configuración actual de
Render. Antes de cambiar el contenedor, exporta desde la aplicación autenticada
que todavía funciona en Render mediante el exportador privado de navegador
`scripts/export-live-configuration.browser.js`. Ese exportador utiliza los loaders
existentes, comprueba la tienda de cada conjunto y exige una lista completa. No
necesita copiar el archivo SQLite del contenedor ni añade endpoints.

Si dispones de acceso privado al archivo real de la base, el CLI también admite
`export`: lee únicamente la configuración de la tienda indicada en una transacción
de solo lectura. `DATABASE_URL` debe estar ya definida en el entorno seguro y el
cliente Prisma generado debe corresponder al proveedor. Para SQLite utiliza una
ruta absoluta existente; nunca se crea automáticamente una base de origen vacía.

```sh
node build/ops/configuration-transfer.mjs export --shop tienda.myshopify.com --output backups/configuration.json
```

El archivo se crea sin sobrescribir uno existente. Su contenido es información
comercial privada: consérvalo fuera de Git y del chat. No contiene sesiones,
tokens OAuth, clientes, artículos, recibos ni estadísticas.

## Validar antes de restaurar

```sh
node build/ops/configuration-transfer.mjs validate --shop tienda.myshopify.com --input backups/configuration.json
```

La validación es completamente local y no inicializa Prisma. Comprueba el formato
versionado, la tienda, la lista completa de conjuntos, IDs únicos, jerarquías,
valores, fechas disponibles y un checksum SHA256 determinista. El hash cubre
`version`, `shop` y `filterSets` con claves de objetos ordenadas y conjuntos por ID;
filtros y opciones se ordenan por posición e ID. Los valores comerciales y los IDs
se conservan exactamente. El checksum detecta cambios; no es una firma ni prueba
por sí mismo que el archivo provenga del servicio correcto.

## Restauración en PostgreSQL

Genera el cliente PostgreSQL únicamente en la imagen o en un entorno aislado. No
sustituyas el cliente SQLite local del proyecto. Mantén la conexión real en
`DATABASE_URL`; no se aceptan URLs ni credenciales como argumentos del CLI.

```sh
node build/ops/configuration-transfer.mjs import --shop tienda.myshopify.com --input backups/configuration.json
```

Sin `--apply`, `import` solo valida el archivo. Su respuesta indica
`destinationChecked: false`: no comprueba la conexión ni los conflictos del
destino. Para aplicar un respaldo ya revisado, proporciona el checksum obtenido
en la validación:

```sh
node build/ops/configuration-transfer.mjs import --shop tienda.myshopify.com --input backups/configuration.json --apply --checksum CHECKSUM_REVISADO
```

La aplicación exige PostgreSQL, valida todo antes de abrir la transacción y se
detiene si ya existe cualquier conjunto para esa tienda. Crea todos los registros
en una sola transacción, conservando IDs, revisión, posiciones, valores y fechas
cuando están disponibles. Una colisión global de IDs o cualquier error revierte
la operación completa; no borra ni sobrescribe registros. Tampoco copia sesiones:
el comerciante debe abrir de nuevo la aplicación para autenticarse normalmente.

Para una ejecución controlada desde otro entorno con un cliente PostgreSQL
aislado, la función exportada `importConfiguration(client, snapshot, shop,
expectedChecksum)` recibe ese cliente explícitamente. No crea otro cliente ni
carga credenciales. Las pruebas usan exclusivamente bases SQLite temporales para
verificar relaciones, rechazos y rollback; no acreditan una importación real.

## Artículos y asignaciones

El índice local de artículos no se incluye. En la Fase 4, la edición de atributos
escribe primero `metafieldsSet` en Shopify y la edición de etiquetas utiliza
`tagsAdd`/`tagsRemove`, después relee Shopify y actualiza el índice local. Conservando
las claves y valores de los filtros, una sincronización completa de cada blog
restaura esas asignaciones desde Shopify después de importar la configuración.

No puede garantizarse lo mismo para asignaciones históricas creadas directamente
en SQLite durante la Fase 2 o mediante SQL/manuales. Si existen o el responsable
indica que se utilizaron, **detén el cambio de contenedor** y prepara un respaldo
adicional de esas relaciones antes de continuar. Un export de configuración no
es un respaldo completo de la base y no demuestra que esas asignaciones estén en
Shopify. No inventes relaciones ni reemplaces automáticamente datos históricos.

Antes de activar tráfico, autentica la tienda, verifica su plan real, completa la
sincronización y comprueba artículos/filtros en el storefront. La validación local
del JSON no sustituye estas comprobaciones.
