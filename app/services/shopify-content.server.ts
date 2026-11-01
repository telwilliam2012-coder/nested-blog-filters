import { AdminInputError } from "./admin-errors.server";
import { matchingTagValues } from "../filter-hierarchy";

export type ContentAdmin = {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
};
export type ContentFilter = {
  id: string;
  key: string;
  label: string;
  source?: string;
  options?: Array<{ value: string }>;
};
export type ArticleSnapshot = {
  id: string;
  title: string;
  handle: string;
  isPublished: boolean;
  publishedAt: string | null;
  blog: { id: string };
  tags: string[];
  image: { url: string; altText: string | null } | null;
  attributes: Record<string, { values: string[]; digest: string | null }>;
};
type RawArticle = Omit<ArticleSnapshot, "attributes"> & Record<string, unknown>;
type UserError = { message: string; code?: string };

export const METAFIELD_TYPE = "list.single_line_text_field";
export const metafieldKey = (key: string) => `nbf_${key}`;

export const BLOGS_QUERY = `#graphql
  query FilterBlogs($after: String) {
    blogs(first: 50, after: $after) {
      nodes { id title handle }
      pageInfo { hasNextPage endCursor }
    }
  }`;
export const BLOG_QUERY = `#graphql
  query FilterBlog($id: ID!) { blog(id: $id) { id title handle } }`;
export const DEFINITIONS_QUERY = `#graphql
  query FilterDefinitions($after: String) {
    metafieldDefinitions(first: 100, after: $after, namespace: "$app", ownerType: ARTICLE) {
      nodes { key type { name } }
      pageInfo { hasNextPage endCursor }
    }
  }`;
export const DEFINITION_MUTATION = `#graphql
  mutation FilterDefinitionCreate($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id }
      userErrors { message code }
    }
  }`;
export const METAFIELDS_MUTATION = `#graphql
  mutation FilterArticleAttributes($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key compareDigest }
      userErrors { message code }
    }
  }`;

export async function contentData<T>(
  admin: ContentAdmin,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  try {
    const response = await admin.graphql(query, { variables });
    const result = (await response.json()) as { data?: T; errors?: unknown[] };
    if (result.errors?.length || !result.data) throw new Error();
    return result.data;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new AdminInputError(
      "Shopify no pudo responder. Comprueba los permisos read_content y write_content e inténtalo de nuevo.",
      502,
    );
  }
}

