import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { AdminI18nProvider } from "../i18n/admin-i18n";
import { AdminNavigation } from "../components/admin-navigation";
import { requestAdminLocale } from "../i18n/locale";
import { AdminSupportProvider } from "../components/admin-support";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session.shop,
    locale: requestAdminLocale(request),
  };
};

export default function App() {
  const { apiKey, shop, locale } = useLoaderData<typeof loader>();

  return (
    <AppProvider apiKey={apiKey}>
      <AdminI18nProvider key={shop} shop={shop} initialLocale={locale}>
        <AdminSupportProvider shop={shop}>
          <AdminNavigation />
          <Outlet />
        </AdminSupportProvider>
      </AdminI18nProvider>
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
