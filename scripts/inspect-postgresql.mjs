/* eslint-env node */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const postgresRoot = resolve(projectRoot, "prisma/postgresql");
const baselineName = "00000000000000_initial_postgresql";
const execute = promisify(execFile);

function inspectionError(code) {
  return Object.assign(new Error(code), { inspectionCode: code });
}

export function inspectionSettings(env = process.env) {
  let url;
  try {
    url = new URL(env.DATABASE_URL?.trim() || "");
  } catch {
    throw inspectionError("INVALID_DATABASE_URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1) ||
    url.hash
  )
    throw inspectionError("INVALID_DATABASE_URL");
  const schema = url.searchParams.get("schema") || "public";
  if (!schema || schema.length > 63 || /[\x00-\x1f\x7f]/.test(schema))
    throw inspectionError("INVALID_DATABASE_SCHEMA");
  return { databaseUrl: env.DATABASE_URL.trim(), schema };
}

const quotedNames = (text) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const normalizeType = (type) =>
  type
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^timestamp\((\d+)\)$/, "timestamp($1) without time zone");

function normalizeDefault(value) {
  if (value === null || value === undefined) return null;
  return String(value)
    .trim()
    .replace(/::(?:text|integer|bigint|boolean|character varying)\b/gi, "")
    .replace(/^\((.*)\)$/s, "$1")
    .replace(/^now\(\)$/i, "CURRENT_TIMESTAMP");
}

// The contract comes from the reviewed migration files, not from live row data.
// Reject unsupported DDL rather than silently ignoring a future schema change.
export function parseMigrationContract(sql) {
  const tables = {};
  const source = sql.replace(/--[^\n]*/g, "");
  for (const match of source.matchAll(
    /CREATE TABLE "([^"]+)"\s*\(([\s\S]*?)\n\);/g,
  )) {
    const table = { columns: {}, indexes: {}, foreignKeys: {} };
    for (const raw of match[2].split("\n")) {
      const line = raw.trim().replace(/,$/, "");
      if (!line) continue;
      const primary = line.match(/^CONSTRAINT "([^"]+)" PRIMARY KEY \((.+)\)$/);
      if (primary) {
        table.indexes[primary[1]] = {
          columns: quotedNames(primary[2]),
          unique: true,
          primary: true,
        };
        continue;
      }
      const column = line.match(
        /^"([^"]+)"\s+(TEXT|INTEGER|BIGINT|BOOLEAN|TIMESTAMP\(\d+\))(.*)$/,
      );
      if (!column) throw inspectionError("UNSUPPORTED_MIGRATION_CONTRACT");
      const tail = column[3].trim();
      const defaultValue = tail.match(/\bDEFAULT\s+(.+)$/)?.[1] ?? null;
      if (
        tail
          .replace(/\bNOT NULL\b/, "")
          .replace(/\bDEFAULT\s+.+$/, "")
          .trim()
      )
        throw inspectionError("UNSUPPORTED_MIGRATION_CONTRACT");
      table.columns[column[1]] = {
        type: normalizeType(column[2]),
        nullable: !/\bNOT NULL\b/.test(tail),
        default: normalizeDefault(defaultValue),
      };
    }
    tables[match[1]] = table;
  }
  for (const match of source.matchAll(
    /CREATE (UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\(([^;]+)\);/g,
  )) {
    if (!tables[match[3]])
      throw inspectionError("UNSUPPORTED_MIGRATION_CONTRACT");
    tables[match[3]].indexes[match[2]] = {
      columns: quotedNames(match[4]),
      unique: Boolean(match[1]),
      primary: false,
    };
  }
  for (const match of source.matchAll(
    /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "([^"]+)"\s*\(([^)]+)\) ON DELETE (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT) ON UPDATE (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT);/g,
  )) {
    if (!tables[match[1]])
      throw inspectionError("UNSUPPORTED_MIGRATION_CONTRACT");
    tables[match[1]].foreignKeys[match[2]] = {
      columns: quotedNames(match[3]),
      table: match[4],
      references: quotedNames(match[5]),
      onDelete: match[6],
      onUpdate: match[7],
    };
  }
  const remainder = source
    .replace(/CREATE TABLE "[^"]+"\s*\([\s\S]*?\n\);/g, "")
    .replace(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "[^"]+"\([^;]+\);/g, "")
    .replace(
      /ALTER TABLE "[^"]+" ADD CONSTRAINT "[^"]+" FOREIGN KEY \([^)]+\) REFERENCES "[^"]+"\s*\([^)]+\) ON DELETE (?:CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT) ON UPDATE (?:CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT);/g,
      "",
    )
    .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, "")
    .replace(/\b(?:BEGIN|COMMIT);/g, "")
    .trim();
  if (remainder) throw inspectionError("UNSUPPORTED_MIGRATION_CONTRACT");
  return tables;
}

