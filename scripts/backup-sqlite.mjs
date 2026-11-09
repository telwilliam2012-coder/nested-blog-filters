/* eslint-env node */
import { access, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadLocalEnvironment, sqliteFilePath } from "./runtime-config.mjs";

loadLocalEnvironment();
let db;
try {
  if (!process.argv[2])
    throw new Error("Usage: npm run db:backup -- <new-backup-file.sqlite>");
  const source = sqliteFilePath(process.env.DATABASE_URL);
  const destination = resolve(process.argv[2]);
  if (existsSync(destination))
    throw new Error(
      "The backup destination already exists; choose a new file.",
    );
  await access(source);
  await access(dirname(destination));
  db = new PrismaClient({
    datasourceUrl: `file:${source.replaceAll("\\", "/")}`,
  });
  // SQLite creates a consistent standalone snapshot, including committed WAL data.
  await db.$executeRaw`VACUUM INTO ${destination}`;
  await chmod(destination, 0o600);
  console.log(`SQLite backup created: ${destination}`);
} catch (error) {
  console.error(`SQLite backup failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
