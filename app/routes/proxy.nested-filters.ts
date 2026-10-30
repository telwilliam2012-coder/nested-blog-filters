import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

import { handleStorefrontFiltersRequest } from "../services/storefront-filters.server";
import { authenticate } from "../shopify.server";

export function loader({ request }: LoaderFunctionArgs) {
  return handleStorefrontFiltersRequest(request, authenticate.public.appProxy);
}

export function action({ request }: ActionFunctionArgs) {
  return handleStorefrontFiltersRequest(request, authenticate.public.appProxy);
}