export async function readInspectionContract() {
  const migrationRoot = join(postgresRoot, "migrations");
  const names = (await readdir(migrationRoot, { withFileTypes: true }))
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();
  if (names[0] !== baselineName)
    throw inspectionError("INVALID_BASELINE_CONTRACT");
  const migrations = [];
  let allSql = "";
  for (const name of names) {
    const sql = await readFile(
      join(migrationRoot, name, "migration.sql"),
      "utf8",
    );
    const normalized = sql.replaceAll("\r\n", "\n");
    migrations.push({
      name,
      tables: Object.keys(parseMigrationContract(sql)),
      checksums: [
        ...new Set(
          [sql, normalized, normalized.replaceAll("\n", "\r\n")].map((value) =>
            createHash("sha256").update(value).digest("hex"),
          ),
        ),
      ],
    });
    allSql += sql + "\n";
  }
  return {
    baselineName,
    coreTables: migrations[0].tables,
    tables: parseMigrationContract(allSql),
    migrations,
  };
}

const sqlLiteral = (value) => "'" + value.replaceAll("'", "''") + "'";
const sqlIdentifier = (value) => '"' + value.replaceAll('"', '""') + '"';

export async function readPostgresqlMetadata(client, schema, tableNames) {
  const names = tableNames.map(sqlLiteral).join(",");
  return client.$transaction(
    async (tx) => {
      // This must be the first statement in the transaction, before any SELECT.
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10000ms'");
      const tables = await tx.$queryRawUnsafe(
        `/* nbf-inspect:tables */
      SELECT c.relname::text AS table_name, c.relkind::text AS table_kind
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY c.relname`,
        schema,
      );
      const columns = await tx.$queryRawUnsafe(
        `/* nbf-inspect:columns */
      SELECT c.relname::text AS table_name, a.attname::text AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        NOT a.attnotnull AS nullable, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS column_default,
        a.attidentity::text AS identity_kind, a.attgenerated::text AS generated_kind
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE n.nspname = $1 AND c.relname IN (${names}) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum`,
        schema,
      );
      const indexes = await tx.$queryRawUnsafe(
        `/* nbf-inspect:indexes */
      SELECT t.relname::text AS table_name, x.relname::text AS index_name,
        i.indisunique AS is_unique, i.indisprimary AS is_primary, i.indisvalid AS is_valid,
        i.indisready AS is_ready, i.indnatts::integer AS attribute_count,
        i.indnkeyatts::integer AS key_count, i.indoption::text AS key_options,
        am.amname::text AS method,
        NOT EXISTS(SELECT 1 FROM unnest(i.indclass::oid[]) op(class_id)
          JOIN pg_catalog.pg_opclass oc ON oc.oid = op.class_id WHERE NOT oc.opcdefault) AS default_operator_classes,
        NOT EXISTS(SELECT 1 FROM unnest(i.indkey::smallint[], i.indcollation::oid[]) k(num, collation_id)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.num
          WHERE k.collation_id <> a.attcollation) AS default_collations,
        i.indpred IS NOT NULL AS has_predicate, i.indexprs IS NOT NULL AS has_expressions,
        ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(num, ord)
          LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.num
          ORDER BY k.ord) AS columns
      FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
      JOIN pg_catalog.pg_class x ON x.oid = i.indexrelid
      JOIN pg_catalog.pg_am am ON am.oid = x.relam
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname IN (${names}) ORDER BY t.relname, x.relname`,
        schema,
      );
      const foreignKeys = await tx.$queryRawUnsafe(
        `/* nbf-inspect:foreign-keys */
      SELECT t.relname::text AS table_name, c.conname::text AS constraint_name,
        r.relname::text AS referenced_table, rn.nspname::text AS referenced_schema,
        c.confdeltype::text AS on_delete, c.confupdtype::text AS on_update,
        c.condeferrable AS is_deferrable, c.condeferred AS is_deferred, c.convalidated AS is_validated,
        ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(num, ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.num ORDER BY k.ord) AS columns,
        ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(num, ord)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = r.oid AND a.attnum = k.num ORDER BY k.ord) AS referenced_columns
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_catalog.pg_class r ON r.oid = c.confrelid JOIN pg_catalog.pg_namespace rn ON rn.oid = r.relnamespace
      WHERE c.contype = 'f' AND n.nspname = $1 AND t.relname IN (${names})
      ORDER BY t.relname, c.conname`,
        schema,
      );
      const extraConstraints = await tx.$queryRawUnsafe(
        `/* nbf-inspect:extra-constraints */
      SELECT t.relname::text AS table_name, c.conname::text AS constraint_name, c.contype::text AS constraint_type
      FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
      WHERE c.contype IN ('c', 'x') AND n.nspname = $1 AND t.relname IN (${names})`,
        schema,
      );
      const hasHistory = tables.some(
        (table) =>
          table.table_name === "_prisma_migrations" && table.table_kind === "r",
      );
      const migrations = hasHistory
        ? await tx.$queryRawUnsafe(`/* nbf-inspect:migrations */
      SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
      FROM ${sqlIdentifier(schema)}."_prisma_migrations" ORDER BY started_at LIMIT 1001`)
        : [];
      return {
        tables,
        columns,
        indexes,
        foreignKeys,
        extraConstraints,
        migrations,
        hasHistory,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000, maxWait: 5000 },
  );
}

const actions = {
  a: "NO ACTION",
  r: "RESTRICT",
  c: "CASCADE",
  n: "SET NULL",
  d: "SET DEFAULT",
};
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function comparePostgresqlMetadata(contract, metadata, schema) {
  const differences = [];
  const present = new Map(
    metadata.tables.map((row) => [row.table_name, row.table_kind]),
  );
  const applied = metadata.migrations.filter(
    (row) => row.finished_at && !row.rolled_back_at,
  );
  const appliedNames = new Set(applied.map((row) => row.migration_name));
  const featureTables = Object.keys(contract.tables).filter(
    (name) => !contract.coreTables.includes(name),
  );
  for (const [name, expected] of Object.entries(contract.tables)) {
    const featureMigration = contract.migrations.find((migration) =>
      migration.tables.includes(name),
    );
    const required =
      contract.coreTables.includes(name) ||
      appliedNames.has(featureMigration?.name);
    if (!present.has(name)) {
      if (required) differences.push({ table: name, kind: "MISSING_TABLE" });
      continue;
    }
    if (present.get(name) !== "r")
      differences.push({ table: name, kind: "TABLE_KIND" });
    const actualColumns = new Map(
      metadata.columns
        .filter((row) => row.table_name === name)
        .map((row) => [row.column_name, row]),
    );
    for (const [column, value] of Object.entries(expected.columns)) {
      const actual = actualColumns.get(column);
      if (!actual) {
        differences.push({ table: name, column, kind: "MISSING_COLUMN" });
        continue;
      }
      if (normalizeType(actual.data_type) !== value.type)
        differences.push({ table: name, column, kind: "COLUMN_TYPE" });
      if (actual.nullable !== value.nullable)
        differences.push({ table: name, column, kind: "COLUMN_NULLABILITY" });
      if (normalizeDefault(actual.column_default) !== value.default)
        differences.push({ table: name, column, kind: "COLUMN_DEFAULT" });
      if (actual.identity_kind || actual.generated_kind)
        differences.push({ table: name, column, kind: "COLUMN_GENERATION" });
    }
    for (const column of actualColumns.keys())
      if (!expected.columns[column])
        differences.push({ table: name, column, kind: "UNEXPECTED_COLUMN" });
    const actualIndexes = new Map(
      metadata.indexes
        .filter((row) => row.table_name === name)
        .map((row) => [row.index_name, row]),
    );
    for (const [index, value] of Object.entries(expected.indexes)) {
      const actual = actualIndexes.get(index);
      if (!actual) {
        differences.push({ table: name, index, kind: "MISSING_INDEX" });
        continue;
      }
      if (
        !same(actual.columns, value.columns) ||
        actual.is_unique !== value.unique ||
        actual.is_primary !== value.primary ||
        !actual.is_valid ||
        !actual.is_ready ||
        actual.has_predicate ||
        actual.has_expressions ||
        actual.method !== "btree" ||
        !actual.default_operator_classes ||
        !actual.default_collations ||
        actual.attribute_count !== value.columns.length ||
        actual.key_count !== value.columns.length ||
        String(actual.key_options)
          .trim()
          .split(/\s+/)
          .some((option) => option !== "0")
      )
        differences.push({ table: name, index, kind: "INDEX_DEFINITION" });
    }
    for (const index of actualIndexes.keys())
      if (!expected.indexes[index])
        differences.push({ table: name, index, kind: "UNEXPECTED_INDEX" });
    const actualKeys = new Map(
      metadata.foreignKeys
        .filter((row) => row.table_name === name)
        .map((row) => [row.constraint_name, row]),
    );
    for (const [constraint, value] of Object.entries(expected.foreignKeys)) {
      const actual = actualKeys.get(constraint);
      if (!actual) {
        differences.push({
          table: name,
          constraint,
          kind: "MISSING_FOREIGN_KEY",
        });
        continue;
      }
      if (
        !same(actual.columns, value.columns) ||
        !same(actual.referenced_columns, value.references) ||
        actual.referenced_table !== value.table ||
        actual.referenced_schema !== schema ||
        actions[actual.on_delete] !== value.onDelete ||
        actions[actual.on_update] !== value.onUpdate ||
        actual.is_deferrable ||
        actual.is_deferred ||
        !actual.is_validated
      )
        differences.push({
          table: name,
          constraint,
          kind: "FOREIGN_KEY_DEFINITION",
        });
    }
    for (const constraint of actualKeys.keys())
      if (!expected.foreignKeys[constraint])
        differences.push({
          table: name,
          constraint,
          kind: "UNEXPECTED_FOREIGN_KEY",
        });
  }
  for (const constraint of metadata.extraConstraints)
    differences.push({
      table: constraint.table_name,
      constraint: constraint.constraint_name,
      kind: "EXTRA_CHECK_OR_EXCLUSION_CONSTRAINT",
    });

  const reviewReasons = [];
  const known = new Set(contract.migrations.map((migration) => migration.name));
  if (!appliedNames.has(contract.baselineName))
    reviewReasons.push("BASELINE_NOT_RECORDED");
  if (
    metadata.migrations.some((row) => !row.finished_at && !row.rolled_back_at)
  )
    reviewReasons.push("UNRESOLVED_MIGRATION_FAILURE");
  if (metadata.migrations.length > 1000)
    reviewReasons.push("MIGRATION_HISTORY_TRUNCATED");
  if (metadata.migrations.some((row) => !known.has(row.migration_name)))
    reviewReasons.push("UNRECOGNIZED_MIGRATION_HISTORY");
  for (const migration of contract.migrations) {
    if (
      applied
        .filter((row) => row.migration_name === migration.name)
        .some((row) => !migration.checksums.includes(row.checksum))
    )
      reviewReasons.push("MIGRATION_CHECKSUM_MISMATCH:" + migration.name);
    if (
      !appliedNames.has(migration.name) &&
      migration.tables.some((name) => present.has(name))
    )
      reviewReasons.push("EXISTING_TABLES_WITHOUT_MIGRATION:" + migration.name);
  }
  const matches = differences.length === 0;
  return {
    inspectionOnly: true,
    approvalRequiredBeforeDeployment: true,
    automaticBaselineAllowed: false,
    target: { provider: "postgresql", connection: "redacted", schema },
    schemaMatchesContract: matches,
    coreTablesChecked: contract.coreTables,
    optionalFeatureTables: featureTables.map((name) => ({
      name,
      present: present.has(name),
    })),
    differences: differences.slice(0, 200),
    differencesTruncated: differences.length > 200,
    reviewReasons,
    baselineRecorded: appliedNames.has(contract.baselineName),
    pendingMigrations: contract.migrations
      .filter((migration) => !appliedNames.has(migration.name))
      .map((migration) => migration.name),
    migrations: metadata.migrations.slice(0, 1000).map((row) => ({
      name: row.migration_name,
      checksum: /^[a-f0-9]{64}$/i.test(row.checksum)
        ? row.checksum
        : "invalid-checksum",
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      rolledBackAt: row.rolled_back_at,
      appliedSteps: Number(row.applied_steps_count),
    })),
    exitCode: matches && reviewReasons.length === 0 ? 0 : 2,
  };
}

export async function prepareInspectionClient() {
  const require = createRequire(import.meta.url);
  const artifactRoot = resolve(projectRoot, "artifacts/postgresql-inspection");
  await mkdir(artifactRoot, { recursive: true });
  const directory = await mkdtemp(join(artifactRoot, "inspection-"));
  const commandDirectory = await mkdtemp(join(tmpdir(), "nbf-inspection-cli-"));
  const cleanup = async () => {
    if (
      dirname(resolve(directory)) !== artifactRoot ||
      !basename(directory).startsWith("inspection-")
    )
      throw inspectionError("UNSAFE_TEMPORARY_PATH");
    await rm(directory, { recursive: true, force: true });
    if (
      dirname(commandDirectory) === tmpdir() &&
      basename(commandDirectory).startsWith("nbf-inspection-cli-")
    )
      await rm(commandDirectory, { recursive: true, force: true });
  };
  try {
    const original = await readFile(
      join(postgresRoot, "schema.prisma"),
      "utf8",
    );
    const output = join(directory, "client");
    const schema = original.replace(
      /generator client\s*\{([\s\S]*?)\}/,
      (_, settings) =>
        `generator client {${settings.replace(/^\s*output\s*=.*$/gm, "")}  output = ${JSON.stringify(output.replaceAll("\\", "/"))}\n}`,
    );
    if (schema === original || !schema.includes('provider = "postgresql"'))
      throw inspectionError("INVALID_POSTGRESQL_SCHEMA");
    const schemaFile = join(directory, "schema.prisma");
    await writeFile(schemaFile, schema, "utf8");
    // The CLI works from a clean directory; it cannot discover the project .env.
    // Real database credentials are never forwarded to the generator process.
    const generationEnv = Object.fromEntries(
      [
        "PATH",
        "Path",
        "SystemRoot",
        "WINDIR",
        "HOME",
        "USERPROFILE",
        "TEMP",
        "TMP",
      ]
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    );
    Object.assign(generationEnv, {
      DATABASE_URL:
        "postgresql://inspection:inspection@127.0.0.1:5432/inspection",
      CHECKPOINT_DISABLE: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      PRISMA_GENERATE_SKIP_AUTOINSTALL: "1",
    });
    const generation = await execute(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "generate",
        "--generator",
        "client",
        "--schema",
        schemaFile,
      ],
      {
        cwd: commandDirectory,
        env: generationEnv,
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 1024 * 1024,
      },
    );
    if (
      /Environment variables loaded from/i.test(
        generation.stdout + generation.stderr,
      )
    )
      throw inspectionError("ENVIRONMENT_FILE_DISCOVERED");
    const generated = require(join(output, "index.js"));
    if (typeof generated.PrismaClient !== "function")
      throw inspectionError("INVALID_ISOLATED_CLIENT");
    return { PrismaClient: generated.PrismaClient, directory, cleanup };
  } catch {
    await cleanup();
    throw inspectionError("INSPECTION_CLIENT_PREPARATION_FAILED");
  }
}

