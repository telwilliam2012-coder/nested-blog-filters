/* eslint-env node */
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const schemaPath = resolve(projectRoot, "prisma/postgresql/schema.prisma");
const serverPath = resolve(projectRoot, "build/server/index.js");

export function postgresqlProductionSettings(env = process.env) {
  for (const name of [
    "SHOPIFY_APP_URL",
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "DATABASE_URL",
  ]) {
    if (!env[name]?.trim())
      throw new Error(`Missing production environment variable: ${name}.`);
  }

  let appUrl;
  let databaseUrl;
  try {
    appUrl = new URL(env.SHOPIFY_APP_URL.trim());
  } catch {
    // Reject malformed URLs below without including secrets in the message.
  }
  if (
    !appUrl ||
    appUrl.protocol !== "https:" ||
    appUrl.username ||
    appUrl.password ||
    appUrl.pathname !== "/" ||
    appUrl.search ||
    appUrl.hash ||
    appUrl.hostname === "trycloudflare.com" ||
    appUrl.hostname.endsWith(".trycloudflare.com")
  )
    throw new Error("SHOPIFY_APP_URL must be a stable HTTPS origin.");

  try {
    databaseUrl = new URL(env.DATABASE_URL.trim());
  } catch {
    // Never include a connection string in an error or a log.
  }
  if (
    !databaseUrl ||
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname ||
    !databaseUrl.pathname.slice(1) ||
    databaseUrl.hash
  )
    throw new Error("DATABASE_URL must identify a PostgreSQL database.");

  const port = env.PORT || "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be between 1 and 65535.");

  return {
    appUrl: appUrl.origin,
    databaseUrl: env.DATABASE_URL.trim(),
    host: env.HOST || "0.0.0.0",
    port,
  };
}

export function assertPostgresqlClient(generatedSchema) {
  if (
    !/datasource\s+\w+\s*\{[^}]*\bprovider\s*=\s*"postgresql"/.test(
      generatedSchema,
    )
  )
    throw new Error(
      "The Prisma client was not built for PostgreSQL. Generate it from prisma/postgresql/schema.prisma in the production build.",
    );
}

export async function startPostgresql() {
  const config = postgresqlProductionSettings();
  const require = createRequire(import.meta.url);
  const generatedDirectory = dirname(require.resolve(".prisma/client"));
  assertPostgresqlClient(
    await readFile(join(generatedDirectory, "schema.prisma"), "utf8"),
  );
  await access(schemaPath, constants.R_OK);
  await access(serverPath, constants.R_OK);

  const runtimeEnv = {
    ...process.env,
    NODE_ENV: "production",
    SHOPIFY_APP_URL: config.appUrl,
    DATABASE_URL: config.databaseUrl,
    HOST: config.host,
    PORT: config.port,
  };
  let activeChild;
  let stopping = false;
  const stop = (signal) => {
    stopping = true;
    activeChild?.kill(signal);
  };
  const terminate = () => stop("SIGTERM");
  const interrupt = () => stop("SIGINT");
  process.on("SIGTERM", terminate);
  process.on("SIGINT", interrupt);

  const run = (args) =>
    new Promise((resolveRun, reject) => {
      activeChild = spawn(process.execPath, args, {
        cwd: projectRoot,
        env: runtimeEnv,
        stdio: "inherit",
        windowsHide: true,
      });
      activeChild.once("error", reject);
      activeChild.once("exit", (code) =>
        resolveRun(code ?? (stopping ? 0 : 1)),
      );
    });

  try {
    console.log("Applying the PostgreSQL migration history before startup...");
    const migrated = await run([
      require.resolve("prisma/build/index.js"),
      "migrate",
      "deploy",
      "--schema",
      schemaPath,
    ]);
    if (migrated !== 0) {
      console.error(
        "PostgreSQL migrations failed; the server was not started. Review the existing database schema and baseline history. See docs/deployment-postgresql.md. No automatic baseline or reset was attempted.",
      );
      return migrated;
    }
    if (stopping) return 0;
    return await run([
      resolve(
        dirname(require.resolve("@react-router/serve/package.json")),
        "dist/cli.js",
      ),
      serverPath,
    ]);
  } finally {
    process.off("SIGTERM", terminate);
    process.off("SIGINT", interrupt);
  }
}

// Importing the validation helpers must not start a server or connect to a DB.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await startPostgresql();
  } catch (error) {
    console.error(`PostgreSQL startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
