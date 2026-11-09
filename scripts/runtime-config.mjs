/* eslint-env node */
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadLocalEnvironment() {
  if (existsSync(".env")) loadEnvFile(".env");
}

export function getShopifyAppUrl(env = process.env) {
  const value = env.SHOPIFY_APP_URL?.trim() || "";
  if (env.NODE_ENV !== "production") return value;
  let url;
  try {
    url = new URL(value);
  } catch {
    /* Validated below. */
  }
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.hostname === "trycloudflare.com" ||
    url.hostname.endsWith(".trycloudflare.com")
  ) {
    throw new Error(
      "Production requires SHOPIFY_APP_URL to be a stable HTTPS origin, without a path or temporary Cloudflare tunnel.",
    );
  }
  return url.origin;
}

export function sqliteFilePath(databaseUrl) {
  if (!databaseUrl?.startsWith("file:"))
    throw new Error("DATABASE_URL must use SQLite (file:).");
  const filename = databaseUrl.slice(5).split("?")[0];
  if (!filename) throw new Error("DATABASE_URL must identify a SQLite file.");
  return isAbsolute(filename)
    ? filename
    : resolve(fileURLToPath(new URL("../prisma/", import.meta.url)), filename);
}

export function productionSettings(env = process.env) {
  const appUrl = getShopifyAppUrl({ ...env, NODE_ENV: "production" });
  for (const name of [
    "SHOPIFY_API_KEY",
    "SHOPIFY_API_SECRET",
    "DATABASE_URL",
  ]) {
    if (!env[name]?.trim())
      throw new Error(`Missing production environment variable: ${name}.`);
  }
  const databaseUrl = env.DATABASE_URL.trim();
  if (
    !databaseUrl.startsWith("file:") ||
    !isAbsolute(databaseUrl.slice(5).split("?")[0])
  ) {
    throw new Error(
      "Production DATABASE_URL must point to an absolute SQLite path on a persistent volume, such as file:/data/dev.sqlite.",
    );
  }
  const port = env.PORT || "3000";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  return {
    appUrl,
    databaseUrl,
    databasePath: sqliteFilePath(databaseUrl),
    host: env.HOST || "0.0.0.0",
    port,
  };
}
