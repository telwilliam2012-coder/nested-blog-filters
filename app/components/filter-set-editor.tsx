import { useState } from "react";
import { useAdminI18n } from "../i18n/admin-i18n";
import { filterKeyError, normalizeFilterKey } from "../filter-key";
import { celebrationFilters } from "../filter-presets";
import type { FilterSetDraft } from "../services/filter-admin.server";

type Props = {
  initial: FilterSetDraft;
  blogs: Array<{ id: string; title: string }>;
  saving: boolean;
  error?: string;
  saved?: boolean;
  locked?: boolean;
  inUse?: string[];
  setId?: string;
  onSave: (draft: FilterSetDraft) => void;
};

export function FilterSetEditor({
  initial,
  blogs,
  saving,
  error,
  saved,
  locked,
  inUse = [],
  setId,
  onSave,
}: Props) {
  const { t } = useAdminI18n();
  const [draft, setDraft] = useState(initial);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const disabled = saving || locked;
  const normalizedKeys = draft.filters.map((filter) =>
    filter.id ? filter.key : normalizeFilterKey(filter.key),
  );
  const keyErrors = normalizedKeys.map(
    (key) =>
      filterKeyError(key) ??
      (normalizedKeys.filter((other) => other === key).length > 1
        ? t("Este identificador se repite en otro filtro. Usa uno diferente.")
        : undefined),
  );
  const formError =
    saveAttempted && keyErrors.some(Boolean)
      ? t("Revisa los identificadores marcados antes de guardar.")
      : error;

  function save() {
    if (disabled || !blogs.length) return;
    setSaveAttempted(true);
    const normalized = {
      ...draft,
      filters: draft.filters.map((filter, index) => ({
        ...filter,
        key: normalizedKeys[index],
      })),
    };
    setDraft(normalized);
    if (!keyErrors.some(Boolean)) onSave(normalized);
  }
  function changeFilter(
    index: number,
    update: Partial<FilterSetDraft["filters"][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      filters: current.filters.map((filter, i) =>
        i === index ? { ...filter, ...update } : filter,
      ),
    }));
  }
  function move(from: number, to: number) {
    const filters = [...draft.filters];
    [filters[from], filters[to]] = [filters[to], filters[from]];
    setDraft({ ...draft, filters });
  }
  return (
    <s-page
      heading={
        setId ? t("Editar conjunto de filtros") : t("Crear conjunto de filtros")
      }
    >
      <s-button
        slot="primary-action"
        variant="primary"
        loading={saving}
        disabled={disabled || !blogs.length}
        onClick={save}
      >
        {t("Guardar conjunto")}
      </s-button>
      <s-link slot="breadcrumb-actions" href="/app/filters">
        {t("Conjuntos de filtros")}
      </s-link>
      {formError && (
        <s-banner heading={t("No se pudo guardar")} tone="critical">
          <s-paragraph>{t(formError)}</s-paragraph>
        </s-banner>
      )}
      {saved && !formError && (
        <s-banner heading={t("Conjunto guardado")} tone="success">
          <s-paragraph>
            {t("Ya puedes importar los artículos y asignar sus atributos.")}
          </s-paragraph>
        </s-banner>
      )}
      {locked && (
        <s-banner heading={t("Importación en curso")} tone="warning">
          <s-paragraph>
            {t(
              "Termina o cancela la importación de artículos antes de editar el conjunto.",
            )}
          </s-paragraph>
          <s-link href={`/app/articles?filterSetId=${setId}`}>
            {t("Revisar importación")}
          </s-link>
        </s-banner>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        data-save-bar
      >
        <s-stack gap="large">
          <s-section heading={t("Datos del conjunto")}>
            <s-stack gap="base">
              <s-text-field
                label={t("Nombre del conjunto")}
                value={draft.name}
                required
                maxLength={100}
                disabled={disabled}
                onInput={(event) =>
                  setDraft({ ...draft, name: event.currentTarget.value })
                }
              />
              <s-select
                label={t("Blog")}
                value={draft.blogId}
                disabled={disabled || Boolean(setId)}
                onChange={(event) =>
                  setDraft({ ...draft, blogId: event.currentTarget.value })
                }
              >
                {blogs.map((blog) => (
                  <s-option key={blog.id} value={blog.id}>
                    {blog.title}
                  </s-option>
                ))}
              </s-select>
              {!blogs.length && (
                <s-paragraph>
                  {t(
                    "No hay blogs disponibles en esta página. Revisa tus blogs en Shopify o consulta la siguiente página.",
                  )}
                </s-paragraph>
              )}
              <s-paragraph color="subdued">
                {t(
                  "Cada blog tiene su propio conjunto. El orden de los filtros será el mismo que verán tus lectores.",
                )}
              </s-paragraph>
              <s-button
                disabled={disabled || draft.filters.length > 7}
                onClick={() =>
                  setDraft({
                    ...draft,
                    filters: celebrationFilters(draft.filters),
                  })
                }
              >
                {t("Usar estructura Celebraciones")}
              </s-button>
              <s-paragraph color="subdued">
                {t(
                  "Prepara Motivos → Ocasión → Festividades con las etiquetas de Shopify. Conserva las opciones existentes. Revisa los tres niveles y guarda los cambios.",
                )}
              </s-paragraph>
            </s-stack>
          </s-section>
          {draft.filters.map((filter, index) => (
            <s-section
              key={filter.id ?? `new-${index}`}
              heading={`${index + 1}. ${filter.label || t("Nuevo filtro")}`}
            >
              <s-stack gap="base">
                <s-stack direction="inline" gap="small">
                  <s-button
                    disabled={disabled || index === 0}
                    accessibilityLabel={t("Subir filtro {{v0}}", {
                      v0: filter.label,
                    })}
                    onClick={() => move(index, index - 1)}
                  >
                    {t("Subir")}
                  </s-button>
                  <s-button
                    disabled={disabled || index === draft.filters.length - 1}
                    accessibilityLabel={t("Bajar filtro {{v0}}", {
                      v0: filter.label,
                    })}
                    onClick={() => move(index, index + 1)}
                  >
                    {t("Bajar")}
                  </s-button>
                  <s-button
                    tone="critical"
                    disabled={
                      disabled ||
                      draft.filters.length === 1 ||
                      filter.options.some(
                        (option) => option.id && inUse.includes(option.id),
                      )
                    }
                    onClick={() =>
                      setDraft({
                        ...draft,
                        filters: draft.filters.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t("Quitar filtro")}
                  </s-button>
                </s-stack>
                <s-grid
                  gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr"
                  gap="base"
                >
                  <s-text-field
                    label={t("Etiqueta del filtro")}
                    value={filter.label}
                    disabled={disabled}
                    required
                    maxLength={100}
                    onInput={(event) =>
                      changeFilter(index, { label: event.currentTarget.value })
                    }
                  />
                  <s-select
                    label={t("Origen de las opciones")}
                    value={filter.source ?? "metafield"}
                    disabled={disabled}
                    onChange={(event) =>
                      changeFilter(index, {
                        source: event.currentTarget.value as
                          "metafield" | "tag",
                      })
                    }
                  >
                    <s-option value="metafield">
                      {t("Atributos gestionados en la app")}
                    </s-option>
                    <s-option value="tag">
                      {t("Etiquetas de los artículos en Shopify")}
                    </s-option>
                  </s-select>
                  <s-text-field
                    label={t("Identificador estable")}
                    value={filter.key}
                    disabled={disabled || Boolean(filter.id)}
                    required
                    maxLength={40}
                    details={
                      filter.id
                        ? t(
                            "Este identificador se conserva para mantener los atributos guardados.",
                          )
                        : t(
                            "Se adapta automáticamente: Ocasión → ocasion, Tipos de fiesta → tipos_de_fiesta. Después de guardar se conserva.",
                          )
                    }
                    error={
                      saveAttempted && keyErrors[index]
                        ? t(keyErrors[index]!)
                        : undefined
                    }
                    onInput={(event) =>
                      changeFilter(index, { key: event.currentTarget.value })
                    }
                    onBlur={(event) => {
                      if (!filter.id)
                        changeFilter(index, {
                          key: normalizeFilterKey(event.currentTarget.value),
                        });
                    }}
                  />
                </s-grid>
                <s-heading>{t("Opciones disponibles")}</s-heading>
                <s-paragraph color="subdued">
                  {t(
                    "Las etiquetas se pueden renombrar. Los valores guardados se conservan para mantener las asignaciones de artículos.",
                  )}
                </s-paragraph>
                <s-select
                  label={t("Mostrar este filtro después de")}
                  value={filter.parentKey ?? ""}
                  disabled={disabled}
                  onChange={(event) =>
                    changeFilter(index, {
                      parentKey: event.currentTarget.value || null,
                      parentValues: [],
                    })
                  }
                >
                  <s-option value="">{t("Siempre visible")}</s-option>
                  {draft.filters.slice(0, index).map((parent, parentIndex) => (
                    <s-option
                      key={parent.id ?? parentIndex}
                      value={normalizedKeys[parentIndex]}
                    >
                      {parent.label ||
                        t("Filtro {{v0}}", { v0: parentIndex + 1 })}
                    </s-option>
                  ))}
                </s-select>
                {filter.parentKey && (
                  <s-choice-list
                    label={t("Mostrar al seleccionar alguna de estas opciones")}
                    multiple
                    disabled={disabled}
                    onChange={(event) =>
                      changeFilter(index, {
                        parentValues: event.currentTarget.values,
                      })
                    }
                  >
                    {draft.filters
                      .find(
                        (parent, parentIndex) =>
                          normalizedKeys[parentIndex] === filter.parentKey,
                      )
                      ?.options.map((option, optionIndex) => (
                        <s-choice
                          key={option.id ?? optionIndex}
                          value={option.value}
                          selected={filter.parentValues?.includes(option.value)}
                        >
                          {option.label || option.value}
                        </s-choice>
                      ))}
                  </s-choice-list>
                )}
                {filter.source === "tag" && (
                  <s-paragraph color="subdued">
                    {t(
                      "El valor de cada opción debe coincidir con una etiqueta del artículo. Sincroniza desde Artículos después de cambiar etiquetas en Shopify.",
                    )}
                  </s-paragraph>
                )}
                {filter.options.map((option, optionIndex) => (
                  <s-box
                    key={option.id ?? `new-option-${optionIndex}`}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack gap="small">
                      <s-grid
                        gridTemplateColumns="@container (inline-size <= 480px) 1fr, 1fr 1fr auto"
                        gap="base"
                        alignItems="end"
                      >
                        <s-text-field
                          label={t("Etiqueta de opción {{v0}}", {
                            v0: optionIndex + 1,
                          })}
                          value={option.label}
                          disabled={disabled}
                          maxLength={100}
                          onInput={(event) =>
                            changeFilter(index, {
                              options: filter.options.map((item, i) =>
                                i === optionIndex
                                  ? {
                                      ...item,
                                      label: event.currentTarget.value,
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                        <s-text-field
                          label={t("Valor de opción {{v0}}", {
                            v0: optionIndex + 1,
                          })}
                          value={option.value}
                          disabled={disabled || Boolean(option.id)}
                          maxLength={255}
                          onInput={(event) =>
                            changeFilter(index, {
                              options: filter.options.map((item, i) =>
                                i === optionIndex
                                  ? {
                                      ...item,
                                      value: event.currentTarget.value,
                                    }
                                  : item,
                              ),
                            })
                          }
                        />
                        <s-button
                          tone="critical"
                          disabled={
                            disabled ||
                            Boolean(option.id && inUse.includes(option.id))
                          }
                          accessibilityLabel={t("Quitar opción {{v0}}", {
                            v0: option.label || optionIndex + 1,
                          })}
                          onClick={() =>
                            changeFilter(index, {
                              options: filter.options.filter(
                                (_, i) => i !== optionIndex,
                              ),
                            })
                          }
                        >
                          {t("Quitar")}
                        </s-button>
                      </s-grid>
                      {option.id && inUse.includes(option.id) && (
                        <s-text color="subdued">
                          {t(
                            "En uso: quita primero sus asignaciones desde Artículos.",
                          )}
                        </s-text>
                      )}
                      <s-stack direction="inline" gap="small">
                        <s-button
                          variant="tertiary"
                          disabled={disabled || optionIndex === 0}
                          accessibilityLabel={t("Subir opción {{v0}}", {
                            v0: option.label,
                          })}
                          onClick={() => {
                            const options = [...filter.options];
                            [options[optionIndex - 1], options[optionIndex]] = [
                              options[optionIndex],
                              options[optionIndex - 1],
                            ];
                            changeFilter(index, { options });
                          }}
                        >
                          {t("Subir opción")}
                        </s-button>
                        <s-button
                          variant="tertiary"
                          disabled={
                            disabled ||
                            optionIndex === filter.options.length - 1
                          }
                          accessibilityLabel={t("Bajar opción {{v0}}", {
                            v0: option.label,
                          })}
                          onClick={() => {
                            const options = [...filter.options];
                            [options[optionIndex + 1], options[optionIndex]] = [
                              options[optionIndex],
                              options[optionIndex + 1],
                            ];
                            changeFilter(index, { options });
                          }}
                        >
                          {t("Bajar opción")}
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-box>
                ))}
                <s-button
                  disabled={disabled || filter.options.length >= 200}
                  onClick={() =>
                    changeFilter(index, {
                      options: [...filter.options, { label: "", value: "" }],
                    })
                  }
                >
                  {t("Añadir opción")}
                </s-button>
              </s-stack>
            </s-section>
          ))}
          <s-stack direction="inline" gap="base">
            <s-button
              disabled={disabled || draft.filters.length >= 10}
              onClick={() =>
                setDraft({
                  ...draft,
                  filters: [
                    ...draft.filters,
                    { key: "", label: "", options: [] },
                  ],
                })
              }
            >
              {t("Añadir filtro")}
            </s-button>
            <s-button
              variant="primary"
              type="submit"
              loading={saving}
              disabled={disabled || !blogs.length}
            >
              {t("Guardar conjunto")}
            </s-button>
            {setId && (
              <s-button href={`/app/articles?filterSetId=${setId}`}>
                {t("Gestionar artículos")}
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </form>
    </s-page>
  );
}
