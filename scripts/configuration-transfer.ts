import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

const FORMAT = "nested-blog-filters.configuration";
const MAX_BYTES = 16 * 1024 * 1024;
const SHOP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const BLOG = /^gid:\/\/shopify\/Blog\/[1-9]\d*$/;
const KEY = /^[a-z][a-z0-9_]{1,39}$/;
const HASH = /^[a-f0-9]{64}$/;
type Dates = { createdAt?: string; updatedAt?: string };
type Option = Dates & {
  id: string;
  value: string;
  label: string;
  position: number;
};
type Filter = Dates & {
  id: string;
  key: string;
  label: string;
  position: number;
  source: "tag" | "metafield";
  parentKey: string | null;
  parentValues: string[];
  options: Option[];
};
type FilterSet = Dates & {
  id: string;
  blogId: string;
  name: string;
  revision: number;
  filters: Filter[];
};
export type ConfigurationSnapshot = {
  format: typeof FORMAT;
  version: 1;
  shop: string;
  filterSets: FilterSet[];
  checksum: string;
  exportedAt: string;
  sourceOrigin?: string;
  exportProof: { expectedSetIds: string[]; complete: true };
};
export class ConfigurationTransferError extends Error {
  constructor(readonly code: string) {
    super("Configuration transfer could not be completed.");
  }
}
function fail(code = "INVALID_SNAPSHOT"): never {
  throw new ConfigurationTransferError(code);
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) fail();
  return result;
}
function text(value: unknown, max: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    value.includes("\0") ||
    (pattern && !pattern.test(value))
  )
    fail();
  return value;
}
function integer(value: unknown): number {
  if (
    !Number.isInteger(value) ||
    Number(value) < 0 ||
    Number(value) > 2_147_483_647
  )
    fail();
  return Number(value);
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail();
  return value;
}
function iso(value: unknown): string {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail();
  return value;
}
function dates(value: Record<string, unknown>): Dates {
  return {
    ...(value.createdAt !== undefined
      ? { createdAt: iso(value.createdAt) }
      : {}),
    ...(value.updatedAt !== undefined
      ? { updatedAt: iso(value.updatedAt) }
      : {}),
  };
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail();
}
const compareId = (a: { id: string }, b: { id: string }) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const comparePosition = (
  a: { position: number; id: string },
  b: { position: number; id: string },
) => a.position - b.position || compareId(a, b);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function configurationChecksum(
  payload: Pick<ConfigurationSnapshot, "version" | "shop" | "filterSets">,
) {
  const filterSets = payload.filterSets
    .map((set) => ({
      ...set,
      filters: set.filters
        .map((filter) => ({
          ...filter,
          options: [...filter.options].sort(comparePosition),
        }))
        .sort(comparePosition),
    }))
    .sort(compareId);
  return createHash("sha256")
    .update(
      canonical({ version: payload.version, shop: payload.shop, filterSets }),
    )
    .digest("hex");
}

