import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { useAdminI18n } from "../i18n/admin-i18n";
import type { loader, action } from "../routes/app.articles";

type Props = Awaited<ReturnType<typeof loader>>;

export function ArticleManager({
  sets,
  management,
  loadError,
  planAccess,
}: Props) {
  const { t } = useAdminI18n();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [filterId, setFilterId] = useState(
    management?.set.filters[0]?.id ?? "",
  );
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"append" | "remove" | "replace">("append");
  const [importing, setImporting] = useState(false);
  const handled = useRef<unknown>();
  const busy = fetcher.state !== "idle";
  const set = management?.set;
  const locked = Boolean(set?.sync) || importing;
  const editingDisabled = busy || locked || Boolean(loadError);
  const filter = set?.filters.find((item) => item.id === filterId);
  const submit = fetcher.submit;

  useEffect(() => {
    if (!planAccess.bulkEditing) setSelected((current) => current.slice(0, 1));
  }, [planAccess.bulkEditing]);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      handled.current === fetcher.data
    )
      return;
    handled.current = fetcher.data;
    if (fetcher.data.error) {
      setImporting(false);
      return;
    }
    if (fetcher.data.progress) {
      if (fetcher.data.progress.complete) setImporting(false);
      else if (importing && set)
        submit(
          {
            intent: "sync",
            filterSetId: set.id,
            revision: String(set.revision),
            jobId: fetcher.data.progress.id ?? "",
          },
          { method: "post", action: "/app/articles" },
        );
    } else if (fetcher.data.message) {
      setSelected([]);
    }
  }, [fetcher.state, fetcher.data, importing, set, submit]);

  function importArticles() {
    if (!set) return;
    handled.current = fetcher.data;
    setSelected([]);
    setImporting(true);
    submit(
      {
        intent: "sync",
        filterSetId: set.id,
        revision: String(set.revision),
        jobId: set.sync?.id ?? "",
      },
      { method: "post", action: "/app/articles" },
    );
  }

  function saveAttributes() {
    if (
      !set ||
      !management ||
      !filter ||
      (!planAccess.bulkEditing && selected.length > 1)
    )
      return;
    const digests = Object.fromEntries(
      management.articles
        .filter((article) => selected.includes(article.id))
        .map((article) => [
          article.id,
          article.attributes?.[filter.id]?.digest,
        ]),
    );
    submit(
      {
        intent: "edit",
        filterSetId: set.id,
        payload: JSON.stringify({
          revision: set.revision,
          articleIds: selected,
          filterId,
          optionIds,
          mode,
          digests,
          expectedValues: Object.fromEntries(
            management.articles
              .filter((article) => selected.includes(article.id))
              .map((article) => [
                article.id,
                article.attributes?.[filter.id]?.values ?? [],
              ]),
          ),
        }),
      },
      { method: "post", action: "/app/articles" },
    );
  }

  return (
    <s-page heading={t("Atributos de artículos")}>
      {!planAccess.bulkEditing && (
        <s-banner heading={t("Edición individual incluida")} tone="info">
          <s-paragraph>
            {t(
              "Tu plan permite editar un artículo a la vez. Premium incluye edición masiva.",
            )}
          </s-paragraph>
          <s-button href="/app/billing">{t("Ver planes")}</s-button>
        </s-banner>
      )}
      <s-link slot="breadcrumb-actions" href="/app/filters">
        {t("Conjuntos de filtros")}
      </s-link>
      {!set || !management ? (
        <s-section heading={t("Empieza con un conjunto")}>
          <s-paragraph>
            {t(
              "Crea los filtros de un blog para importar sus artículos y asignar atributos.",
            )}
          </s-paragraph>
          <s-button href="/app/filters/new" variant="primary">
            {t("Crear conjunto")}
          </s-button>
        </s-section>
      ) : (
        <>
          <s-button
            slot="primary-action"
            variant="primary"
            loading={busy && importing}
            disabled={busy || importing}
            onClick={importArticles}
          >
            {set.sync
              ? t("Reanudar importación")
              : t("Sincronizar desde Shopify")}
          </s-button>
          {loadError && (
            <s-banner
              tone="warning"
              heading={t("No se pudieron consultar los artículos")}
            >
              <s-paragraph>{t(loadError)}</s-paragraph>
              <s-paragraph>
                {t(
                  "Puedes sincronizar el blog para actualizar el índice y retirar artículos que ya no estén disponibles.",
                )}
              </s-paragraph>
            </s-banner>
          )}
          {fetcher.data?.error && (
            <s-banner
              tone="critical"
              heading={t("No se pudo completar la operación")}
            >
              <s-paragraph>{t(fetcher.data.error)}</s-paragraph>
            </s-banner>
          )}
          {fetcher.data?.message && (
            <s-banner tone="success" heading={t("Operación completada")}>
              <s-paragraph>{t(fetcher.data.message)}</s-paragraph>
            </s-banner>
          )}
          <s-section heading={t("Blog y sincronización")}>
            <s-stack gap="base">
              <s-select
                label={t("Conjunto de filtros")}
                value={set.id}
                disabled={busy || importing}
                onChange={(event) =>
                  navigate(
                    `/app/articles?filterSetId=${encodeURIComponent(event.currentTarget.value)}`,
                  )
                }
              >
                {sets.map((item) => (
                  <s-option key={item.id} value={item.id}>
                    {item.name}
                  </s-option>
                ))}
              </s-select>
              <s-paragraph>
                {t(
                  "Importa los artículos y sus atributos antes de etiquetarlos. La sincronización no modifica contenido en Shopify.",
                )}
              </s-paragraph>
              <s-link href={`/app/filters/${set.id}`}>
                {t("Editar filtros y opciones")}
              </s-link>
              {set.sync && (
                <s-stack gap="small">
                  <s-text>
                    {t("{{v0}} artículos importados en este recorrido.", {
                      v0: set.sync.importedCount,
                    })}
                  </s-text>
                  <s-paragraph color="subdued">
                    {t(
                      "Si cierras esta página, podrás reanudar la importación. Las ediciones se habilitan al terminar o cancelar.",
                    )}
                  </s-paragraph>
                  <s-stack direction="inline" gap="small">
                    {importing && (
                      <s-button onClick={() => setImporting(false)}>
                        {t("Pausar después de esta página")}
                      </s-button>
                    )}
                    <s-button
                      disabled={busy || importing}
                      tone="critical"
                      onClick={() =>
                        submit(
                          {
                            intent: "cancel",
                            filterSetId: set.id,
                            jobId: set.sync!.id,
                          },
                          { method: "post", action: "/app/articles" },
                        )
                      }
                    >
                      {t("Cancelar importación")}
                    </s-button>
                  </s-stack>
                </s-stack>
              )}
            </s-stack>
          </s-section>
          <s-section heading={t("Artículos guardados")}>
            <s-stack gap="base">
              <s-paragraph>
                {t(
                  "{{v0}} artículos en el índice. Selecciona uno para editarlo individualmente o varios para aplicar un cambio masivo.",
                  { v0: management.total },
                )}
              </s-paragraph>
              {!management.articles.length ? (
                <s-paragraph>
                  {t(
                    "Sincroniza desde Shopify para consultar los artículos de este blog.",
                  )}
                </s-paragraph>
              ) : (
                <>
                  {planAccess.bulkEditing && (
                    <s-checkbox
                      label={t("Seleccionar los artículos de esta página")}
                      checked={
                        selected.length === management.articles.length &&
                        selected.length > 0
                      }
                      disabled={locked || busy || Boolean(loadError)}
                      onChange={(event) =>
                        setSelected(
                          event.currentTarget.checked
                            ? management.articles
                                .filter((article) => article.attributes)
                                .map((article) => article.id)
                            : [],
                        )
                      }
                    />
                  )}
                  <s-table>
                    <s-table-header-row>
                      <s-table-header>{t("Selección")}</s-table-header>
                      <s-table-header listSlot="primary">
                        {t("Artículo")}
                      </s-table-header>
                      <s-table-header listSlot="labeled">
                        {t("Atributos")}
                      </s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {management.articles.map((article) => (
                        <s-table-row key={article.id}>
                          <s-table-cell>
                            <s-checkbox
                              label={t("Seleccionar {{v0}}", {
                                v0: article.title,
                              })}
                              labelAccessibilityVisibility="exclusive"
                              checked={selected.includes(article.id)}
                              disabled={locked || busy || !article.attributes}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setSelected((current) =>
                                  checked
                                    ? planAccess.bulkEditing
                                      ? [...new Set([...current, article.id])]
                                      : [article.id]
                                    : current.filter((id) => id !== article.id),
                                );
                              }}
                            />
                          </s-table-cell>
                          <s-table-cell>
                            <s-text type="strong">{article.title}</s-text>
                          </s-table-cell>
                          <s-table-cell>
                            <s-stack gap="small">
                              {set.filters.map((item) => (
                                <s-text key={item.id}>
                                  {item.label}:{" "}
                                  {article.attributes?.[item.id]?.values.join(
                                    ", ",
                                  ) || t("Sin asignar")}
                                </s-text>
                              ))}
                            </s-stack>
                          </s-table-cell>
                        </s-table-row>
                      ))}
                    </s-table-body>
                  </s-table>
                </>
              )}
              {management.totalPages > 1 && (
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-button
                    disabled={busy || importing || management.page <= 1}
                    href={`/app/articles?filterSetId=${set.id}&page=${management.page - 1}`}
                    onClick={() => setSelected([])}
                  >
                    {t("Anterior")}
                  </s-button>
                  <s-text>
                    {t("Página {{v0}} de {{v1}}", {
                      v0: management.page,
                      v1: management.totalPages,
                    })}
                  </s-text>
                  <s-button
                    disabled={
                      busy ||
                      importing ||
                      management.page >= management.totalPages
                    }
                    href={`/app/articles?filterSetId=${set.id}&page=${management.page + 1}`}
                    onClick={() => setSelected([])}
                  >
                    {t("Siguiente")}
                  </s-button>
                </s-stack>
              )}
            </s-stack>
          </s-section>
          {set.filters.length === 0 ? (
            <s-section heading={t("Configura los filtros del blog")}>
              <s-paragraph>
                {t(
                  "Añade al menos un filtro y sus opciones antes de asignarlos a los artículos.",
                )}
              </s-paragraph>
              <s-button href={`/app/filters/${set.id}`}>
                {t("Configurar filtros")}
              </s-button>
            </s-section>
          ) : (
            <s-section
              heading={t("Editar atributos · {{v0}} seleccionados", {
                v0: selected.length,
              })}
            >
              <s-stack gap="base">
                {filter?.source === "tag" && (
                  <s-paragraph>
                    {t(
                      "Las opciones de este filtro se guardan como etiquetas del artículo en Shopify. Puedes añadirlas, quitarlas o reemplazarlas desde aquí. Las demás etiquetas se conservan.",
                    )}
                  </s-paragraph>
                )}
                <s-grid
                  gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr"
                  gap="base"
                >
                  <s-select
                    label={t("Filtro que quieres editar")}
                    value={filterId}
                    disabled={editingDisabled || !set.filters.length}
                    onChange={(event) => {
                      setFilterId(event.currentTarget.value);
                      setOptionIds([]);
                    }}
                  >
                    {set.filters.map((item) => (
                      <s-option key={item.id} value={item.id}>
                        {item.label}
                      </s-option>
                    ))}
                  </s-select>
                  <s-select
                    label={t("Operación")}
                    value={mode}
                    disabled={editingDisabled || !filter}
                    onChange={(event) =>
                      setMode(event.currentTarget.value as typeof mode)
                    }
                  >
                    <s-option value="append">{t("Añadir opciones")}</s-option>
                    <s-option value="remove">{t("Quitar opciones")}</s-option>
                    <s-option value="replace">
                      {t("Reemplazar las opciones de este filtro")}
                    </s-option>
                  </s-select>
                </s-grid>
                {filter && filter.options.length > 0 ? (
                  <s-choice-list
                    label={t("Opciones")}
                    multiple
                    disabled={editingDisabled}
                    onChange={(event) =>
                      setOptionIds(event.currentTarget.values)
                    }
                  >
                    {filter.options.map((option) => (
                      <s-choice
                        key={option.id}
                        value={option.id}
                        selected={optionIds.includes(option.id)}
                      >
                        {option.label}
                      </s-choice>
                    ))}
                  </s-choice-list>
                ) : (
                  <s-paragraph>
                    {t(
                      "Añade opciones al filtro desde el constructor o impórtalas desde los atributos existentes de Shopify.",
                    )}
                  </s-paragraph>
                )}
                <s-paragraph color="subdued">
                  {t(
                    "Solo se modifican las opciones configuradas para el filtro elegido. Puedes seleccionar hasta 25 artículos por lote.",
                  )}
                </s-paragraph>
                {mode === "replace" && (
                  <s-banner tone="warning" heading={t("Reemplazar valores")}>
                    <s-paragraph>
                      {t(
                        "Las opciones elegidas sustituirán los valores actuales de este filtro en los artículos seleccionados. Sin opciones seleccionadas, se vaciará este filtro.",
                      )}
                    </s-paragraph>
                  </s-banner>
                )}
                <s-button
                  variant="primary"
                  loading={busy && !importing}
                  disabled={
                    editingDisabled ||
                    !selected.length ||
                    (!planAccess.bulkEditing && selected.length > 1) ||
                    !filter ||
                    (mode !== "replace" && !optionIds.length)
                  }
                  onClick={saveAttributes}
                >
                  {filter?.source === "tag"
                    ? t("Guardar etiquetas en Shopify")
                    : t("Guardar atributos en Shopify")}
                </s-button>
              </s-stack>
            </s-section>
          )}
        </>
      )}
    </s-page>
  );
}
