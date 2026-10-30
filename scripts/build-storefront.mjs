/* eslint-env node */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transformWithEsbuild } from "vite";

export const storefrontSource = fileURLToPath(
  new URL("../app/storefront/filters.js", import.meta.url),
);
const output = new URL(
  "../extensions/nested-blog-filters/assets/filters.js",
  import.meta.url,
);

export async function buildStorefront() {
  const source = await readFile(storefrontSource, "utf8");
  const { code } = await transformWithEsbuild(source, storefrontSource, {
    target: "es2022",
    minify: true,
    legalComments: "none",
    sourcemap: false,
  });
  if (Buffer.byteLength(code) > 10_000)
    throw new Error("El JavaScript del bloque supera los 10 KB.");
  await writeFile(output, code);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildStorefront();
