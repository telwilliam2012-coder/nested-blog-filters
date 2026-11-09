import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { handleStorefrontFiltersRequest } from "../services/storefront-filters.server";
import { authenticate } from "../shopify.server";
import { getVerifiedStorefrontPlan } from "../services/billing.server";

export function loader({ request }: LoaderFunctionArgs) {
  return handleStorefrontFiltersRequest(
    request,
    authenticate.public.appProxy,
    undefined,
    getVerifiedStorefrontPlan,
  );
}

export function action({ request }: ActionFunctionArgs) {
  return handleStorefrontFiltersRequest(
    request,
    authenticate.public.appProxy,
    undefined,
    getVerifiedStorefrontPlan,
  );
}
