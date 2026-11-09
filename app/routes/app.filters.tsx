import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { getFilterPlanUsage } from "../services/filter-admin.server";
import { authenticatePaidAdmin } from "../services/billing.server";
import { useAdminI18n } from "../i18n/admin-i18n";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, planAccess } = await authenticatePaidAdmin(request);
  const usage = await getFilterPlanUsage(session.shop, planAccess);
  const sets = await prisma.filterSet.findMany({
    where: { shop: session.shop },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      _count: { select: { filters: true, articles: true } },
      sync: { select: { id: true } },
    },
  });
  return { sets, planAccess, usage };
}

export default function FiltersPage() {
  const { t } = useAdminI18n();
  const { sets, planAccess, usage } = useLoaderData<typeof loader>();
  return (
    <s-page heading={t("Conjuntos de filtros")}>
      <s-button
        slot="primary-action"
        variant="primary"
        href="/app/filters/new"
        disabled={!usage.canCreate}
      >
        {t("Crear conjunto")}
      </s-button>
      {!usage.canCreate && (
        <s-banner heading={t("Límite de blogs del plan")} tone="warning">
          <s-paragraph>
            {t(
              "Pro incluye un blog activo. Los demás conjuntos se conservan, pero no se muestran en la tienda hasta cambiar a Premium.",
            )}
          </s-paragraph>
          <s-button href="/app/billing">{t("Ver planes")}</s-button>
        </s-banner>
      )}
      <s-section heading={t("Tus conjuntos")}>
        {sets.length === 0 ? (
          <s-stack gap="base">
            <s-heading>{t("Crea los filtros de tu primer blog")}</s-heading>
            <s-paragraph>
              {t(
                "Define categorías como motivo, ocasión o diseño y después asigna sus opciones a tus artículos.",
              )}
            </s-paragraph>
            <s-button variant="primary" href="/app/filters/new">
              {t("Crear conjunto")}
            </s-button>
          </s-stack>
        ) : (
          <s-stack gap="base">
            {sets.map((set) => (
              <s-box
                key={set.id}
                padding="base"
                border="base"
                borderRadius="base"
              >
                <s-stack gap="base">
                  <s-heading>{set.name}</s-heading>
                  <s-stack direction="inline" gap="small">
                    <s-badge>
                      {t("{{v0}} filtros", { v0: set._count.filters })}
                    </s-badge>
                    {usage.activeFilterSetIds !== null &&
                      !usage.activeFilterSetIds.includes(set.id) && (
                        <s-badge tone="warning">
                          {t("Inactivo en la tienda por el plan")}
                        </s-badge>
                      )}
                    {set._count.filters > planAccess.maxFilters && (
                      <s-badge tone="warning">
                        {t("Filtros extra conservados e inactivos")}
                      </s-badge>
                    )}
                    <s-badge>
                      {t("{{v0}} artículos guardados", {
                        v0: set._count.articles,
                      })}
                    </s-badge>
                    {set.sync && (
                      <s-badge tone="warning">
                        {t("Importación en curso")}
                      </s-badge>
                    )}
                  </s-stack>
                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/filters/${set.id}`}>
                      {t("Editar filtros")}
                    </s-button>
                    <s-button href={`/app/articles?filterSetId=${set.id}`}>
                      {t("Gestionar artículos")}
                    </s-button>
                  </s-stack>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
