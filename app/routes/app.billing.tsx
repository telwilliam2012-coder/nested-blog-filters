import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  useActionData,
  useLoaderData,
  useLocation,
  useNavigation,
  useSubmit,
} from "react-router";
import { BillingPlanPicker } from "../components/billing-plans";
import { billingActionPath } from "../billing-navigation";
import { describeBillingFailure } from "../services/billing-errors.server";
import {
  loadBillingPlans,
  requestBillingPlan,
} from "../services/billing.server";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  return data(await loadBillingPlans(request), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    return await requestBillingPlan(request);
  } catch (error) {
    if (error instanceof Response) throw error;
    const failure = describeBillingFailure(error);
    return data(
      { error: failure.error, details: failure.details },
      {
        status: failure.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}

export default function BillingPage() {
  const { isTest, manualTest, currentPlan, pricingUrl } =
    useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const location = useLocation();
  const submit = useSubmit();
  return (
    <BillingPlanPicker
      isTest={isTest}
      manualTest={manualTest}
      currentPlan={currentPlan}
      pricingUrl={pricingUrl}
      pending={navigation.state !== "idle"}
      pendingPlan={String(navigation.formData?.get("plan") ?? "")}
      error={result?.error}
      errorDetails={
        result && "details" in result && Array.isArray(result.details)
          ? result.details
          : undefined
      }
      onChoose={(plan) =>
        submit(
          { plan },
          { method: "post", action: billingActionPath(location.search) },
        )
      }
    />
  );
}
