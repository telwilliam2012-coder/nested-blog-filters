import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppPlanAccess } from "../billing-plans";
import prisma from "../db.server";
import { AdminInputError, requireRevision } from "./admin-errors.server";
import { getFilterSet } from "./filter-admin.server";
import { normalizeTag } from "../filter-hierarchy";
import {
  fetchArticlePage,
  fetchArticlesByIds,
  metafieldKey,
  METAFIELD_TYPE,
  setArticleMetafields,
  setArticleTags,
  type ArticleTagOperation,
  type ArticleSnapshot,
  type ContentAdmin,
} from "./shopify-content.server";

type Configuration = Awaited<ReturnType<typeof getFilterSet>>;

async function indexArticle(
  tx: Prisma.TransactionClient,
  set: Configuration,
  node: ArticleSnapshot,
  seenAt?: Date,
) {
  const updatedAt = new Date(Math.max(Date.now(), seenAt?.getTime() ?? 0));
  const article = await tx.article.upsert({
    where: {
      filterSetId_shopifyArticleId: {
        filterSetId: set.id,
        shopifyArticleId: node.id,
      },
    },
    create: {
      filterSetId: set.id,
      shopifyArticleId: node.id,
      title: node.title,
      handle: node.handle,
      tags: JSON.stringify(node.tags),
      imageUrl: node.image?.url ?? null,
      imageAlt: node.image?.altText ?? null,
      publishedAt:
        node.isPublished && node.publishedAt
          ? new Date(node.publishedAt)
          : null,
      updatedAt,
    },
    update: {
      title: node.title,
      handle: node.handle,
      tags: JSON.stringify(node.tags),
      imageUrl: node.image?.url ?? null,
      imageAlt: node.image?.altText ?? null,
      publishedAt:
        node.isPublished && node.publishedAt
          ? new Date(node.publishedAt)
          : null,
      updatedAt,
    },
  });
  const assignments: Array<{
    articleId: string;
    filterOptionId: string;
    filterSetId: string;
  }> = [];
  for (const filter of set.filters) {
    for (const [index, value] of (
      node.attributes[filter.id]?.values ?? []
    ).entries()) {
      const option = await tx.filterOption.upsert({
        where: { filterId_value: { filterId: filter.id, value } },
        create: {
          filterSetId: set.id,
          filterId: filter.id,
          value,
          label: value.slice(0, 100),
          position: filter.options.length + index,
        },
        update: {},
      });
      assignments.push({
        articleId: article.id,
        filterOptionId: option.id,
        filterSetId: set.id,
      });
    }
  }
  await tx.articleOption.deleteMany({
    where: { articleId: article.id, filterSetId: set.id },
  });
  if (assignments.length)
    await tx.articleOption.createMany({ data: assignments });
}

export async function syncArticlePage(
  admin: ContentAdmin,
  shop: string,
  filterSetId: string,
  revision: number,
  jobId: string | null,
  db: PrismaClient = prisma,
) {
  let set = await getFilterSet(shop, filterSetId, db);
  if (!jobId) {
    requireRevision(revision);
    await db.$transaction(async (tx) => {
      const reserved = await tx.filterSet.updateMany({
        where: { id: set.id, shop, revision, sync: { is: null } },
        data: { revision: { increment: 1 } },
      });
      if (reserved.count !== 1)
        throw new AdminInputError(
          "El conjunto cambió o ya tiene una importación. Recarga para reanudarla.",
          409,
        );
      const latest = await tx.article.findFirst({
        where: { filterSetId: set.id },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      });
      const startedAt = new Date(
        Math.max(Date.now(), (latest?.updatedAt.getTime() ?? 0) + 1),
      );
      await tx.articleSync.create({ data: { filterSetId: set.id, startedAt } });
    });
    set = await getFilterSet(shop, filterSetId, db);
  }
  const job = set.sync;
  if (!job || (jobId && job.id !== jobId))
    throw new AdminInputError(
      "La importación ya terminó o fue cancelada. Recarga la página.",
      409,
    );
  const page = await fetchArticlePage(
    admin,
    set.blogId,
    set.filters,
    job.cursor,
  );

  return db.$transaction(
    async (tx) => {
      const reserved = await tx.filterSet.updateMany({
        where: {
          id: set.id,
          shop,
          revision: set.revision,
          sync: { is: { id: job.id, cursor: job.cursor } },
        },
        data: { revision: { increment: 1 } },
      });
      if (reserved.count !== 1)
        throw new AdminInputError(
          "La importación cambió en otra pestaña. Recarga para continuar.",
          409,
        );
      for (const node of page.articles)
        await indexArticle(tx, set, node, job.startedAt);
      const importedCount = job.importedCount + page.articles.length;
      if (page.hasNextPage) {
        await tx.articleSync.update({
          where: { id: job.id },
          data: { cursor: page.endCursor, importedCount },
        });
        return { id: job.id, importedCount, complete: false };
      }
      await tx.article.deleteMany({
        where: { filterSetId: set.id, updatedAt: { lt: job.startedAt } },
      });
      await tx.articleSync.delete({ where: { id: job.id } });
      return { id: null, importedCount, complete: true };
    },
    { timeout: 20_000 },
  );
}