export function validateConfigurationSnapshot(
  input: unknown,
  expectedShop: string,
): ConfigurationSnapshot {
  if (!SHOP.test(expectedShop)) fail("INVALID_SHOP");
  let encoded: string;
  try {
    encoded = JSON.stringify(input);
  } catch {
    fail();
  }
  if (!encoded || Buffer.byteLength(encoded, "utf8") > MAX_BYTES) fail();
  const value = object(input, [
    "format",
    "version",
    "shop",
    "filterSets",
    "checksum",
    "exportedAt",
    "sourceOrigin",
    "exportProof",
  ]);
  if (value.format !== FORMAT || value.version !== 1) fail();
  if (value.shop !== expectedShop) fail("WRONG_SHOP");
  const filterSets = array(value.filterSets, 1000)
    .map((raw): FilterSet => {
      const set = object(raw, [
        "id",
        "blogId",
        "name",
        "revision",
        "filters",
        "createdAt",
        "updatedAt",
      ]);
      const filters = array(set.filters, 100)
        .map((rawFilter): Filter => {
          const filter = object(rawFilter, [
            "id",
            "key",
            "label",
            "position",
            "source",
            "parentKey",
            "parentValues",
            "options",
            "createdAt",
            "updatedAt",
          ]);
          if (filter.source !== "tag" && filter.source !== "metafield") fail();
          const options = array(filter.options, 10000)
            .map((rawOption): Option => {
              const option = object(rawOption, [
                "id",
                "value",
                "label",
                "position",
                "createdAt",
                "updatedAt",
              ]);
              return {
                id: text(option.id, 128, ID),
                value: text(option.value, 255),
                label: text(option.label, 100),
                position: integer(option.position),
                ...dates(option),
              };
            })
            .sort(comparePosition);
          unique(options.map((option) => option.value));
          const parentValues = array(filter.parentValues, 200).map((value) =>
            text(value, 255),
          );
          unique(parentValues);
          return {
            id: text(filter.id, 128, ID),
            key: text(filter.key, 40, KEY),
            label: text(filter.label, 100),
            position: integer(filter.position),
            source: filter.source,
            parentKey:
              filter.parentKey === null
                ? null
                : text(filter.parentKey, 40, KEY),
            parentValues,
            options,
            ...dates(filter),
          };
        })
        .sort(comparePosition);
      unique(filters.map((filter) => filter.key));
      for (const [index, filter] of filters.entries()) {
        const parent = filters
          .slice(0, index)
          .find((candidate) => candidate.key === filter.parentKey);
        if (
          filter.parentKey
            ? !parent ||
              !filter.parentValues.length ||
              filter.parentValues.some(
                (value) =>
                  !parent.options.some((option) => option.value === value),
              )
            : filter.parentValues.length
        )
          fail();
      }
      return {
        id: text(set.id, 128, ID),
        blogId: text(set.blogId, 128, BLOG),
        name: text(set.name, 100),
        revision: integer(set.revision),
        filters,
        ...dates(set),
      };
    })
    .sort(compareId);
  unique(filterSets.map((set) => set.id));
  unique(filterSets.map((set) => set.blogId));
  unique(filterSets.flatMap((set) => set.filters.map((filter) => filter.id)));
  unique(
    filterSets.flatMap((set) =>
      set.filters.flatMap((filter) =>
        filter.options.map((option) => option.id),
      ),
    ),
  );
  const proof = object(value.exportProof, ["expectedSetIds", "complete"]);
  const ids = array(proof.expectedSetIds, 1000)
    .map((id) => text(id, 128, ID))
    .sort();
  unique(ids);
  if (
    proof.complete !== true ||
    JSON.stringify(ids) !== JSON.stringify(filterSets.map((set) => set.id))
  )
    fail("INCOMPLETE_EXPORT");
  let sourceOrigin: string | undefined;
  if (value.sourceOrigin !== undefined) {
    sourceOrigin = text(value.sourceOrigin, 2048);
    let url: URL;
    try {
      url = new URL(sourceOrigin);
    } catch {
      fail();
    }
    if (url.protocol !== "https:" || url.origin !== sourceOrigin) fail();
  }
  const result: ConfigurationSnapshot = {
    format: FORMAT,
    version: 1,
    shop: expectedShop,
    filterSets,
    checksum: text(value.checksum, 64, HASH),
    exportedAt: iso(value.exportedAt),
    ...(sourceOrigin ? { sourceOrigin } : {}),
    exportProof: { expectedSetIds: ids, complete: true },
  };
  if (configurationChecksum(result) !== result.checksum)
    fail("CHECKSUM_MISMATCH");
  return result;
}