export function redactedInspectionFailure(error) {
  const allowed = new Set([
    "INVALID_DATABASE_URL",
    "INVALID_DATABASE_SCHEMA",
    "UNSUPPORTED_MIGRATION_CONTRACT",
    "INVALID_BASELINE_CONTRACT",
    "UNSAFE_TEMPORARY_PATH",
    "INVALID_POSTGRESQL_SCHEMA",
    "INVALID_ISOLATED_CLIENT",
    "INSPECTION_CLIENT_PREPARATION_FAILED",
    "INVALID_INSPECTION_WORKER_DIRECTORY",
    "INSPECTION_WORKER_FAILED",
    "ARGUMENTS_NOT_SUPPORTED_USE_ENVIRONMENT",
  ]);
  return {
    inspectionOnly: true,
    automaticBaselineAllowed: false,
    error: allowed.has(error?.inspectionCode)
      ? error.inspectionCode
      : "POSTGRESQL_INSPECTION_FAILED",
    message:
      "Inspection did not complete. Review connection permissions and runtime configuration without sharing credentials. No baseline or schema changes were attempted.",
    exitCode: 1,
  };
}

export async function inspectPostgresqlWorker(directory) {
  const artifactRoot = resolve(projectRoot, "artifacts/postgresql-inspection");
  if (
    !directory ||
    dirname(resolve(directory)) !== artifactRoot ||
    !basename(directory).startsWith("inspection-")
  )
    throw inspectionError("INVALID_INSPECTION_WORKER_DIRECTORY");
  const config = inspectionSettings();
  const contract = await readInspectionContract();
  const require = createRequire(import.meta.url);
  const { PrismaClient } = require(join(directory, "client/index.js"));
  let client;
  try {
    client = new PrismaClient({
      datasourceUrl: config.databaseUrl,
      errorFormat: "minimal",
      log: [],
    });
    const metadata = await readPostgresqlMetadata(
      client,
      config.schema,
      Object.keys(contract.tables),
    );
    return comparePostgresqlMetadata(contract, metadata, config.schema);
  } finally {
    await client?.$disconnect();
  }
}

