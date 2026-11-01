import { useEffect, useRef, useState } from "react";
import type { ElementRef } from "react";
import { useFetcher } from "react-router";
import { descendantFilterIds } from "../filter-hierarchy";
import { useAdminI18n } from "../i18n/admin-i18n";
import { ADMIN_LOCALES, LANGUAGE_NAMES } from "../i18n/locale";
import { HelpEntryCard } from "./help-content";

import type { loader } from "../routes/app.filter-preview";
import type { FilterSelections } from "../services/filter-engine.server";
import type { FilterHomeOverview } from "../services/filter-home.server";

type FilterHomeProps = {
  overview: FilterHomeOverview | null;
  blogs: Array<{ id: string; title: string }>;
  refreshing: boolean;
  onRefresh: () => void;
};

export function FilterHome({
  overview,
  blogs,
  refreshing,
  onRefresh,
}: FilterHomeProps) {
  const { t, formatNumber, locale, setLocale } = useAdminI18n();
  const languageSelect = useRef<ElementRef<"s-select">>(null);
  useEffect(() => {
    const element = languageSelect.current;
    if (!element) return;
    const onChange = () => setLocale(element.value);
    element.addEventListener("change", onChange);
    return () => element.removeEventListener("change", onChange);
  }, [setLocale]);
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
    <>
      <s-section heading={t("Filtros de tus blogs")}>
        <s-button
          slot="secondary-actions"
          icon="refresh"
          onClick={onRefresh}
          loading={refreshing}
        >
          {t("Actualizar")}
        </s-button>
        <s-stack gap="large">
          <s-select
            ref={languageSelect}
            id="nbf-admin-language"
            label={t("Idioma de la aplicación")}
            details={t(
              "El idioma se aplica a todo el panel. La tienda usa su propio idioma activo.",
            )}
            value={locale}
          >
            {ADMIN_LOCALES.map((language) => (
              <s-option key={language} value={language}>
                {t(LANGUAGE_NAMES[language])}
              </s-option>
            ))}
          </s-select>
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-badge tone="info">{t("Nuevo")}</s-badge>
            <s-paragraph>
              {t(
                "Prueba cómo se combinan tus filtros y descubre qué artículos coinciden.",
              )}
            </s-paragraph>
          </s-stack>

          {!overview ? (
            <s-banner
              heading={t("No pudimos cargar tus filtros")}
              tone="warning"
            >
              <s-paragraph>
                {t(
                  "Actualiza el resumen para consultar tus conjuntos guardados.",
                )}
              </s-paragraph>
            </s-banner>
          ) : (
            <>
              <s-grid
                gridTemplateColumns="@container (inline-size <= 480px) repeat(2, 1fr), repeat(4, 1fr)"
                gap="base"
              >
                {[
                  [t("Conjuntos"), overview.totals.filterSets],
                  [t("Filtros"), overview.totals.filters],
                  [t("Opciones"), overview.totals.options],
                  [t("Artículos guardados"), overview.totals.articles],
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
                    <s-heading>{t("El siguiente paso: tus filtros")}</s-heading>
                    <s-paragraph>
                      {t(
                        "Todavía no hay conjuntos guardados. Aquí podrás probar los filtros de cada blog y revisar sus resultados antes de llevarlos a tu tienda.",
                      )}
                    </s-paragraph>
                    <s-button variant="primary" href="/app/filters/new">
                      {t("Crear mi primer conjunto")}
                    </s-button>
                  </s-stack>
                </s-box>
              ) : (
                <s-stack gap="base">
                  <s-select
                    label={t("Conjunto de filtros")}
                    placeholder={t("Selecciona un conjunto para probarlo")}
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
                          t("Blog guardado")}
                      </s-option>
                    ))}
                  </s-select>
                  {overview.totals.filterSets > overview.sets.length && (
                    <s-paragraph color="subdued">
                      {t(
                        "Se muestran los 50 conjuntos actualizados más recientemente.",
                      )}
                    </s-paragraph>
                  )}
                  {selectedSet && (
                    <s-stack direction="inline" gap="small">
                      <s-button href={`/app/filters/${selectedSet.id}`}>
                        {t("Editar conjunto")}
                      </s-button>
                      <s-button
                        href={`/app/articles?filterSetId=${selectedSet.id}`}
                      >
                        {t("Gestionar artículos")}
                      </s-button>
                      <s-badge>
                        {t("{{v0}} filtros", {
                          v0: formatNumber(selectedSet._count.filters),
                        })}
                      </s-badge>
                      <s-badge>
                        {t("{{v0}} artículos guardados", {
                          v0: formatNumber(selectedSet._count.articles),
                        })}
                      </s-badge>
                    </s-stack>
                  )}

                  <div aria-live="polite" aria-busy={loading}>
                    {loading && (
                      <s-stack
                        direction="inline"
                        gap="small"
                        alignItems="center"
                      >
                        <s-spinner
                          size="base"
                          accessibilityLabel={t("Actualizando filtros")}
                        />
                        <s-text>
                          {t("Actualizando opciones y resultados…")}
                        </s-text>
                      </s-stack>
                    )}
                    {fetcher.data?.error && !loading && (
                      <s-banner
                        heading={t("No pudimos mostrar esta combinación")}
                        tone="warning"
                      >
                        <s-paragraph>{t(fetcher.data.error)}</s-paragraph>
                        <s-button onClick={() => loadPreview(selectedSetId)}>
                          {t("Volver a consultar")}
                        </s-button>
                      </s-banner>
                    )}
                  </div>

                  {preview && (
                    <s-stack gap="large">
                      <s-paragraph color="subdued">
                        {t(
                          "Puedes elegir una sola opción por filtro. Un artículo debe coincidir con la opción de cada filtro seleccionado. Las opciones se actualizan según tus demás selecciones.",
                        )}
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
                                    disabled={loading}
                                    onChange={(event) => {
                                      const descendants = descendantFilterIds(
                                        preview.filters,
                                        filter.id,
                                      );
                                      loadPreview(selectedSetId, {
                                        ...preview.selections,
                                        ...Object.fromEntries(
                                          [...descendants].map((id) => [
                                            id,
                                            [],
                                          ]),
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
                                            !option.available &&
                                            !option.selected
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
                                      {t("Este filtro aún no tiene opciones.")}
                                    </s-text>
                                  </s-stack>
                                )}
                              </s-box>
                            ))}
                        </s-grid>
                      ) : (
                        <s-paragraph>
                          {t("Este conjunto todavía no tiene filtros.")}
                        </s-paragraph>
                      )}
                      <s-stack
                        direction="inline"
                        gap="base"
                        alignItems="center"
                      >
                        <s-heading>
                          {t("{{v0}} artículos encontrados", {
                            v0: formatNumber(preview.total),
                          })}
                        </s-heading>
                        <s-button
                          variant="tertiary"
                          disabled={
                            loading ||
                            Object.keys(preview.selections).length === 0
                          }
                          onClick={() => loadPreview(selectedSetId)}
                        >
                          {t("Limpiar filtros")}
                        </s-button>
                      </s-stack>
                      <s-paragraph color="subdued">
                        {t(
                          "Esta vista consulta los artículos guardados en la app. Solo muestra publicaciones disponibles; no incluye borradores ni publicaciones programadas para una fecha futura.",
                        )}
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
                                <s-text color="subdued">
                                  {article.handle}
                                </s-text>
                              </s-stack>
                            </s-box>
                          ))}
                        </s-grid>
                      ) : (
                        <s-paragraph>
                          {Object.keys(preview.selections).length > 0
                            ? t(
                                "No hay artículos para esta combinación. Cambia una opción o limpia los filtros.",
                              )
                            : t(
                                "Este conjunto aún no tiene artículos publicados disponibles.",
                              )}
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
                            {t("Anterior")}
                          </s-button>
                          <s-text>
                            {t("Página {{v0}} de {{v1}}", {
                              v0: preview.page,
                              v1: preview.totalPages,
                            })}
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
                            {t("Siguiente")}
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
      <HelpEntryCard />
    </>
  );
}
