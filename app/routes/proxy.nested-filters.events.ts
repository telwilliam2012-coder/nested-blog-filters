import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getVerifiedStorefrontPlan } from "../services/billing.server";
import { handleAnalyticsRequest } from "../services/analytics.server";

export const loader = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } });

export function action({ request }: ActionFunctionArgs) {
  return handleAnalyticsRequest(
    request,
    authenticate.public.appProxy,
    getVerifiedStorefrontPlan,
  );
}