export async function inspectPostgresql() {
  const config = inspectionSettings();
  await readInspectionContract();
  const isolated = await prepareInspectionClient();
  try {
    const workerEnv = Object.fromEntries(
      [
        "PATH",
        "Path",
        "SystemRoot",
        "WINDIR",
        "HOME",
        "USERPROFILE",
        "TEMP",
        "TMP",
      ]
        .filter((name) => process.env[name] !== undefined)
        .map((name) => [name, process.env[name]]),
    );
    Object.assign(workerEnv, {
      DATABASE_URL: config.databaseUrl,
      NBF_POSTGRESQL_INSPECTION_DIRECTORY: isolated.directory,
    });
    let output;
    try {
      output = (
        await execute(
          process.execPath,
          [fileURLToPath(import.meta.url), "--metadata-worker"],
          {
            cwd: projectRoot,
            env: workerEnv,
            windowsHide: true,
            timeout: 90000,
            maxBuffer: 2 * 1024 * 1024,
          },
        )
      ).stdout;
    } catch (error) {
      if (
        (error.code === 1 || error.code === 2) &&
        typeof error.stdout === "string"
      )
        output = error.stdout;
      else throw inspectionError("INSPECTION_WORKER_FAILED");
    }
    let report;
    try {
      report = JSON.parse(output);
    } catch {
      throw inspectionError("INSPECTION_WORKER_FAILED");
    }
    if (
      !report.inspectionOnly ||
      report.automaticBaselineAllowed !== false ||
      ![0, 1, 2].includes(report.exitCode) ||
      output.includes(config.databaseUrl)
    )
      throw inspectionError("INSPECTION_WORKER_FAILED");
    return report;
  } finally {
    // The worker has exited, releasing native libraries before cleanup on Windows.
    await isolated.cleanup();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  let report;
  try {
    if (process.argv.length === 3 && process.argv[2] === "--metadata-worker")
      report = await inspectPostgresqlWorker(
        process.env.NBF_POSTGRESQL_INSPECTION_DIRECTORY,
      );
    else if (process.argv.length > 2)
      throw inspectionError("ARGUMENTS_NOT_SUPPORTED_USE_ENVIRONMENT");
    else report = await inspectPostgresql();
  } catch (error) {
    report = redactedInspectionFailure(error);
  }
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  process.exitCode = report.exitCode;
}
