/* eslint-env node */
import { access, open } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { loadLocalEnvironment, productionSettings } from "./runtime-config.mjs";

loadLocalEnvironment();
process.env.NODE_ENV = "production";
const require = createRequire(import.meta.url);
let activeChild;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    stopping = true;
    activeChild?.kill(signal);
  });
}
function run(args) {
  return new Promise((resolveRun, reject) => {
    activeChild = spawn(process.execPath, args, {
      stdio: "inherit",
      env: process.env,
      windowsHide: true,
    });
    activeChild.once("error", reject);
    activeChild.once("exit", (code) => resolveRun(code ?? (stopping ? 0 : 1)));
  });
}

try {
  const config = productionSettings();
  Object.assign(process.env, {
    SHOPIFY_APP_URL: config.appUrl,
    DATABASE_URL: config.databaseUrl,
    HOST: config.host,
    PORT: config.port,
  });
  await access(dirname(config.databasePath), constants.W_OK);
  // Create only an absent file; never truncate a restored database.
  try {
    const file = await open(config.databasePath, "ax", 0o600);
    await file.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  await access(resolve("build/server/index.js"), constants.R_OK);
  console.log(
    "Applying database migrations before starting the production server...",
  );
  const migrated = await run([
    require.resolve("prisma/build/index.js"),
    "migrate",
    "deploy",
  ]);
  if (migrated !== 0 || stopping) process.exitCode = migrated;
  else
    process.exitCode = await run([
      resolve(
        dirname(require.resolve("@react-router/serve/package.json")),
        "dist/cli.js",
      ),
      "build/server/index.js",
    ]);
} catch (error) {
  console.error(`Production startup failed: ${error.message}`);
  process.exitCode = 1;
}
