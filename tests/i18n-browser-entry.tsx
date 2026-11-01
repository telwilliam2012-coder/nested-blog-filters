import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { AdminI18nProvider, useAdminI18n } from "../app/i18n/admin-i18n";
import { normalizeAdminLocale } from "../app/i18n/locale";
import { AdminNavigation } from "../app/components/admin-navigation";
import { FilterHome } from "../app/components/filter-home";
import { FilterSetEditor } from "../app/components/filter-set-editor";
import { ArticleManager } from "../app/components/article-manager";
import { AdminSupportProvider } from "../app/components/admin-support";
import { HelpContents } from "../app/components/help-content";

class ValueElement extends HTMLElement {
  get value() {
    return this.getAttribute("value") ?? "";
  }
  set value(value: string) {
    this.setAttribute("value", value);
  }
}
customElements.define("s-select", class extends ValueElement {});
customElements.define("s-text-field", class extends ValueElement {});
customElements.define("s-email-field", class extends ValueElement {});
customElements.define("s-text-area", class extends ValueElement {});
customElements.define(
  "s-button",
  class extends HTMLElement {
    connectedCallback() {
      this.tabIndex = 0;
      this.addEventListener("click", () => {
        if (this.getAttribute("type") === "submit")
          this.closest("form")?.requestSubmit();
      });
    }
  },
);
const params = new URL(location.href).searchParams;
const shop = params.get("shop") ?? "one.myshopify.com";
const initialLocale = normalizeAdminLocale(params.get("locale")) ?? "es";
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
const router = createMemoryRouter(
  [
    {
      path: "/app",
      element: (
        <AdminI18nProvider initialLocale={initialLocale} shop={shop}>
          <AdminSupportProvider shop={shop}>
            <div>
              <AdminNavigation />
              <Outlet />
            </div>
          </AdminSupportProvider>
        </AdminI18nProvider>
      ),
      children: [
        {
          index: true,
          element: (
            <FilterHome
              overview={{
                sets: [],
                totals: {
                  filterSets: 0,
                  filters: 0,
                  options: 0,
                  articles: 10000,
                },
              }}
              blogs={[]}
              refreshing={false}
              onRefresh={() => {}}
            />
          ),
        },
        {
          path: "filters",
          element: (
            <FilterSetEditor
              initial={{
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
              }}
              blogs={[{ id: "blog", title: "Mi blog" }]}
              saving={false}
              onSave={() => {}}
            />
          ),
        },
        { path: "articles", element: <ArticleManager {...manager} /> },
        { path: "help", element: <HelpFixturePage /> },
      ],
    },
  ],
  { initialEntries: ["/app"] },
);
document.addEventListener("click", (event) => {
  const link = (event.target as Element).closest("s-link[href]");
  if (link?.getAttribute("href")?.startsWith("/app")) {
    event.preventDefault();
    router.navigate(link.getAttribute("href")!);
  }
});
function HelpFixturePage() {
  const { t } = useAdminI18n();
  return (
    <s-page heading={t("Ayuda y documentación")} data-help-documentation>
      <HelpContents />
    </s-page>
  );
}
createRoot(document.querySelector("#root")!).render(
  <RouterProvider router={router} />,
);
