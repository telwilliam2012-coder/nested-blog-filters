import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router";
import { AdminI18nProvider } from "../app/i18n/admin-i18n";
import type { AdminLocale } from "../app/i18n/locale";
import { AnalyticsDashboard } from "../app/components/analytics-dashboard";
import type { AnalyticsReport } from "../app/services/analytics.server";

export async function renderAnalytics(
  locale: AdminLocale,
  premium: boolean,
  report: AnalyticsReport | null,
) {
  const handler = createStaticHandler([
    {
      path: "/app/analytics",
      element: (
        <AdminI18nProvider initialLocale={locale} shop="trusted.myshopify.com">
          <AnalyticsDashboard
            premium={premium}
            report={report}
            navigationContext={{ host: "trusted-host", embedded: "1", locale }}
          />
        </AdminI18nProvider>
      ),
    },
  ]);
  const context = await handler.query(
    new Request("https://app.invalid/app/analytics"),
  );
  if (context instanceof Response)
    throw new Error("Analytics fixture did not render.");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StaticRouterProvider router={router} context={context} hydrate={false} />,
  );
}
