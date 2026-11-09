/* eslint-env node */
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../build/ops/", import.meta.url));

export async function buildProductionTools(outdir = output) {
  await build({
    absWorkingDir: root,
    entryPoints: ["scripts/verify-managed-pricing.ts"],
    outdir,
    entryNames: "verify-managed-pricing",
    outExtension: { ".js": ".mjs" },
    bundle: true,
    packages: "external",
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: false,
    logLevel: "silent",
    // Configuration and secrets are read only by the deployed process.
    define: {},
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  await buildProductionTools();
