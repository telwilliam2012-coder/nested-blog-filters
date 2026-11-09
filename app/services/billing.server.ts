import { data } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getPlanAccess,
  isAppBillingPlan,
  PREMIUM_PLAN,
  PRO_PLAN,
  type AppBillingPlanName,
  type AppPlanAccess,
} from "../billing-plans";
import { describeBillingFailure } from "./billing-errors.server";
import {
  manualTestBillingEnabled,
  requestTestSubscription,
} from "./billing-test.server";
import {
  managedPricingVerificationEnabled,
  ManagedPricingVerificationError,
  verifyManagedPricing,
} from "./managed-pricing.server";

type AdminAuthenticator = typeof authenticate.admin;
type AdminContext = Awaited<ReturnType<AdminAuthenticator>>;
type SubscriptionRecord = {
  name?: unknown;
  status?: unknown;
  test?: unknown;
};

function verifiedPlanName(value: unknown): AppBillingPlanName | null {
  if (typeof value !== "string") return null;
  switch (value.trim().toLowerCase()) {
    case "pro":
      return PRO_PLAN;
    case "premium":
      return PREMIUM_PLAN;
    default:
      return null;
  }
}

function accessFromSubscriptions(
  subscriptions: SubscriptionRecord[],
  isTest: boolean,
): AppPlanAccess | null {
  let activePlan: AppBillingPlanName | null = null;
  for (const subscription of subscriptions) {
    if (
      !subscription ||
      subscription.status !== "ACTIVE" ||
      typeof subscription.test !== "boolean" ||
      (!isTest && subscription.test)
    )
      continue;
    const plan = verifiedPlanName(subscription.name);
    if (plan === PREMIUM_PLAN) return getPlanAccess(PREMIUM_PLAN);
    if (plan === PRO_PLAN) activePlan = PRO_PLAN;
  }
  return activePlan ? getPlanAccess(activePlan) : null;
}

async function verifiedAdminAccess(
  context: Pick<AdminContext, "billing" | "admin" | "session">,
): Promise<AppPlanAccess | null> {
  if (managedPricingVerificationEnabled()) {
    try {
      // Admin requests, including approval returns and plan management, always
      // refresh. A browser's plan_handle only prompts a fresh verification.
      return await verifyManagedPricing(context.admin, context.session.shop, {
        forceFresh: true,
      });
    } catch (error) {
      if (!(error instanceof ManagedPricingVerificationError)) throw error;
      throw new Response("No se pudo verificar el plan de la tienda.", {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  }
  // Read subscriptions before applying our allowlist. SDK `plans` compares names
  // literally and would discard lowercase names from a hosted pricing plan.
  const payment = await context.billing.check({ isTest: billingIsTest() });
  if (!payment.hasActivePayment) return null;
  return accessFromSubscriptions(payment.appSubscriptions, billingIsTest());
}

export function billingIsTest() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.SHOPIFY_BILLING_TEST === "true"
  );
}

export function billingPricingUrl(shop: string, appHandle: string) {
  if (
    !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) ||
    !/^[a-z0-9][a-z0-9_-]*$/i.test(appHandle)
  ) {
    throw new Error("Invalid Shopify hosted pricing configuration.");
  }
  const handle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${encodeURIComponent(handle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
}

export async function requireActiveBilling(
  context: Pick<AdminContext, "billing" | "redirect" | "admin" | "session">,
): Promise<AppPlanAccess> {
  const planAccess = await verifiedAdminAccess(context);
  if (!planAccess) {
    throw context.redirect("/app/billing");
  }
  return planAccess;
}

export async function authenticatePaidAdmin(
  request: Request,
  authenticateAdmin: AdminAuthenticator = authenticate.admin,
) {
  const context = await authenticateAdmin(request);
  const planAccess = await requireActiveBilling(context);
  return { ...context, planAccess };
}

// Production uses canonical Partner contracts. Local development retains its
// existing Admin API test integration unless explicitly opted into Partner.
export async function getVerifiedStorefrontPlan(
  admin: Pick<AdminContext["admin"], "graphql">,
  expectedShop: string,
): Promise<AppPlanAccess | null> {
  if (managedPricingVerificationEnabled())
    return verifyManagedPricing(admin, expectedShop);
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(expectedShop))
    throw new Error("The authenticated store could not be verified.");
  const response = await admin.graphql(`#graphql
    query VerifiedStorefrontPlan {
      currentAppInstallation {
        activeSubscriptions { name status test }
      }
    }
  `);
  const result = await response.json();
  const subscriptions =
    result.data?.currentAppInstallation?.activeSubscriptions;
  const errors = (result as { errors?: unknown[] }).errors;
  if (!response.ok || errors?.length || !Array.isArray(subscriptions)) {
    throw new Error("Shopify subscription status could not be verified.");
  }
  return accessFromSubscriptions(subscriptions, billingIsTest());
}

export async function loadBillingPlans(
  request: Request,
  authenticateAdmin: AdminAuthenticator = authenticate.admin,
) {
  const context = await authenticateAdmin(request);
  const isTest = billingIsTest();
  const currentAccess = await verifiedAdminAccess(context);
  return {
    isTest,
    manualTest: manualTestBillingEnabled(),
    currentPlan: currentAccess?.plan ?? null,
  };
}

export async function requestBillingPlan(
  request: Request,
  authenticateAdmin: AdminAuthenticator = authenticate.admin,
) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const context = await authenticateAdmin(request);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return data({ error: "Selecciona un plan válido." }, { status: 400 });
  }
  const plan = form.get("plan");
  if (!isAppBillingPlan(plan)) {
    return data({ error: "Selecciona un plan válido." }, { status: 400 });
  }
  try {
    const currentAccess = await verifiedAdminAccess(context);

    if (manualTestBillingEnabled()) {
      if (currentAccess?.plan === plan) throw context.redirect("/app");
      return await requestTestSubscription(context, plan);
    }

    // The configured pricing-page handle is authoritative. Unpublished apps
    // can have a null Admin API handle, so only query it as a fallback.
    let appHandle = process.env.SHOPIFY_APP_HANDLE?.trim();
    if (!appHandle) {
      const response = await context.admin.graphql(`#graphql
        query BillingHostedPricingApp {
          currentAppInstallation {
            app { handle }
          }
        }
      `);
      const result = await response.json();
      appHandle = result.data?.currentAppInstallation?.app?.handle;
    }
    if (!appHandle) {
      return data(
        {
          error:
            "No se encontró el identificador de la página de planes. Configura SHOPIFY_APP_HANDLE con el handle de la app en Shopify.",
        },
        { status: 503 },
      );
    }
    // Keep the SDK's App Bridge response intact to navigate outside the iframe.
    throw context.redirect(billingPricingUrl(context.session.shop, appHandle), {
      target: "_top",
    });
  } catch (error) {
    if (!(error instanceof Response)) {
      console.error("Billing plan request failed.", {
        plan,
        ...describeBillingFailure(error).diagnostic,
      });
    }
    throw error;
  }
}
