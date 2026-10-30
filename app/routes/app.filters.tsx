import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

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
  const { sets } = useLoaderData<typeof loader>();
  return (
    <s-page heading="Conjuntos de filtros">
      <s-button slot="primary-action" variant="primary" href="/app/filters/new">
        Crear conjunto
      </s-button>
      <s-section heading="Tus conjuntos">
        {sets.length === 0 ? (
          <s-stack gap="base">
            <s-heading>Crea los filtros de tu primer blog</s-heading>
            <s-paragraph>
              Define categorías como motivo, ocasión o diseño y después asigna
              sus opciones a tus artículos.
            </s-paragraph>
            <s-button variant="primary" href="/app/filters/new">
              Crear conjunto
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
                    <s-badge>{set._count.filters} filtros</s-badge>
                    <s-badge>{set._count.articles} artículos guardados</s-badge>
                    {set.sync && (
                      <s-badge tone="warning">Importación en curso</s-badge>
                    )}
                  </s-stack>
                  <s-stack direction="inline" gap="small">
                    <s-button href={`/app/filters/${set.id}`}>
                      Editar filtros
                    </s-button>
                    <s-button href={`/app/articles?filterSetId=${set.id}`}>
                      Gestionar artículos
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
