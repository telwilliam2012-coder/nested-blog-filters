import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { useAdminI18n } from "../i18n/admin-i18n";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
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
  return { sets };
}

export default function FiltersPage() {
  const { t } = useAdminI18n();
  const { sets } = useLoaderData<typeof loader>();
  return (
    <s-page heading={t("Conjuntos de filtros")}>
      <s-button slot="primary-action" variant="primary" href="/app/filters/new">
        {t("Crear conjunto")}
      </s-button>
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
