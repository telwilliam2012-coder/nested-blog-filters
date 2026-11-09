/* eslint-env node */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertPostgresqlClient,
  postgresqlProductionSettings,
} from "../scripts/start-postgresql.mjs";

const read = (filename) =>
  readFileSync(new URL(`../${filename}`, import.meta.url), "utf8").replaceAll(
    "\r\n",
    "\n",
  );
const fixture = {
  SHOPIFY_APP_URL: "https://production-fixture.onrender.com/",
  SHOPIFY_API_KEY: "fixture-key",
  SHOPIFY_API_SECRET: "fixture-secret",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/fixture",
};

test("PostgreSQL and SQLite schemas have exactly the same model definitions", () => {
  const canonical = read("prisma/schema.prisma");
  const postgres = read("prisma/postgresql/schema.prisma");
  assert.equal(
    postgres,
    canonical.replace(
      /(datasource db\s*\{\s*provider\s*=\s*)"sqlite"/,
      '$1"postgresql"',
    ),
  );
  assertPostgresqlClient(postgres);
  assert.throws(
    () => assertPostgresqlClient(canonical),
    /not built for PostgreSQL/,
  );
});

test("the PostgreSQL baseline predates analytics and the next migration is additive", () => {
  const initial = read(
    "prisma/postgresql/migrations/00000000000000_initial_postgresql/migration.sql",
  );
  const analytics = read(
    "prisma/postgresql/migrations/20261107150000_premium_analytics/migration.sql",
  );
  assert.ok(initial.includes('CREATE TABLE "FilterSet"'));
  assert.ok(initial.includes('CREATE TABLE "Session"'));
  assert.ok(!initial.includes('CREATE TABLE "Analytics'));
  assert.equal((analytics.match(/CREATE TABLE/g) || []).length, 2);
  assert.ok(analytics.includes('CREATE TABLE "AnalyticsDaily"'));
  assert.ok(analytics.includes('CREATE TABLE "AnalyticsReceipt"'));
  assert.ok(
    !/DROP TABLE|DROP COLUMN|DELETE FROM|TRUNCATE|PRAGMA|DATETIME/i.test(
      initial + analytics,
    ),
  );
  assert.match(
    read("prisma/postgresql/migrations/migration_lock.toml"),
    /provider = "postgresql"/,
  );
});

test("PostgreSQL startup validates configuration without reading files or contacting a DB", () => {
  const config = postgresqlProductionSettings(fixture);
  assert.equal(config.appUrl, "https://production-fixture.onrender.com");
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, "3000");
  assert.equal(
    postgresqlProductionSettings({
      ...fixture,
      DATABASE_URL: "postgres://fixture:fixture@127.0.0.1:5432/fixture",
    }).databaseUrl.startsWith("postgres:"),
    true,
  );
  for (const key of [
    "SHOPIFY_APP_URL",
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "DATABASE_URL",
  ])
    assert.throws(
      () => postgresqlProductionSettings({ ...fixture, [key]: "" }),
      new RegExp(key),
    );
  for (const database of [
    "file:/data/dev.sqlite",
    "https://database.invalid/fixture",
    "postgresql://localhost",
    "invalid",
  ])
    assert.throws(
      () =>
        postgresqlProductionSettings({ ...fixture, DATABASE_URL: database }),
      /DATABASE_URL/,
    );
  for (const url of [
    "http://production-fixture.onrender.com",
    "https://fixture.trycloudflare.com",
    "https://production-fixture.onrender.com/app",
  ])
    assert.throws(
      () => postgresqlProductionSettings({ ...fixture, SHOPIFY_APP_URL: url }),
      /SHOPIFY_APP_URL/,
    );
  for (const port of ["0", "65536", "not-a-port"])
    assert.throws(
      () => postgresqlProductionSettings({ ...fixture, PORT: port }),
      /PORT/,
    );
});
