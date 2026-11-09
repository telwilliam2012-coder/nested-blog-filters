import { Form } from "react-router";
import { useAdminI18n } from "../i18n/admin-i18n";
import type { getAnalyticsReport } from "../services/analytics.server";

type AnalyticsReport = Awaited<ReturnType<typeof getAnalyticsReport>>;

export function AnalyticsDashboard({
  report,
  premium,
  navigationContext = {},
}: {
  report: AnalyticsReport | null;
  premium: boolean;
  navigationContext?: Record<string, string>;
}) {
  const { t, locale, formatNumber } = useAdminI18n();
  const date = (day: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00Z`));

  if (!premium || !report) {
    return (
      <s-page heading={t("Estadísticas")}>
        <s-section heading={t("Conoce el uso de los filtros de tu blog")}>
          <s-stack gap="base">
            <s-badge tone="info">Premium</s-badge>
            <s-paragraph>
              {t(
                "Premium incluye vistas del blog, interacciones con filtros y búsquedas, con informes por blog y por día.",
              )}
            </s-paragraph>
            <s-paragraph>
              {t(
                "Las estadísticas se registran desde la activación de Premium y solo cuando el visitante permite el análisis.",
              )}
            </s-paragraph>
            <s-button variant="primary" href="/app/billing">
              {t("Ver Premium")}
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  const maxViews = Math.max(1, ...report.daily.map((row) => row.pageViews));
  const maxFilterInteractions = Math.max(
    1,
    ...report.topFilters.map((filter) => filter.interactions),
  );
  return (
    <s-page heading={t("Estadísticas")}>
      <s-button slot="secondary-actions" href="/app/billing">
        {t("Gestionar plan")}
      </s-button>
      <s-stack gap="large">
        <s-section heading={t("Actividad del blog")}>
          <s-stack gap="base">
            <Form method="get" action="/app/analytics">
              {Object.entries(navigationContext).map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
              <s-stack direction="inline" gap="base" alignItems="end">
                <s-select
                  name="days"
                  label={t("Periodo")}
                  value={String(report.range.days)}
                >
                  {[7, 30, 90].map((days) => (
                    <s-option key={days} value={String(days)}>
                      {t("Últimos {{days}} días", { days })}
                    </s-option>
                  ))}
                </s-select>
                <s-select
                  name="filterSetId"
                  label={t("Blog")}
                  value={report.selectedFilterSetId ?? ""}
                >
                  <s-option value="">{t("Todos los blogs")}</s-option>
                  {report.blogs.map((blog) => (
                    <s-option key={blog.id} value={blog.id}>
                      {blog.name}
                    </s-option>
                  ))}
                </s-select>
                <s-button type="submit" variant="primary">
                  {t("Aplicar")}
                </s-button>
              </s-stack>
            </Form>
            <s-paragraph color="subdued">
              {t("Del {{from}} al {{to}} · UTC", {
                from: date(report.range.from),
                to: date(report.range.to),
              })}
            </s-paragraph>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(min(100%, 180px), 1fr))"
              gap="base"
            >
              {[
                [t("Vistas del blog"), report.totals.pageViews],
                [
                  t("Interacciones con filtros"),
                  report.totals.filterInteractions,
                ],
                [t("Búsquedas enviadas"), report.totals.searchSubmissions],
              ].map(([label, value]) => (
                <s-box
                  key={label}
                  background="subdued"
                  borderRadius="base"
                  padding="base"
                >
                  <s-stack gap="small">
                    <s-text color="subdued">{label}</s-text>
                    <s-heading>{formatNumber(Number(value))}</s-heading>
                  </s-stack>
                </s-box>
              ))}
            </s-grid>
            <s-paragraph>
              {t(
                "Se cuentan páginas que contienen el bloque de filtros, no visitantes únicos ni todas las visitas de la tienda. Las interacciones y búsquedas cuentan acciones enviadas, no conversiones.",
              )}
            </s-paragraph>
            {!report.availableFrom && (
              <s-banner
                heading={t("Todavía no hay actividad registrada")}
                tone="info"
              >
                {t(
                  "Las estadísticas comienzan con las nuevas visitas que permiten el análisis. El editor de temas no genera estadísticas y no se importan visitas históricas.",
                )}
              </s-banner>
            )}
          </s-stack>
        </s-section>
        <s-section heading={t("Vistas por día")}>
          <svg
            role="img"
            aria-label={t("Vistas del blog por día en el periodo seleccionado")}
            viewBox="0 0 720 180"
            style={{ width: "100%", maxHeight: 240 }}
          >
            <line
              x1="0"
              y1="160"
              x2="720"
              y2="160"
              stroke="currentColor"
              opacity=".2"
            />
            {report.daily.map((row, index) => {
              const width = 720 / report.daily.length;
              const height = (row.pageViews / maxViews) * 140;
              return (
                <rect
                  key={row.day}
                  x={index * width + 1}
                  y={160 - height}
                  width={Math.max(1, width - 2)}
                  height={height}
                  rx="2"
                  fill="currentColor"
                  opacity=".75"
                >
                  <title>{`${date(row.day)}: ${formatNumber(row.pageViews)}`}</title>
                </rect>
              );
            })}
          </svg>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", textAlign: "left", borderSpacing: 12 }}
            >
              <caption>{t("Detalle diario")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("Día")}</th>
                  <th scope="col">{t("Vistas del blog")}</th>
                  <th scope="col">{t("Interacciones con filtros")}</th>
                  <th scope="col">{t("Búsquedas enviadas")}</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((row) => (
                  <tr key={row.day}>
                    <th scope="row">
                      <time dateTime={row.day}>{date(row.day)}</time>
                    </th>
                    <td>{formatNumber(row.pageViews)}</td>
                    <td>{formatNumber(row.filterInteractions)}</td>
                    <td>{formatNumber(row.searchSubmissions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
        <s-section heading={t("Filtros más utilizados")}>
          <s-stack gap="base">
            <s-paragraph>
              {t(
                "Los diez filtros con más interacciones en el periodo y blog seleccionados. Incluye cambios de selección y retiradas individuales.",
              )}
            </s-paragraph>
            {report.filterUsageAvailableFrom && (
              <s-paragraph color="subdued">
                {t("Primer uso de filtro registrado: {{date}}", {
                  date: date(report.filterUsageAvailableFrom),
                })}
              </s-paragraph>
            )}
            {report.topFilters.length === 0 ? (
              <s-paragraph>
                {t(
                  "Todavía no hay interacciones atribuidas a filtros. El ranking se construye con nuevos eventos; los totales anteriores no permiten reconstruirlo.",
                )}
              </s-paragraph>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderSpacing: 12,
                  }}
                >
                  <caption>{t("Interacciones por filtro")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Filtro")}</th>
                      <th scope="col">{t("Conjunto de filtros")}</th>
                      <th scope="col">{t("Interacciones con filtros")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.topFilters.map((filter) => (
                      <tr key={filter.filterId}>
                        <th scope="row">{filter.filterLabel}</th>
                        <td>{filter.filterSetName}</td>
                        <td>
                          {formatNumber(filter.interactions)}
                          <div
                            aria-hidden="true"
                            style={{
                              height: 6,
                              marginTop: 6,
                              background: "rgba(128,128,128,.15)",
                              borderRadius: 4,
                            }}
                          >
                            <div
                              style={{
                                width: `${(filter.interactions / maxFilterInteractions) * 100}%`,
                                height: "100%",
                                background: "currentColor",
                                borderRadius: 4,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <s-paragraph color="subdued">
              {t(
                "Limpiar todos los filtros cuenta en el total general, pero no se atribuye a un filtro concreto.",
              )}
            </s-paragraph>
          </s-stack>
        </s-section>
        <s-section heading={t("Resumen por blog")}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", textAlign: "left", borderSpacing: 12 }}
            >
              <thead>
                <tr>
                  <th scope="col">{t("Conjunto de filtros")}</th>
                  <th scope="col">{t("Vistas del blog")}</th>
                  <th scope="col">{t("Interacciones con filtros")}</th>
                  <th scope="col">{t("Búsquedas enviadas")}</th>
                </tr>
              </thead>
              <tbody>
                {report.blogs
                  .filter(
                    (blog) =>
                      !report.selectedFilterSetId ||
                      blog.id === report.selectedFilterSetId,
                  )
                  .map((blog) => (
                    <tr key={blog.id}>
                      <th scope="row">{blog.name}</th>
                      <td>{formatNumber(blog.pageViews)}</td>
                      <td>{formatNumber(blog.filterInteractions)}</td>
                      <td>{formatNumber(blog.searchSubmissions)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <s-paragraph color="subdued">
            {t("Datos diarios conservados durante 90 días. Zona horaria: UTC.")}
          </s-paragraph>
        </s-section>
      </s-stack>
    </s-page>
  );
}
