/* eslint-env node */
import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  comparePostgresqlMetadata,
  inspectionSettings,
  inspectPostgresqlWorker,
  parseMigrationContract,
  readInspectionContract,
  readPostgresqlMetadata,
  redactedInspectionFailure,
} from "../scripts/inspect-postgresql.mjs";

let contract;
before(async () => {
  contract = await readInspectionContract();
});

function metadataFixture(includeFeatures = false) {
  const names = includeFeatures
    ? Object.keys(contract.tables)
    : contract.coreTables;
  const metadata = {
    tables: [{ table_name: "_prisma_migrations", table_kind: "r" }],
    columns: [],
    indexes: [],
    foreignKeys: [],
    extraConstraints: [],
    migrations: [],
    hasHistory: true,
  };
  const action = {
    CASCADE: "c",
    RESTRICT: "r",
    "NO ACTION": "a",
    "SET NULL": "n",
    "SET DEFAULT": "d",
  };
  for (const name of names) {
    metadata.tables.push({ table_name: name, table_kind: "r" });
    for (const [column, value] of Object.entries(contract.tables[name].columns))
      metadata.columns.push({
        table_name: name,
        column_name: column,
        data_type: value.type,
        nullable: value.nullable,
        column_default: value.default,
        identity_kind: "",
        generated_kind: "",
      });
    for (const [index, value] of Object.entries(contract.tables[name].indexes))
      metadata.indexes.push({
        table_name: name,
        index_name: index,
        columns: value.columns,
        is_unique: value.unique,
        is_primary: value.primary,
        is_valid: true,
        is_ready: true,
        has_predicate: false,
        has_expressions: false,
        attribute_count: value.columns.length,
        key_count: value.columns.length,
        key_options: value.columns.map(() => "0").join(" "),
        method: "btree",
        default_operator_classes: true,
        default_collations: true,
      });
    for (const [key, value] of Object.entries(
      contract.tables[name].foreignKeys,
    ))
      metadata.foreignKeys.push({
        table_name: name,
        constraint_name: key,
        columns: value.columns,
        referenced_table: value.table,
        referenced_columns: value.references,
        referenced_schema: "public",
        on_delete: action[value.onDelete],
        on_update: action[value.onUpdate],
        is_deferrable: false,
        is_deferred: false,
        is_validated: true,
      });
  }
  for (const migration of includeFeatures
    ? contract.migrations
    : [contract.migrations[0]])
    metadata.migrations.push({
      migration_name: migration.name,
      checksum: migration.checksums[0],
      started_at: "2026-11-01T00:00:00.000Z",
      finished_at: "2026-11-01T00:01:00.000Z",
      rolled_back_at: null,
      applied_steps_count: 1,
    });
  return metadata;
}

test("inspection contract preserves PostgreSQL types, defaults, composite keys and all migrations", () => {
  assert.equal(contract.coreTables.length, 7);
  assert.deepEqual(contract.tables.Session.columns.expires, {
    type: "timestamp(3) without time zone",
    nullable: true,
    default: null,
  });
  assert.deepEqual(contract.tables.Session.columns.isOnline, {
    type: "boolean",
    nullable: false,
    default: "false",
  });
  assert.deepEqual(
    contract.tables.FilterOption.foreignKeys
      .FilterOption_filterId_filterSetId_fkey.columns,
    ["filterId", "filterSetId"],
  );
  assert.equal(
    contract.tables.FilterSet.indexes.FilterSet_shop_blogId_key.unique,
    true,
  );
  assert.ok(contract.tables.FilterUsageDaily);
  assert.throws(
    () => parseMigrationContract('DROP TABLE "Session";'),
    /UNSUPPORTED_MIGRATION_CONTRACT/,
  );
});

test("matching recorded baseline leaves additive migrations pending without auto-approving deployment", () => {
  const report = comparePostgresqlMetadata(
    contract,
    metadataFixture(),
    "public",
  );
  assert.equal(report.exitCode, 0);
  assert.equal(report.schemaMatchesContract, true);
  assert.equal(report.baselineRecorded, true);
  assert.equal(report.automaticBaselineAllowed, false);
  assert.equal(report.approvalRequiredBeforeDeployment, true);
  assert.ok(
    report.pendingMigrations.includes("20261107150000_premium_analytics"),
  );
  assert.ok(report.pendingMigrations.includes("20261108120000_filter_usage"));
});

test("existing tables without a recorded baseline require manual review and exit nonzero", () => {
  const metadata = metadataFixture();
  metadata.migrations = [];
  metadata.hasHistory = false;
  const report = comparePostgresqlMetadata(contract, metadata, "public");
  assert.equal(report.schemaMatchesContract, true);
  assert.equal(report.exitCode, 2);
  assert.ok(report.reviewReasons.includes("BASELINE_NOT_RECORDED"));
});

