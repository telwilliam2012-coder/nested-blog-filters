import { useState } from "react";

import type { FilterHomeOverview } from "../services/filter-home.server";
import { FilterHome } from "./filter-home";

export type BlogOverview = {
  shopName: string;
  storefrontUrl: string;
  blogs: Array<{
    id: string;
    title: string;
    handle: string;
    articlesCount: { count: number; precision: "EXACT" | "AT_LEAST" } | null;
    tags: string[];
  }>;
  hasMore: boolean;
};

type BlogHomeProps = {
  overview: BlogOverview | null;
  filters: FilterHomeOverview | null;
  shop: string;
  refreshing: boolean;
  onRefresh: () => void;
};

const formatNumber = (value: number) => value.toLocaleString("es-CO");

export function BlogHome({
  overview,
  filters,
  shop,
  refreshing,
  onRefresh,
}: BlogHomeProps) {
  const [search, setSearch] = useState("");
  const contentUrl = `https://${shop}/admin/articles`;
  const tags = [
    ...new Set(overview?.blogs.flatMap((blog) => blog.tags) ?? []),
  ].sort((first, second) => first.localeCompare(second, "es"));
  const articleCount =
    overview?.blogs.reduce(
      (total, blog) => total + (blog.articlesCount?.count ?? 0),
      0,
    ) ?? 0;
  const hasArticleCounts = overview?.blogs.every(
    (blog) => blog.articlesCount !== null,
  );
  const articleCountIsLowerBound =
    overview?.hasMore ||
    overview?.blogs.some(
      (blog) => blog.articlesCount?.precision === "AT_LEAST",
    );
  const query = search.trim().toLocaleLowerCase("es");
  const matchingBlogs =
    overview?.blogs.filter((blog) =>
      `${blog.title} ${blog.handle}`.toLocaleLowerCase("es").includes(query),
    ) ?? [];
  const visibleBlogs = matchingBlogs.slice(0, 5);

  return (
    <div lang="es">
      <s-page heading="Nested Blog Filters">
        <s-button slot="primary-action" variant="primary" href="/app/blogs">
          Ver blogs
        </s-button>

        <s-section accessibilityLabel="Bienvenida">
          <s-stack gap="large">
            <s-stack direction="inline" gap="small" alignItems="center">
              <s-icon type="blog" />
              <s-text type="strong">Tu espacio de contenido</s-text>
              <s-badge tone="success" icon="check-circle">
                Shopify conectado
              </s-badge>
            </s-stack>
            <s-stack gap="small">
              <s-heading>Cada historia, en su lugar.</s-heading>
              <s-paragraph>
                Explora los blogs de {overview?.shopName ?? shop}, revisa sus
                etiquetas y prueba combinaciones de filtros para que tus
                lectores encuentren cada historia.
              </s-paragraph>
            </s-stack>
            <s-stack direction="inline" gap="small">
              <s-button variant="primary" href="/app/blogs">
                Explorar mis blogs
              </s-button>
              <s-button href={contentUrl} target="_blank" icon="external">
                Administrar artículos
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>

        <FilterHome
          overview={filters}
          blogs={overview?.blogs ?? []}
          refreshing={refreshing}
          onRefresh={onRefresh}
        />

        {!overview ? (
          <s-banner heading="No pudimos cargar tu contenido" tone="warning">
            <s-paragraph>
              Intenta actualizar el resumen. También puedes abrir tus artículos
              directamente en Shopify.
            </s-paragraph>
            <s-button onClick={onRefresh} loading={refreshing}>
              Reintentar
            </s-button>
          </s-banner>
        ) : (
          <>
            <s-section heading="Resumen del contenido">
              <s-button
                slot="secondary-actions"
                icon="refresh"
                onClick={onRefresh}
                loading={refreshing}
              >
                Actualizar
              </s-button>
              <s-grid
                gridTemplateColumns="@container (inline-size <= 480px) 1fr, repeat(3, 1fr)"
                gap="base"
              >
                <s-box background="subdued" padding="base" borderRadius="base">
                  <s-stack gap="small">
                    <s-text color="subdued">Blogs</s-text>
                    <s-heading>
                      {formatNumber(overview.blogs.length)}
                      {overview.hasMore ? "+" : ""}
                    </s-heading>
                    <s-text color="subdued">Espacios para tus historias</s-text>
                  </s-stack>
                </s-box>
                <s-box background="subdued" padding="base" borderRadius="base">
                  <s-stack gap="small">
                    <s-text color="subdued">Artículos</s-text>
                    <s-heading>
                      {hasArticleCounts
                        ? `${formatNumber(articleCount)}${articleCountIsLowerBound ? "+" : ""}`
                        : "No disponible"}
                    </s-heading>
                    <s-text color="subdued">Publicados y borradores</s-text>
                  </s-stack>
                </s-box>
                <s-box background="subdued" padding="base" borderRadius="base">
                  <s-stack gap="small">
                    <s-text color="subdued">Etiquetas únicas</s-text>
                    <s-heading>
                      {formatNumber(tags.length)}
                      {overview.hasMore ? "+" : ""}
                    </s-heading>
                    <s-text color="subdued">Temas de tus artículos</s-text>
                  </s-stack>
                </s-box>
              </s-grid>
              {overview.hasMore && (
                <s-paragraph color="subdued">
                  El resumen incluye los primeros 50 blogs. Los valores con +
                  indican un mínimo.
                </s-paragraph>
              )}
            </s-section>

            <s-section heading="Tus blogs">
              <s-link slot="secondary-actions" href="/app/blogs">
                Ver blogs en la app
              </s-link>
              {overview.blogs.length === 0 ? (
                <s-stack gap="base" alignItems="center" paddingBlock="large">
                  <s-icon type="book-open" />
                  <s-heading>Tu próxima historia empieza aquí</s-heading>
                  <s-paragraph>
                    No tienes blogs todavía. Crea uno en Shopify para comenzar.
                  </s-paragraph>
                  <s-button href={contentUrl} target="_blank" variant="primary">
                    Crear contenido en Shopify
                  </s-button>
                </s-stack>
              ) : (
                <s-stack gap="base">
                  <s-search-field
                    label="Buscar blogs en este resumen"
                    placeholder="Buscar por nombre o identificador"
                    value={search}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                  />
                  {visibleBlogs.length === 0 ? (
                    <s-stack gap="small" paddingBlock="base">
                      <s-heading>No encontramos coincidencias</s-heading>
                      <s-paragraph>
                        Prueba con otro nombre o borra la búsqueda.
                      </s-paragraph>
                      <s-button onClick={() => setSearch("")}>
                        Borrar búsqueda
                      </s-button>
                    </s-stack>
                  ) : (
                    visibleBlogs.map((blog, index) => (
                      <s-stack key={blog.id} gap="base">
                        {index > 0 && <s-divider />}
                        <s-grid
                          gridTemplateColumns="1fr auto"
                          gap="base"
                          alignItems="center"
                        >
                          <s-stack gap="small">
                            <s-heading>{blog.title}</s-heading>
                            <s-text color="subdued">
                              /blogs/{blog.handle}
                            </s-text>
                            <s-stack direction="inline" gap="small">
                              <s-badge>
                                {blog.articlesCount
                                  ? `${formatNumber(blog.articlesCount.count)}${blog.articlesCount.precision === "AT_LEAST" ? "+" : ""} artículos`
                                  : "Artículos sin consultar"}
                              </s-badge>
                              <s-text color="subdued">
                                {formatNumber(blog.tags.length)} etiquetas
                              </s-text>
                            </s-stack>
                          </s-stack>
                          <s-button
                            href={new URL(
                              `/blogs/${encodeURIComponent(blog.handle)}`,
                              overview.storefrontUrl,
                            ).toString()}
                            target="_blank"
                            icon="external"
                            accessibilityLabel={`Ver ${blog.title} en la tienda`}
                          >
                            Ver blog
                          </s-button>
                        </s-grid>
                      </s-stack>
                    ))
                  )}
                  {matchingBlogs.length > 5 && (
                    <s-paragraph color="subdued">
                      Mostrando 5 de {matchingBlogs.length} blogs en este
                      resumen. Usa la búsqueda para encontrar otro blog.
                    </s-paragraph>
                  )}
                </s-stack>
              )}
            </s-section>
          </>
        )}

        <s-section slot="aside" heading="Prepara tu contenido">
          <s-stack gap="base">
            <s-paragraph color="subdued">
              Una buena organización comienza con estos pasos.
            </s-paragraph>
            <s-stack gap="small">
              <s-heading>1. Revisa tus blogs</s-heading>
              <s-paragraph>
                Agrupa tus historias en blogs con un tema claro.
              </s-paragraph>
              <s-link href="/app/blogs">Explorar blogs</s-link>
            </s-stack>
            <s-divider />
            <s-stack gap="small">
              <s-heading>2. Revisa tus filtros</s-heading>
              <s-paragraph>
                Consulta tus conjuntos guardados y prueba opciones de motivo,
                ocasión o diseño desde el inicio.
              </s-paragraph>
            </s-stack>
            <s-divider />
            <s-stack gap="small">
              <s-heading>3. Comprueba las combinaciones</s-heading>
              <s-paragraph>
                Elige varias opciones y revisa cómo cambian los resultados. Esta
                vista previa no publica cambios en tu tienda.
              </s-paragraph>
            </s-stack>
          </s-stack>
        </s-section>

        {overview && (
          <s-section slot="aside" heading="Etiquetas de tus blogs">
            <s-stack gap="base">
              <s-paragraph color="subdued">
                Los temas que ya usas en tus artículos.
              </s-paragraph>
              {tags.length > 0 ? (
                <s-stack direction="inline" gap="small">
                  {tags.slice(0, 12).map((tag) => (
                    <s-badge key={tag}>{tag}</s-badge>
                  ))}
                </s-stack>
              ) : (
                <s-paragraph>
                  Cuando agregues etiquetas a tus artículos, aparecerán aquí.
                </s-paragraph>
              )}
              {tags.length > 12 && (
                <s-text color="subdued">
                  Y {formatNumber(tags.length - 12)} etiquetas más.
                </s-text>
              )}
              <s-link
                href="https://help.shopify.com/es/manual/online-store/blogs/writing-blogs/working-with-blog-posts"
                target="_blank"
              >
                Cómo organizar tus artículos
              </s-link>
            </s-stack>
          </s-section>
        )}
      </s-page>
    </div>
  );
}
