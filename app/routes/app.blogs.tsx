import type { LoaderFunctionArgs } from "react-router";

import { useLoaderData } from "react-router";

import { TitleBar } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useAdminI18n } from "../i18n/admin-i18n";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

type ShopifyBlog = {
  id: string;
  title: string;
  handle: string;
};

type BlogsGraphQLResponse = {
  data?: {
    blogs: {
      nodes: ShopifyBlog[];
      pageInfo: {
        hasNextPage: boolean;
      };
    };
  };

  errors?: Array<{
    message: string;
  }>;
};

// ----------------------------------
// SERVER LOADER
// ----------------------------------

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(`
    #graphql

    query GetBlogs {
      blogs(first: 25) {
        nodes {
          id
          title
          handle
        }

        pageInfo {
          hasNextPage
        }
      }
    }
  `);

  const result = (await response.json()) as BlogsGraphQLResponse;

  if (!result.data?.blogs) {
    const message =
      result.errors?.map((error) => error.message).join("; ") ??
      "No se pudieron consultar los blogs.";

    throw new Response(message, {
      status: 502,
    });
  }

  const sets = await prisma.filterSet.findMany({
    where: { shop: session.shop },
    select: { id: true, blogId: true },
  });
  return {
    blogs: result.data.blogs.nodes,
    hasMore: result.data.blogs.pageInfo.hasNextPage,
    sets: Object.fromEntries(sets.map((set) => [set.blogId, set.id])),
  };
}

// ----------------------------------
// REACT COMPONENT
// ----------------------------------

export default function BlogsPage() {
  const { t } = useAdminI18n();
  const { blogs, hasMore, sets } = useLoaderData<typeof loader>();

  return (
    <s-page>
      <TitleBar title={t("Blogs de Shopify")} />

      <s-section heading={t("Blogs disponibles")}>
        <s-paragraph>
          {t("Se encontraron {{v0}} blogs en esta consulta.", {
            v0: blogs.length,
          })}
        </s-paragraph>

        {blogs.length === 0 ? (
          <s-paragraph>{t("No hay blogs disponibles.")}</s-paragraph>
        ) : (
          <s-unordered-list>
            {blogs.map((blog) => (
              <s-list-item key={blog.id}>
                {blog.title} ({blog.handle})
                <s-stack direction="inline" gap="small">
                  <s-button
                    href={
                      sets[blog.id]
                        ? `/app/filters/${sets[blog.id]}`
                        : `/app/filters/new?blogId=${encodeURIComponent(blog.id)}`
                    }
                  >
                    {sets[blog.id] ? t("Editar filtros") : t("Crear filtros")}
                  </s-button>
                  {sets[blog.id] && (
                    <s-button
                      href={`/app/articles?filterSetId=${sets[blog.id]}`}
                    >
                      {t("Gestionar artículos")}
                    </s-button>
                  )}
                </s-stack>
              </s-list-item>
            ))}
          </s-unordered-list>
        )}

        {hasMore && (
          <s-paragraph>
            {t(
              "Existen más blogs. Incorporaremos paginación en el siguiente paso.",
            )}
          </s-paragraph>
        )}
      </s-section>
    </s-page>
  );
}
