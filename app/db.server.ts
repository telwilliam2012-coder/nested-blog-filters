import { PrismaClient } from "@prisma/client";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, sep } from "node:path";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
  // eslint-disable-next-line no-var
  var prismaGeneration: string | undefined;
}

let prisma: PrismaClient;
if (process.env.NODE_ENV !== "production") {
  const require = createRequire(import.meta.url);
  const generatedEntry = require.resolve(".prisma/client");
  const generated = statSync(generatedEntry);
  const generation = `${generated.mtimeMs}:${generated.size}`;
  if (!global.prismaGlobal || global.prismaGeneration !== generation) {
    const previous = global.prismaGlobal;
    const generatedDirectory = `${dirname(generatedEntry)}${sep}`;
    const packageEntry = require.resolve("@prisma/client");
    for (const filename of Object.keys(require.cache)) {
      if (
        filename.endsWith(".js") &&
        (filename === packageEntry || filename.startsWith(generatedDirectory))
      ) {
        delete require.cache[filename];
      }
    }
    const { PrismaClient: CurrentPrismaClient } =
      require("@prisma/client") as typeof import("@prisma/client");
    global.prismaGlobal = new CurrentPrismaClient();
    global.prismaGeneration = generation;
    if (previous) void previous.$disconnect().catch(() => undefined);
  }
  prisma = global.prismaGlobal;
} else {
  prisma = new PrismaClient();
}

export default prisma;
