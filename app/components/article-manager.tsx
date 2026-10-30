import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { loader, action } from "../routes/app.articles";

type Props = Awaited<ReturnType<typeof loader>>;

export function ArticleManager({ sets, management, loadError }: Props) {
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const [filterId, setFilterId] = useState(
    management?.set.filters.find((filter) => filter.source !== "tag")?.id ?? "",
  );
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"append" | "remove" | "replace">("append");
  const [importing, setImporting] = useState(false);
  const handled = useRef<unknown>();
  const busy = fetcher.state !== "idle";
  const set = management?.set;
  const locked = Boolean(set?.sync) || importing;
  const filter = set?.filters.find((item) => item.id === filterId);
  const submit = fetcher.submit;

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
    if (!set || !management || !filter) return;
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
        }),
      },
      { method: "post", action: "/app/articles" },
    );
  }

  return (
    <s-page heading="Atributos de artículos">
      <s-link slot="breadcrumb-actions" href="/app/filters">
        Conjuntos de filtros
      </s-link>
      {!set || !management ? (
        <s-section heading="Empieza con un conjunto">
          <s-paragraph>
            Crea los filtros de un blog para importar sus artículos y asignar
            atributos.
          </s-paragraph>
          <s-button href="/app/filters/new" variant="primary">
            Crear conjunto
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
            {set.sync ? "Reanudar importación" : "Sincronizar desde Shopify"}
          </s-button>
          {loadError && (
            <s-banner
              tone="warning"
              heading="No se pudieron consultar los artículos"
            >
              <s-paragraph>{loadError}</s-paragraph>
              <s-paragraph>
                Puedes sincronizar el blog para actualizar el índice y retirar
                artículos que ya no estén disponibles.
              </s-paragraph>
            </s-banner>
          )}
          {fetcher.data?.error && (
            <s-banner
              tone="critical"
              heading="No se pudo completar la operación"
            >
              <s-paragraph>{fetcher.data.error}</s-paragraph>
            </s-banner>
          )}
          {fetcher.data?.message && (
            <s-banner tone="success" heading="Operación completada">
              <s-paragraph>{fetcher.data.message}</s-paragraph>
            </s-banner>
          )}
          <s-section heading="Blog y sincronización">
            <s-stack gap="base">
              <s-select
                label="Conjunto de filtros"
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
                Importa los artículos y sus atributos antes de etiquetarlos. La
                sincronización no modifica contenido en Shopify.
              </s-paragraph>
              <s-link href={`/app/filters/${set.id}`}>
                Editar filtros y opciones
              </s-link>
              {set.sync && (
                <s-stack gap="small">
                  <s-text>
                    {set.sync.importedCount} artículos importados en este
                    recorrido.
                  </s-text>
                  <s-paragraph color="subdued">
                    Si cierras esta página, podrás reanudar la importación. Las
                    ediciones se habilitan al terminar o cancelar.
                  </s-paragraph>
                  <s-stack direction="inline" gap="small">
                    {importing && (
                      <s-button onClick={() => setImporting(false)}>
                        Pausar después de esta página
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
                      Cancelar importación
                    </s-button>
                  </s-stack>
                </s-stack>
              )}
            </s-stack>
          </s-section>
          <s-section heading="Artículos guardados">
            <s-stack gap="base">
              <s-paragraph>
                {management.total} artículos en el índice. Selecciona uno para
                editarlo individualmente o varios para aplicar un cambio masivo.
              </s-paragraph>
              {!management.articles.length ? (
                <s-paragraph>
                  Sincroniza desde Shopify para consultar los artículos de este
                  blog.
                </s-paragraph>
              ) : (
                <>
                  <s-checkbox
                    label="Seleccionar los artículos de esta página"
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
                  <s-table>
                    <s-table-header-row>
                      <s-table-header>Selección</s-table-header>
                      <s-table-header listSlot="primary">
                        Artículo
                      </s-table-header>
                      <s-table-header listSlot="labeled">
                        Atributos
                      </s-table-header>
                    </s-table-header-row>
                    <s-table-body>
                      {management.articles.map((article) => (
                        <s-table-row key={article.id}>
                          <s-table-cell>
                            <s-checkbox
                              label={`Seleccionar ${article.title}`}
                              labelAccessibilityVisibility="exclusive"
                              checked={selected.includes(article.id)}
                              disabled={locked || busy || !article.attributes}
                              onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setSelected((current) =>
                                  checked
                                    ? [...new Set([...current, article.id])]
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
                                  ) || "Sin asignar"}
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
                    Anterior
                  </s-button>
                  <s-text>
                    Página {management.page} de {management.totalPages}
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
                    Siguiente
                  </s-button>
                </s-stack>
              )}
            </s-stack>
          </s-section>
          <s-section
            heading={`Editar atributos · ${selected.length} seleccionados`}
          >
            <s-stack gap="base">
              {set.filters.some((item) => item.source === "tag") && (
                <s-paragraph>
                  Los filtros que usan etiquetas se actualizan desde Shopify.
                  Edita las etiquetas del artículo y pulsa Sincronizar desde
                  Shopify. Aquí puedes editar los filtros de atributos de la
                  app.
                </s-paragraph>
              )}
              <s-grid
                gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr"
                gap="base"
              >
                <s-select
                  label="Filtro que quieres editar"
                  value={filterId}
                  disabled={busy || locked}
                  onChange={(event) => {
                    setFilterId(event.currentTarget.value);
                    setOptionIds([]);
                  }}
                >
                  {set.filters
                    .filter((item) => item.source !== "tag")
                    .map((item) => (
                      <s-option key={item.id} value={item.id}>
                        {item.label}
                      </s-option>
                    ))}
                </s-select>
                <s-select
                  label="Operación"
                  value={mode}
                  disabled={busy || locked}
                  onChange={(event) =>
                    setMode(event.currentTarget.value as typeof mode)
                  }
                >
                  <s-option value="append">Añadir opciones</s-option>
                  <s-option value="remove">Quitar opciones</s-option>
                  <s-option value="replace">
                    Reemplazar las opciones de este filtro
                  </s-option>
                </s-select>
              </s-grid>
              {filter && filter.options.length > 0 ? (
                <s-choice-list
                  label="Opciones"
                  multiple
                  disabled={busy || locked}
                  onChange={(event) => setOptionIds(event.currentTarget.values)}
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
                  Añade opciones al filtro desde el constructor o impórtalas
                  desde los atributos existentes de Shopify.
                </s-paragraph>
              )}
              <s-paragraph color="subdued">
                Solo se modifica el filtro elegido. Los demás atributos se
                conservan. Puedes seleccionar hasta 25 artículos por lote.
              </s-paragraph>
              {mode === "replace" && (
                <s-banner tone="warning" heading="Reemplazar valores">
                  <s-paragraph>
                    Las opciones elegidas sustituirán los valores actuales de
                    este filtro en los artículos seleccionados. Sin opciones
                    seleccionadas, se vaciará este filtro.
                  </s-paragraph>
                </s-banner>
              )}
              <s-button
                variant="primary"
                loading={busy && !importing}
                disabled={
                  busy ||
                  locked ||
                  !selected.length ||
                  !filter ||
                  (mode !== "replace" && !optionIds.length)
                }
                onClick={saveAttributes}
              >
                Guardar atributos en Shopify
              </s-button>
            </s-stack>
          </s-section>
        </>
      )}
    </s-page>
  );
}