function metadata(snapshot: ConfigurationSnapshot) {
  return {
    shop: snapshot.shop,
    checksum: snapshot.checksum,
    sets: snapshot.filterSets.length,
    filters: snapshot.filterSets.reduce(
      (sum, set) => sum + set.filters.length,
      0,
    ),
    options: snapshot.filterSets.reduce(
      (sum, set) =>
        sum +
        set.filters.reduce((total, filter) => total + filter.options.length, 0),
      0,
    ),
  };
}
const selectedDates = { createdAt: true, updatedAt: true } as const;
export async function exportConfiguration(
  db: PrismaClient,
  shop: string,
  provider: "sqlite" | "postgresql",
  now = new Date(),
): Promise<ConfigurationSnapshot> {
  if (!SHOP.test(shop)) fail("INVALID_SHOP");
  const rows = await db.$transaction(
    async (tx) => {
      if (provider === "sqlite")
        await tx.$executeRawUnsafe("PRAGMA query_only = ON");
      else await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.filterSet.findMany({
        where: { shop },
        orderBy: { id: "asc" },
        take: 1001,
        select: {
          id: true,
          shop: true,
          blogId: true,
          name: true,
          revision: true,
          ...selectedDates,
          filters: {
            orderBy: [{ position: "asc" }, { id: "asc" }],
            select: {
              id: true,
              key: true,
              label: true,
              position: true,
              source: true,
              parentKey: true,
              parentValues: true,
              ...selectedDates,
              options: {
                orderBy: [{ position: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  value: true,
                  label: true,
                  position: true,
                  ...selectedDates,
                },
              },
            },
          },
        },
      });
    },
    { isolationLevel: "Serializable", timeout: 30_000 },
  );
  const filterSets = rows.map((set) => {
    if (set.shop !== shop) fail("WRONG_SHOP");
    return {
      id: set.id,
      blogId: set.blogId,
      name: set.name,
      revision: set.revision,
      createdAt: set.createdAt.toISOString(),
      updatedAt: set.updatedAt.toISOString(),
      filters: set.filters.map((filter) => ({
        id: filter.id,
        key: filter.key,
        label: filter.label,
        position: filter.position,
        source: filter.source as Filter["source"],
        parentKey: filter.parentKey,
        parentValues: JSON.parse(filter.parentValues) as string[],
        createdAt: filter.createdAt.toISOString(),
        updatedAt: filter.updatedAt.toISOString(),
        options: filter.options.map((option) => ({
          id: option.id,
          value: option.value,
          label: option.label,
          position: option.position,
          createdAt: option.createdAt.toISOString(),
          updatedAt: option.updatedAt.toISOString(),
        })),
      })),
    };
  });
  const payload = {
    format: FORMAT,
    version: 1 as const,
    shop,
    filterSets,
    exportedAt: now.toISOString(),
    exportProof: {
      expectedSetIds: filterSets.map((set) => set.id),
      complete: true as const,
    },
  };
  return validateConfigurationSnapshot(
    { ...payload, checksum: configurationChecksum(payload) },
    shop,
  );
}

export async function importConfiguration(
  db: PrismaClient,
  input: unknown,
  shop: string,
  expectedChecksum: string,
  now = new Date(),
) {
  const snapshot = validateConfigurationSnapshot(input, shop);
  if (!HASH.test(expectedChecksum) || snapshot.checksum !== expectedChecksum)
    fail("CHECKSUM_MISMATCH");
  const restoredDates = (value: Dates) => ({
    createdAt: value.createdAt ? new Date(value.createdAt) : now,
    updatedAt: value.updatedAt ? new Date(value.updatedAt) : now,
  });
  try {
    await db.$transaction(
      async (tx) => {
        if (await tx.filterSet.count({ where: { shop } }))
          fail("DESTINATION_NOT_EMPTY");
        for (const set of snapshot.filterSets) {
          await tx.filterSet.create({
            data: {
              id: set.id,
              shop,
              blogId: set.blogId,
              name: set.name,
              revision: set.revision,
              ...restoredDates(set),
            },
          });
          for (const filter of set.filters) {
            await tx.filter.create({
              data: {
                id: filter.id,
                filterSetId: set.id,
                key: filter.key,
                label: filter.label,
                position: filter.position,
                source: filter.source,
                parentKey: filter.parentKey,
                parentValues: JSON.stringify(filter.parentValues),
                ...restoredDates(filter),
              },
            });
            if (filter.options.length)
              await tx.filterOption.createMany({
                data: filter.options.map((option) => ({
                  id: option.id,
                  filterId: filter.id,
                  filterSetId: set.id,
                  value: option.value,
                  label: option.label,
                  position: option.position,
                  ...restoredDates(option),
                })),
              });
          }
        }
      },
      { isolationLevel: "Serializable", timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof ConfigurationTransferError) throw error;
    fail("IMPORT_ABORTED");
  }
  return metadata(snapshot);
}

type Arguments = {
  operation: "validate" | "export" | "import";
  shop: string;
  input?: string;
  output?: string;
  checksum?: string;
  apply: boolean;
};
export function transferArguments(args: string[]): Arguments {
  const [operation, ...rest] = args;
  if (!["validate", "export", "import"].includes(operation))
    fail("INVALID_ARGUMENTS");
  const fields = new Map<string, string>();
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key === "--apply" && !apply) {
      apply = true;
      continue;
    }
    if (
      !["--shop", "--input", "--output", "--checksum"].includes(key) ||
      fields.has(key) ||
      !rest[i + 1] ||
      rest[i + 1].startsWith("--")
    )
      fail("INVALID_ARGUMENTS");
    fields.set(key, rest[++i]);
  }
  const shop = fields.get("--shop") ?? "";
  if (!SHOP.test(shop)) fail("INVALID_SHOP");
  if (
    operation === "export"
      ? !fields.get("--output") ||
        fields.has("--input") ||
        fields.has("--checksum") ||
        apply
      : !fields.get("--input") ||
        fields.has("--output") ||
        (operation === "validate" && (apply || fields.has("--checksum")))
  )
    fail("INVALID_ARGUMENTS");
  if (apply && !HASH.test(fields.get("--checksum") ?? ""))
    fail("INVALID_ARGUMENTS");
  return {
    operation: operation as Arguments["operation"],
    shop,
    input: fields.get("--input"),
    output: fields.get("--output"),
    checksum: fields.get("--checksum"),
    apply,
  };
}
async function database(
  operation: "export" | "import",
): Promise<{ db: PrismaClient; provider: "sqlite" | "postgresql" }> {
  const url = process.env.DATABASE_URL;
  if (!url) fail("DATABASE_CONFIGURATION");
  const require = createRequire(import.meta.url);
  const schema = await readFile(
    join(dirname(require.resolve(".prisma/client")), "schema.prisma"),
    "utf8",
  );
  const match = schema.match(
    /datasource\s+\w+\s*\{[^}]*\bprovider\s*=\s*"(sqlite|postgresql)"/,
  );
  const provider = match?.[1] as "sqlite" | "postgresql" | undefined;
  if (
    !provider ||
    (provider === "sqlite"
      ? !url.startsWith("file:")
      : !/^postgres(?:ql)?:\/\//.test(url)) ||
    (operation === "import" && provider !== "postgresql")
  )
    fail("WRONG_PROVIDER");
  if (provider === "sqlite") {
    const filename = url.slice(5).split("?")[0];
    if (!filename || !(await stat(filename)).isFile())
      fail("SOURCE_UNAVAILABLE");
  }
  const { PrismaClient } = await import("@prisma/client");
  return {
    db: new PrismaClient({ datasources: { db: { url } }, log: [] }),
    provider,
  };
}
export async function runConfigurationTransfer(args: string[]) {
  let db: PrismaClient | undefined;
  try {
    const command = transferArguments(args);
    if (command.operation === "export") {
      const source = await database("export");
      db = source.db;
      const snapshot = await exportConfiguration(
        db,
        command.shop,
        source.provider,
      );
      await writeFile(
        resolve(command.output!),
        JSON.stringify(snapshot, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      return {
        exitCode: 0,
        result: { ok: true, operation: "export", ...metadata(snapshot) },
      };
    }
    const inputPath = resolve(command.input!);
    if ((await stat(inputPath)).size > MAX_BYTES) fail("INVALID_SNAPSHOT");
    const snapshot = validateConfigurationSnapshot(
      JSON.parse(await readFile(inputPath, "utf8")),
      command.shop,
    );
    if (command.checksum && snapshot.checksum !== command.checksum)
      fail("CHECKSUM_MISMATCH");
    if (command.operation === "import" && command.apply) {
      const target = await database("import");
      db = target.db;
      return {
        exitCode: 0,
        result: {
          ok: true,
          operation: "import",
          applied: true,
          ...(await importConfiguration(
            db,
            snapshot,
            command.shop,
            command.checksum!,
          )),
        },
      };
    }
    return {
      exitCode: 0,
      result: {
        ok: true,
        operation: command.operation,
        applied: false,
        destinationChecked: false,
        ...metadata(snapshot),
      },
    };
  } catch (error) {
    return {
      exitCode: 1,
      result: {
        ok: false,
        code:
          error instanceof ConfigurationTransferError
            ? error.code
            : "TRANSFER_FAILED",
      },
    };
  } finally {
    await db?.$disconnect().catch(() => {});
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const outcome = await runConfigurationTransfer(process.argv.slice(2));
  process.stdout.write(JSON.stringify(outcome.result) + "\n");
  process.exitCode = outcome.exitCode;
}
