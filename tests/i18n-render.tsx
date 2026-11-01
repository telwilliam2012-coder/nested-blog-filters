import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  Outlet,
  StaticRouterProvider,
} from "react-router";
import { AdminI18nProvider } from "../app/i18n/admin-i18n";
import type { AdminLocale } from "../app/i18n/locale";
import { BlogHome } from "../app/components/blog-home";
import { FilterSetEditor } from "../app/components/filter-set-editor";
import { ArticleManager } from "../app/components/article-manager";
import { AdminPageError } from "../app/components/admin-page-error";
export { adminHeaders } from "../app/components/admin-page-error";

export async function renderAdminViews(locale: AdminLocale) {
  const editor = {
    initial: {
      name: "Mi conjunto",
      blogId: "blog",
      revision: 0,
      filters: [
        {
          key: "motivo",
          label: "Mi categoría",
          source: "tag",
          options: [{ value: "Navidad", label: "Mi Navidad" }],
        },
      ],
    },
    blogs: [{ id: "blog", title: "Mi blog" }],
    saving: false,
    onSave: () => {},
  } satisfies ComponentProps<typeof FilterSetEditor>;
  const manager = {
    sets: [{ id: "set", name: "Mi conjunto" }],
    loadError: null,
    management: {
      set: {
        id: "set",
        revision: 0,
        sync: null,
        filters: [
          {
            id: "filter",
            key: "motivo",
            label: "Mi categoría",
            source: "tag",
            options: [{ id: "option", value: "Navidad", label: "Mi Navidad" }],
          },
        ],
      },
      articles: [],
      total: 0,
      page: 1,
      totalPages: 0,
    },
  } as unknown as ComponentProps<typeof ArticleManager>;
  const handler = createStaticHandler([
    {
      path: "/app",
      element: (
        <AdminI18nProvider shop="test.myshopify.com" initialLocale={locale}>
          <BlogHome
            overview={null}
            shop="test.myshopify.com"
            filters={{
              sets: [],
              totals: {
                filterSets: 0,
                filters: 0,
                options: 0,
                articles: 10000,
              },
            }}
            refreshing={false}
            onRefresh={() => {}}
          />
          <FilterSetEditor {...editor} />
          <ArticleManager {...manager} />
        </AdminI18nProvider>
      ),
    },
  ]);
  const context = await handler.query(new Request("http://localhost/app"));
  if (context instanceof Response)
    throw new Error("Admin views did not render.");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StaticRouterProvider router={router} context={context} hydrate={false} />,
  );
}

export async function renderAdminResponse(
  locale: AdminLocale,
  status: number,
  message: string,
) {
  const handler = createStaticHandler([
    {
      path: "/app",
      element: (
        <AdminI18nProvider initialLocale={locale} shop="test.myshopify.com">
          <Outlet />
        </AdminI18nProvider>
      ),
      children: [
        {
          index: true,
          element: <div />,
          loader: () => {
            throw new Response(message, { status });
          },
          ErrorBoundary: AdminPageError,
        },
      ],
    },
  ]);
  const context = await handler.query(new Request("http://localhost/app"));
  if (context instanceof Response)
    throw new Error("Expected a rendered response boundary.");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StaticRouterProvider router={router} context={context} hydrate={false} />,
  );
}
