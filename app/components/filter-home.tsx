import { useState } from "react";
import { useFetcher } from "react-router";
import { descendantFilterIds } from "../filter-hierarchy";

import type { loader } from "../routes/app.filter-preview";
import type { FilterSelections } from "../services/filter-engine.server";
import type { FilterHomeOverview } from "../services/filter-home.server";

type FilterHomeProps = {
  overview: FilterHomeOverview | null;
  blogs: Array<{ id: string; title: string }>;
  refreshing: boolean;
  onRefresh: () => void;
};

const formatNumber = (value: number) => value.toLocaleString("es-CO");

export function FilterHome({
  overview,
  blogs,
  refreshing,
  onRefresh,
}: FilterHomeProps) {
  const fetcher = useFetcher<typeof loader>();
  const [selectedSetId, setSelectedSetId] = useState("");
  const loading = fetcher.state !== "idle";
  // Do not show a previous set's results if the merchant changes the selector.
  const preview =
    fetcher.data?.preview?.filterSet.id === selectedSetId
      ? fetcher.data.preview
      : null;
  const selectedSet = overview?.sets.find((set) => set.id === selectedSetId);

  function loadPreview(
    filterSetId: string,
    selections: FilterSelections = {},
    page = 1,
  ) {
    const params = new URLSearchParams({ filterSetId, page: String(page) });
    for (const [filterId, optionIds] of Object.entries(selections)) {
      for (const optionId of optionIds) {
        params.append(`option.${filterId}`, optionId);
      }
    }
    fetcher.load(`/app/filter-preview?${params.toString()}`);
  }

  return (
    <s-section heading="Filtros de tus blogs">
      <s-button
        slot="secondary-actions"
        icon="refresh"
        onClick={onRefresh}
        loading={refreshing}
      >
        Actualizar
      </s-button>
      <s-stack gap="large">
        <s-stack direction="inline" gap="small" alignItems="center">
          <s-badge tone="info">Nuevo</s-badge>
          <s-paragraph>
            Prueba cómo se combinan tus filtros y descubre qué artículos
            coinciden.
          </s-paragraph>
        </s-stack>

        {!overview ? (
          <s-banner heading="No pudimos cargar tus filtros" tone="warning">
            <s-paragraph>
              Actualiza el resumen para consultar tus conjuntos guardados.
            </s-paragraph>
          </s-banner>
        ) : (
          <>
            <s-grid
              gridTemplateColumns="@container (inline-size <= 480px) repeat(2, 1fr), repeat(4, 1fr)"
              gap="base"
            >
              {[
                ["Conjuntos", overview.totals.filterSets],
                ["Filtros", overview.totals.filters],
                ["Opciones", overview.totals.options],
                ["Artículos guardados", overview.totals.articles],
              ].map(([label, value]) => (
                <s-box
                  key={label}
                  background="subdued"
                  padding="base"
                  borderRadius="base"
                >
                  <s-stack gap="small">
                    <s-text color="subdued">{label}</s-text>
                    <s-heading>{formatNumber(Number(value))}</s-heading>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>

            {overview.sets.length === 0 ? (
              <s-box background="subdued" padding="large" borderRadius="base">
                <s-stack gap="base" alignItems="center">
                  <s-icon type="filter" />
                  <s-heading>El siguiente paso: tus filtros</s-heading>
                  <s-paragraph>
                    Todavía no hay conjuntos guardados. Aquí podrás probar los
                    filtros de cada blog y revisar sus resultados antes de
                    llevarlos a tu tienda.
                  </s-paragraph>
                  <s-button variant="primary" href="/app/filters/new">
                    Crear mi primer conjunto
                  </s-button>
                </s-stack>
              </s-box>
            ) : (
              <s-stack gap="base">
                <s-select
                  label="Conjunto de filtros"
                  placeholder="Selecciona un conjunto para probarlo"
                  value={selectedSetId}
                  disabled={loading}
                  onChange={(event) => {
                    const id = event.currentTarget.value;
                    setSelectedSetId(id);
                    if (id) loadPreview(id);
                  }}
                >
                  {overview.sets.map((set) => (
                    <s-option key={set.id} value={set.id}>
                      {set.name} ·{" "}
                      {blogs.find((blog) => blog.id === set.blogId)?.title ??
                        "Blog guardado"}
                    </s-option>
                  ))}
                </s-select>
                {overview.totals.filterSets > overview.sets.length && (
                  <s-paragraph color="subdued">
                    Se muestran los 50 conjuntos actualizados más recientemente.
                  </s-paragraph>
                )}
                {selectedSet && (
                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/filters/${selectedSet.id}`}>
                      Editar conjunto
                    </s-button>
                    <s-button
                      href={`/app/articles?filterSetId=${selectedSet.id}`}
                    >
                      Gestionar artículos
                    </s-button>
                    <s-badge>
                      {formatNumber(selectedSet._count.filters)} filtros
                    </s-badge>
                    <s-badge>
                      {formatNumber(selectedSet._count.articles)} artículos
                      guardados
                    </s-badge>
                  </s-stack>
                )}

                <div aria-live="polite" aria-busy={loading}>
                  {loading && (
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-spinner
                        size="base"
                        accessibilityLabel="Actualizando filtros"
                      />
                      <s-text>Actualizando opciones y resultados…</s-text>
                    </s-stack>
                  )}
                  {fetcher.data?.error && !loading && (
                    <s-banner
                      heading="No pudimos mostrar esta combinación"
                      tone="warning"
                    >
                      <s-paragraph>{fetcher.data.error}</s-paragraph>
                      <s-button onClick={() => loadPreview(selectedSetId)}>
                        Volver a consultar
                      </s-button>
                    </s-banner>
                  )}
                </div>

                {preview && (
                  <s-stack gap="large">
                    <s-paragraph color="subdued">
                      Puedes elegir varias opciones por filtro. Un artículo debe
                      coincidir con al menos una opción de cada filtro
                      seleccionado. Las opciones se actualizan según tus demás
                      selecciones.
                    </s-paragraph>
                    {preview.filters.length > 0 ? (
                      <s-grid
                        gridTemplateColumns="@container (inline-size <= 480px) 1fr, repeat(2, 1fr)"
                        gap="base"
                      >
                        {preview.filters
                          .filter((filter) => filter.visible)
                          .map((filter) => (
                            <s-box
                              key={filter.id}
                              border="base"
                              padding="base"
                              borderRadius="base"
                            >
                              {filter.options.length > 0 ? (
                                <s-choice-list
                                  label={filter.label}
                                  multiple
                                  disabled={loading}
                                  onChange={(event) => {
                                    const descendants = descendantFilterIds(
                                      preview.filters,
                                      filter.id,
                                    );
                                    loadPreview(selectedSetId, {
                                      ...preview.selections,
                                      ...Object.fromEntries(
                                        [...descendants].map((id) => [id, []]),
                                      ),
                                      [filter.id]: event.currentTarget.values,
                                    });
                                  }}
                                >
                                  {filter.options
                                    .filter(
                                      (option) =>
                                        !filter.parentFilterId ||
                                        option.available ||
                                        option.selected,
                                    )
                                    .map((option) => (
                                      <s-choice
                                        key={option.id}
                                        value={option.id}
                                        selected={option.selected}
                                        disabled={
                                          !option.available && !option.selected
                                        }
                                      >
                                        {option.label} (
                                        {formatNumber(option.count)})
                                      </s-choice>
                                    ))}
                                </s-choice-list>
                              ) : (
                                <s-stack gap="small">
                                  <s-heading>{filter.label}</s-heading>
                                  <s-text color="subdued">
                                    Este filtro aún no tiene opciones.
                                  </s-text>
                                </s-stack>
                              )}
                            </s-box>
                          ))}
                      </s-grid>
                    ) : (
                      <s-paragraph>
                        Este conjunto todavía no tiene filtros.
                      </s-paragraph>
                    )}
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-heading>
                        {formatNumber(preview.total)} artículos encontrados
                      </s-heading>
                      <s-button
                        variant="tertiary"
                        disabled={
                          loading ||
                          Object.keys(preview.selections).length === 0
                        }
                        onClick={() => loadPreview(selectedSetId)}
                      >
                        Limpiar filtros
                      </s-button>
                    </s-stack>
                    <s-paragraph color="subdued">
                      Esta vista consulta los artículos guardados en la app.
                      Solo muestra publicaciones disponibles; no incluye
                      borradores ni publicaciones programadas para una fecha
                      futura.
                    </s-paragraph>
                    {preview.articles.length > 0 ? (
                      <s-grid
                        gridTemplateColumns="@container (inline-size <= 480px) 1fr, repeat(2, 1fr)"
                        gap="base"
                      >
                        {preview.articles.map((article) => (
                          <s-box
                            key={article.id}
                            border="base"
                            padding="base"
                            borderRadius="base"
                          >
                            <s-stack gap="small">
                              <s-heading>{article.title}</s-heading>
                              <s-text color="subdued">{article.handle}</s-text>
                            </s-stack>
                          </s-box>
                        ))}
                      </s-grid>
                    ) : (
                      <s-paragraph>
                        {Object.keys(preview.selections).length > 0
                          ? "No hay artículos para esta combinación. Cambia una opción o limpia los filtros."
                          : "Este conjunto aún no tiene artículos publicados disponibles."}
                      </s-paragraph>
                    )}
                    {preview.totalPages > 1 && (
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <s-button
                          disabled={loading || preview.page <= 1}
                          onClick={() =>
                            loadPreview(
                              selectedSetId,
                              preview.selections,
                              preview.page - 1,
                            )
                          }
                        >
                          Anterior
                        </s-button>
                        <s-text>
                          Página {preview.page} de {preview.totalPages}
                        </s-text>
                        <s-button
                          disabled={
                            loading || preview.page >= preview.totalPages
                          }
                          onClick={() =>
                            loadPreview(
                              selectedSetId,
                              preview.selections,
                              preview.page + 1,
                            )
                          }
                        >
                          Siguiente
                        </s-button>
                      </s-stack>
                    )}
                  </s-stack>
                )}
              </s-stack>
            )}
          </>
        )}
      </s-stack>
    </s-section>
  );
}