test("schema differences detect types, nullable/default changes, index details and foreign keys", () => {
  for (const [kind, mutate] of [
    [
      "COLUMN_TYPE",
      (m) => {
        m.columns[0].data_type = "character varying(255)";
      },
    ],
    [
      "COLUMN_NULLABILITY",
      (m) => {
        m.columns[0].nullable = !m.columns[0].nullable;
      },
    ],
    [
      "COLUMN_DEFAULT",
      (m) => {
        m.columns[0].column_default = "'private-secret'::text";
      },
    ],
    [
      "INDEX_DEFINITION",
      (m) => {
        m.indexes[0].is_unique = false;
      },
    ],
    [
      "INDEX_DEFINITION",
      (m) => {
        m.indexes[0].default_collations = false;
      },
    ],
    [
      "INDEX_DEFINITION",
      (m) => {
        m.indexes[0].default_operator_classes = false;
      },
    ],
    [
      "FOREIGN_KEY_DEFINITION",
      (m) => {
        m.foreignKeys[0].on_delete = "a";
      },
    ],
  ]) {
    const metadata = metadataFixture();
    mutate(metadata);
    const report = comparePostgresqlMetadata(contract, metadata, "public");
    assert.equal(report.exitCode, 2);
    assert.ok(
      report.differences.some((difference) => difference.kind === kind),
      kind,
    );
    assert.ok(!JSON.stringify(report).includes("private-secret"));
  }
});

test("failed history, checksum differences and pre-existing analytics are reviewable metadata", () => {
  const metadata = metadataFixture(true);
  metadata.migrations[0].checksum = "0".repeat(64);
  metadata.migrations[1].finished_at = null;
  const report = comparePostgresqlMetadata(contract, metadata, "public");
  assert.equal(report.exitCode, 2);
  assert.ok(report.reviewReasons.includes("UNRESOLVED_MIGRATION_FAILURE"));
  assert.ok(
    report.reviewReasons.some((reason) =>
      reason.startsWith("MIGRATION_CHECKSUM_MISMATCH:"),
    ),
  );
  assert.ok(
    report.reviewReasons.some((reason) =>
      reason.startsWith("EXISTING_TABLES_WITHOUT_MIGRATION:"),
    ),
  );
  assert.ok(
    report.migrations.every((migration) => !Object.hasOwn(migration, "logs")),
  );
});

test("metadata inspection starts READ ONLY and never selects private application rows", async () => {
  const metadata = metadataFixture();
  const statements = [];
  const responses = {
    tables: metadata.tables,
    columns: metadata.columns,
    indexes: metadata.indexes,
    "foreign-keys": metadata.foreignKeys,
    "extra-constraints": [],
    migrations: metadata.migrations,
  };
  const client = {
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, "RepeatableRead");
      return callback({
        async $executeRawUnsafe(sql) {
          assert.ok(
            sql === "SET TRANSACTION READ ONLY" ||
              sql === "SET LOCAL statement_timeout = '10000ms'",
          );
          statements.push(sql);
        },
        async $queryRawUnsafe(sql) {
          assert.equal(statements[0], "SET TRANSACTION READ ONLY");
          assert.ok(
            !/\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i.test(
              sql,
            ),
          );
          assert.ok(!/SELECT\s+\*/i.test(sql));
          const kind = sql.match(/nbf-inspect:([a-z-]+)/)?.[1];
          assert.ok(Object.hasOwn(responses, kind));
          statements.push(sql);
          return responses[kind];
        },
      });
    },
  };
  const result = await readPostgresqlMetadata(
    client,
    "public",
    Object.keys(contract.tables),
  );
  assert.equal(result.hasHistory, true);
  assert.equal(result.migrations.length, 1);
  assert.equal(statements.length, 8);
});

test("configuration and failures never disclose credentials or database connection strings", () => {
  assert.equal(
    inspectionSettings({
      DATABASE_URL: "postgresql://fixture:secret@127.0.0.1:5432/fixture",
    }).schema,
    "public",
  );
  for (const url of [
    undefined,
    "file:dev.sqlite",
    "https://fixture.invalid/db",
    "postgresql://localhost",
  ])
    assert.throws(
      () => inspectionSettings({ DATABASE_URL: url }),
      /INVALID_DATABASE_URL/,
    );
  const report = redactedInspectionFailure(
    Object.assign(new Error("postgresql://fixture:secret@private/db"), {
      inspectionCode: "secret",
    }),
  );
  assert.equal(report.error, "POSTGRESQL_INSPECTION_FAILED");
  assert.ok(!JSON.stringify(report).includes("secret"));
  assert.ok(!JSON.stringify(report).includes("private/db"));
});

test("the metadata worker rejects an arbitrary client directory before any connection", async () => {
  await assert.rejects(
    inspectPostgresqlWorker("../../"),
    /INVALID_INSPECTION_WORKER_DIRECTORY/,
  );
  await assert.rejects(
    inspectPostgresqlWorker(undefined),
    /INVALID_INSPECTION_WORKER_DIRECTORY/,
  );
});