export async function getShopifyBlogs(
  admin: ContentAdmin,
  after: string | null = null,
) {
  const result = await contentData<{
    blogs: {
      nodes: Array<{ id: string; title: string; handle: string }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  }>(admin, BLOGS_QUERY, { after });
  return result.blogs;
}

export async function requireShopifyBlog(admin: ContentAdmin, id: string) {
  if (!/^gid:\/\/shopify\/Blog\/[1-9]\d*$/.test(id))
    throw new AdminInputError("Selecciona un blog válido.");
  const result = await contentData<{
    blog: { id: string; title: string; handle: string } | null;
  }>(admin, BLOG_QUERY, { id });
  if (!result.blog)
    throw new AdminInputError(
      "El blog ya no está disponible en esta tienda.",
      404,
    );
  return result.blog;
}

export async function ensureFilterDefinitions(
  admin: ContentAdmin,
  filters: ContentFilter[],
) {
  if (!filters.length) return;
  const definitions = new Map<string, string>();
  let after: string | null = null;
  do {
    const result: {
      metafieldDefinitions: {
        nodes: Array<{ key: string; type: { name: string } }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await contentData(admin, DEFINITIONS_QUERY, { after });
    result.metafieldDefinitions.nodes.forEach((definition) =>
      definitions.set(definition.key, definition.type.name),
    );
    after = result.metafieldDefinitions.pageInfo.hasNextPage
      ? result.metafieldDefinitions.pageInfo.endCursor
      : null;
  } while (after);
  for (const filter of filters) {
    const key = metafieldKey(filter.key);
    if (definitions.has(key)) {
      if (definitions.get(key) !== METAFIELD_TYPE)
        throw new AdminInputError(
          `El metafield ${key} tiene un tipo incompatible.`,
        );
      continue;
    }
    const result = await contentData<{
      metafieldDefinitionCreate: {
        createdDefinition: { id: string } | null;
        userErrors: UserError[];
      };
    }>(admin, DEFINITION_MUTATION, {
      definition: {
        name: `Filtros: ${filter.key}`,
        key,
        ownerType: "ARTICLE",
        type: METAFIELD_TYPE,
        access: { admin: "MERCHANT_READ_WRITE" },
      },
    });
    if (
      result.metafieldDefinitionCreate.userErrors.length ||
      !result.metafieldDefinitionCreate.createdDefinition
    ) {
      throw new AdminInputError(
        "No se pudo crear la definición de atributos en Shopify. Recarga y vuelve a guardar.",
        409,
      );
    }
  }
}

export function articleFields(filters: ContentFilter[]) {
  const fields = filters
    .map((filter, index) => {
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(filter.key))
        throw new AdminInputError("El filtro contiene una clave no válida.");
      if (filter.source === "tag") return "";
      return `attribute_${index}: metafield(namespace: "$app", key: "${metafieldKey(filter.key)}") { type jsonValue compareDigest }`;
    })
    .join("\n");
  return `id title handle isPublished publishedAt tags image { url(transform: { maxWidth: 600, maxHeight: 600 }) altText } blog { id } ${fields}`;
}

export function articlesQuery(filters: ContentFilter[], byIds = false) {
  return byIds
    ? `query FilterArticlesByIds($ids: [ID!]!) { nodes(ids: $ids) { ... on Article { ${articleFields(filters)} } } }`
    : `query FilterBlogArticles($blogId: ID!, $after: String) { blog(id: $blogId) { id articles(first: 25, after: $after) { nodes { ${articleFields(filters)} } pageInfo { hasNextPage endCursor } } } }`;
}

function snapshot(node: RawArticle, filters: ContentFilter[]): ArticleSnapshot {
  const attributes: ArticleSnapshot["attributes"] = {};
  filters.forEach((filter, index) => {
    if (filter.source === "tag") {
      attributes[filter.id] = {
        values: matchingTagValues(node.tags ?? [], filter.options ?? []),
        digest: null,
      };
      return;
    }
    const field = node[`attribute_${index}`] as {
      type: string;
      jsonValue: unknown;
      compareDigest: string;
    } | null;
    if (!field) {
      attributes[filter.id] = { values: [], digest: null };
      return;
    }
    if (
      field.type !== METAFIELD_TYPE ||
      !Array.isArray(field.jsonValue) ||
      field.jsonValue.length > 128 ||
      field.jsonValue.some(
        (value) =>
          typeof value !== "string" ||
          !value.trim() ||
          value.length > 255 ||
          /[\r\n]/.test(value),
      )
    ) {
      throw new AdminInputError(
        `El artículo «${node.title}» contiene valores incompatibles en ${filter.label}. Corrígelos en Shopify antes de sincronizar.`,
      );
    }
    attributes[filter.id] = {
      values: [...new Set(field.jsonValue)] as string[],
      digest: field.compareDigest,
    };
  });
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    isPublished: node.isPublished,
    publishedAt: node.publishedAt,
    blog: node.blog,
    tags: node.tags ?? [],
    image: node.image ?? null,
    attributes,
  };
}

export async function fetchArticlePage(
  admin: ContentAdmin,
  blogId: string,
  filters: ContentFilter[],
  after: string | null,
) {
  const data = await contentData<{
    blog: {
      id: string;
      articles: {
        nodes: RawArticle[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } | null;
  }>(admin, articlesQuery(filters), { blogId, after });
  if (!data.blog || data.blog.id !== blogId)
    throw new AdminInputError("El blog ya no está disponible.", 404);
  if (data.blog.articles.nodes.some((node) => node.blog.id !== blogId))
    throw new AdminInputError("Shopify devolvió artículos de otro blog.", 502);
  if (
    data.blog.articles.pageInfo.hasNextPage &&
    (!data.blog.articles.pageInfo.endCursor ||
      data.blog.articles.pageInfo.endCursor === after)
  )
    throw new AdminInputError(
      "Shopify devolvió una página incompleta. Reintenta la sincronización.",
      502,
    );
  return {
    articles: data.blog.articles.nodes.map((node) => snapshot(node, filters)),
    ...data.blog.articles.pageInfo,
  };
}

export async function fetchArticlesByIds(
  admin: ContentAdmin,
  ids: string[],
  blogId: string,
  filters: ContentFilter[],
) {
  if (!ids.length) return [];
  const data = await contentData<{ nodes: Array<RawArticle | null> }>(
    admin,
    articlesQuery(filters, true),
    { ids },
  );
  if (
    data.nodes.length !== ids.length ||
    data.nodes.some(
      (node, index) =>
        !node || node.id !== ids[index] || node.blog.id !== blogId,
    )
  ) {
    throw new AdminInputError(
      "Uno de los artículos fue eliminado o cambió de blog. Sincroniza de nuevo.",
      409,
    );
  }
  return data.nodes.map((node) => snapshot(node!, filters));
}

export async function setArticleMetafields(
  admin: ContentAdmin,
  metafields: Array<{
    ownerId: string;
    key: string;
    type: string;
    value: string;
    compareDigest: string | null;
  }>,
) {
  if (!metafields.length || metafields.length > 25)
    throw new AdminInputError("Selecciona entre 1 y 25 artículos.");
  const result = await contentData<{
    metafieldsSet: {
      metafields: Array<{ key: string; compareDigest: string }> | null;
      userErrors: UserError[];
    };
  }>(admin, METAFIELDS_MUTATION, { metafields });
  if (
    result.metafieldsSet.userErrors.length ||
    !result.metafieldsSet.metafields ||
    result.metafieldsSet.metafields.length !== metafields.length
  ) {
    throw new AdminInputError(
      "Shopify rechazó los cambios o los atributos cambiaron en otra sesión. No se actualizó este lote. Recarga los artículos e inténtalo de nuevo.",
      409,
    );
  }
}

export type ArticleTagOperation = {
  kind: "add" | "remove";
  id: string;
  tags: string[];
};

export function articleTagsMutation(operations: ArticleTagOperation[]) {
  const argumentsList = operations
    .map((_, index) => `$id_${index}: ID!, $tags_${index}: [String!]!`)
    .join(", ");
  const fields = operations
    .map(
      (operation, index) =>
        `change_${index}: ${operation.kind === "add" ? "tagsAdd" : "tagsRemove"}(id: $id_${index}, tags: $tags_${index}) { node { id } userErrors { message } }`,
    )
    .join("\n");
  return `mutation FilterArticleTags(${argumentsList}) { ${fields} }`;
}

export async function setArticleTags(
  admin: ContentAdmin,
  operations: ArticleTagOperation[],
) {
  if (!operations.length) return;
  if (operations.length > 50)
    throw new AdminInputError("Selecciona hasta 25 artículos por lote.");
  const variables = Object.fromEntries(
    operations.flatMap((operation, index) => [
      [`id_${index}`, operation.id],
      [`tags_${index}`, operation.tags],
    ]),
  );
  const result = await contentData<
    Record<string, { node: { id: string } | null; userErrors: UserError[] }>
  >(admin, articleTagsMutation(operations), variables);
  if (
    operations.some(
      (operation, index) =>
        result[`change_${index}`]?.node?.id !== operation.id ||
        result[`change_${index}`]?.userErrors.length,
    )
  ) {
    throw new AdminInputError(
      "Shopify no pudo completar todos los cambios de etiquetas. Revisa los artículos antes de volver a guardar.",
      409,
    );
  }
}
