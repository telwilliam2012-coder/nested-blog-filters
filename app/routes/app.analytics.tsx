import type { LoaderFunctionArgs } from "react-router";
import { data, useLoaderData, useSearchParams } from "react-router";
import { AnalyticsDashboard } from "../components/analytics-dashboard";
import { authenticatePaidAdmin } from "../services/billing.server";
import {
  AnalyticsInputError,
  getAnalyticsReport,
} from "../services/analytics.server";

export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session, planAccess } = await authenticatePaidAdmin(request);
  const headers = { "Cache-Control": "private, no-store" };
  // Keep the upgrade page available without reading any Premium report data.
  if (!planAccess.analytics) {
    return data({ report: null, premium: false as const }, { headers });
  }
  const params = new URL(request.url).searchParams;
  try {
    const report = await getAnalyticsReport(session.shop, {
      days: Number(params.get("days") ?? 30),
      filterSetId: params.get("filterSetId") || undefined,
    });
    return data({ report, premium: true as const }, { headers });
  } catch (error) {
    if (error instanceof AnalyticsInputError) {
      throw data(error.message, { status: error.status, headers });
    }
    throw error;
  }
}

export default function AnalyticsPage() {
  const { report, premium } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const navigationContext = Object.fromEntries(
    ["shop", "host", "embedded", "locale"]
      .filter((key) => params.has(key))
      .map((key) => [key, params.get(key)!]),
  );
  return (
    <AnalyticsDashboard
      report={report}
      premium={premium}
      navigationContext={navigationContext}
    />
  );
}