export async function cancelArticleSync(
  shop: string,
  filterSetId: string,
  jobId: string,
  db: PrismaClient = prisma,
) {
  await db.$transaction(async (tx) => {
    const reserved = await tx.filterSet.updateMany({
      where: { id: filterSetId, shop, sync: { is: { id: jobId } } },
      data: { revision: { increment: 1 } },
    });
    if (reserved.count !== 1)
      throw new AdminInputError(
        "No hay una importación activa para cancelar.",
        409,
      );
    await tx.articleSync.delete({ where: { id: jobId } });
  });
}

export async function getArticleManagementPage(
  admin: ContentAdmin,
  shop: string,
  filterSetId: string,
  page: number,
  db: PrismaClient = prisma,
) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000)
    throw new AdminInputError("La página no es válida.");
  const set = await getFilterSet(shop, filterSetId, db);
  const where = { filterSetId };
  const [articles, total] = await db.$transaction([
    db.article.findMany({
      where,
      orderBy: [{ title: "asc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
    }),
    db.article.count({ where }),
  ]);
  const snapshots = set.sync
    ? []
    : await fetchArticlesByIds(
        admin,
        articles.map((article) => article.shopifyArticleId),
        set.blogId,
        set.filters,
      );
  return {
    set,
    articles: articles.map((article, index) => ({
      id: article.id,
      title: snapshots[index]?.title ?? article.title,
      handle: article.handle,
      attributes: snapshots[index]?.attributes ?? null,
    })),
    total,
    page,
    totalPages: Math.ceil(total / 25),
  };
}

export type ArticleEdit = {
  revision: number;
  articleIds: string[];
  filterId: string;
  optionIds: string[];
  mode: "append" | "remove" | "replace";
  digests: Record<string, string | null>;
  expectedValues?: Record<string, string[]>;
};

export async function editArticleAttributes(
  admin: ContentAdmin,
  shop: string,
  filterSetId: string,
  input: ArticleEdit,
  planAccess: AppPlanAccess,
  db: PrismaClient = prisma,
) {
  if (!planAccess)
    throw new AdminInputError(
      "No se pudo verificar el plan de la tienda.",
      403,
    );
  if (
    !input ||
    !Array.isArray(input.articleIds) ||
    input.articleIds.length < 1 ||
    input.articleIds.length > 25 ||
    input.articleIds.some((id) => typeof id !== "string") ||
    new Set(input.articleIds).size !== input.articleIds.length
  )
    throw new AdminInputError("Selecciona entre 1 y 25 artículos diferentes.");
  if (!planAccess.bulkEditing && input.articleIds.length > 1)
    throw new AdminInputError(
      "Tu plan permite editar un artículo a la vez. Cambia a Premium para usar la edición masiva.",
      403,
    );
  if (
    !["append", "remove", "replace"].includes(input.mode) ||
    !Array.isArray(input.optionIds) ||
    input.optionIds.length > 128 ||
    input.optionIds.some((id) => typeof id !== "string")
  )
    throw new AdminInputError("La operación o las opciones no son válidas.");
  if (input.mode !== "replace" && !input.optionIds.length)
    throw new AdminInputError(
      "Selecciona al menos una opción para añadir o quitar.",
    );
  requireRevision(input.revision);
  const set = await getFilterSet(shop, filterSetId, db);
  if (set.sync || set.revision !== input.revision)
    throw new AdminInputError(
      "El conjunto cambió o está importando artículos. Recarga antes de guardar.",
      409,
    );
  const filter = set.filters.find((item) => item.id === input.filterId);
  if (
    !filter ||
    input.optionIds.some(
      (id) => !filter.options.some((option) => option.id === id),
    )
  )
    throw new AdminInputError(
      "Las opciones no pertenecen al filtro seleccionado.",
    );
  const local = await db.article.findMany({
    where: { filterSetId: set.id, id: { in: input.articleIds } },
    orderBy: { id: "asc" },
  });
  if (local.length !== input.articleIds.length)
    throw new AdminInputError(
      "Hay artículos que no pertenecen a este conjunto.",
      403,
    );
  const snapshots = await fetchArticlesByIds(
    admin,
    local.map((article) => article.shopifyArticleId),
    set.blogId,
    set.filters,
  );
  const values = filter.options
    .filter((option) => input.optionIds.includes(option.id))
    .map((option) => option.value);
  if (filter.source === "tag") {
    return editTagAttributes(
      admin,
      shop,
      set,
      filter,
      local,
      snapshots,
      input,
      values,
      db,
    );
  }
  const changes = snapshots.map((node, index) => {
    const field = node.attributes[filter.id];
    const expected = input.digests?.[local[index].id];
    if (
      expected === undefined ||
      (expected !== null && typeof expected !== "string") ||
      expected !== field.digest
    )
      throw new AdminInputError(
        "Los atributos cambiaron desde que abriste esta página. Recarga y revisa los valores antes de guardar.",
        409,
      );
    const next =
      input.mode === "replace"
        ? values
        : input.mode === "append"
          ? [...new Set([...field.values, ...values])]
          : field.values.filter((value) => !values.includes(value));
    if (next.length > 128)
      throw new AdminInputError(
        "Un artículo no puede tener más de 128 valores en el mismo filtro.",
      );
    node.attributes[filter.id] = { values: next, digest: field.digest };
    return {
      ownerId: node.id,
      key: metafieldKey(filter.key),
      type: METAFIELD_TYPE,
      value: JSON.stringify(next),
      compareDigest: field.digest,
    };
  });
  await setArticleMetafields(admin, changes);
  try {
    await commitArticleSnapshots(shop, set, input.revision, snapshots, db);
  } catch {
    throw new AdminInputError(
      "Shopify guardó los atributos, pero el índice local no pudo actualizarse. Sincroniza el blog antes de seguir editando.",
      409,
    );
  }
  return local.length;
}

async function commitArticleSnapshots(
  shop: string,
  set: Configuration,
  revision: number,
  snapshots: ArticleSnapshot[],
  db: PrismaClient,
) {
  await db.$transaction(
    async (tx) => {
      const reserved = await tx.filterSet.updateMany({
        where: { id: set.id, shop, revision, sync: { is: null } },
        data: { revision: { increment: 1 } },
      });
      if (reserved.count !== 1) throw new Error("Configuration changed");
      for (const snapshot of snapshots) await indexArticle(tx, set, snapshot);
    },
    { timeout: 20_000 },
  );
}

async function editTagAttributes(
  admin: ContentAdmin,
  shop: string,
  set: Configuration,
  filter: Configuration["filters"][number],
  local: Array<{ id: string; shopifyArticleId: string }>,
  snapshots: ArticleSnapshot[],
  input: ArticleEdit,
  values: string[],
  db: PrismaClient,
) {
  const configured = new Set(
    filter.options.map((option) => normalizeTag(option.value)),
  );
  const selected = new Set(values.map(normalizeTag));
  const operations: ArticleTagOperation[] = [];
  for (const [index, snapshot] of snapshots.entries()) {
    const expected = input.expectedValues?.[local[index].id];
    const current = snapshot.attributes[filter.id].values;
    if (
      !Array.isArray(expected) ||
      expected.length > 200 ||
      expected.some((value) => typeof value !== "string") ||
      JSON.stringify([...new Set(expected)].sort()) !==
        JSON.stringify([...new Set(current)].sort())
    ) {
      throw new AdminInputError(
        "Las etiquetas de este filtro cambiaron desde que abriste la página. Recarga los artículos antes de guardar.",
        409,
      );
    }
    const present = new Set(snapshot.tags.map(normalizeTag));
    const add =
      input.mode === "remove"
        ? []
        : values.filter((value) => !present.has(normalizeTag(value)));
    const remove = snapshot.tags.filter(
      (tag) =>
        configured.has(normalizeTag(tag)) &&
        (input.mode === "remove"
          ? selected.has(normalizeTag(tag))
          : input.mode === "replace" && !selected.has(normalizeTag(tag))),
    );
    const nextCount = new Set([
      ...current.filter(
        (value) =>
          !remove.some((tag) => normalizeTag(tag) === normalizeTag(value)),
      ),
      ...add,
    ]).size;
    if (nextCount > 128)
      throw new AdminInputError(
        "Un artículo no puede tener más de 128 valores en el mismo filtro.",
      );
    if (add.length)
      operations.push({
        kind: "add",
        id: snapshot.id,
        tags: [...new Set(add)],
      });
    if (remove.length)
      operations.push({ kind: "remove", id: snapshot.id, tags: remove });
  }
  let incomplete = false;
  try {
    await setArticleTags(admin, operations);
  } catch (error) {
    if (error instanceof Response) throw error;
    incomplete = true;
  }
  try {
    const updated = await fetchArticlesByIds(
      admin,
      local.map((article) => article.shopifyArticleId),
      set.blogId,
      set.filters,
    );
    await commitArticleSnapshots(shop, set, input.revision, updated, db);
  } catch {
    throw new AdminInputError(
      "No se pudo confirmar el estado de las etiquetas. Shopify puede haber guardado parte de los cambios. Sincroniza el blog antes de continuar.",
      409,
    );
  }
  if (incomplete)
    throw new AdminInputError(
      "Shopify no pudo completar todos los cambios de etiquetas. El índice local se actualizó con el estado disponible. Revisa los artículos y vuelve a intentarlo.",
      409,
    );
  return local.length;
}
