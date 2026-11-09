export const PRO_PLAN = "Pro";
export const PREMIUM_PLAN = "Premium";

// Display terms for Shopify's hosted plans. Shopify approves the subscription
// and owns the actual price, billing period, trial, and charges.
export const APP_BILLING_PLANS = {
  [PRO_PLAN]: {
    handle: "pro",
    amount: 4.99,
    annualAmount: 40.99,
    currencyCode: "USD",
    intervalDays: 30,
    trialDays: 7,
    features: [
      "1 blog",
      "Hasta 3 filtros por blog",
      "Filtros anidados y búsqueda",
      "Edición individual de artículos",
      "Colores e idiomas personalizables",
    ],
  },
  [PREMIUM_PLAN]: {
    handle: "premium",
    amount: 9.99,
    annualAmount: 90.99,
    currencyCode: "USD",
    intervalDays: 30,
    trialDays: 7,
    features: [
      "Todos los blogs de la tienda",
      "Hasta 10 filtros por blog",
      "Filtros anidados y búsqueda",
      "Edición individual y masiva",
      "Estadísticas de visitas y uso",
      "Colores e idiomas personalizables",
    ],
  },
} as const;

export const APP_BILLING_PLAN_NAMES = [PRO_PLAN, PREMIUM_PLAN] as const;
export type AppBillingPlanName = (typeof APP_BILLING_PLAN_NAMES)[number];

export type AppPlanAccess = {
  plan: AppBillingPlanName;
  maxBlogs: number | null;
  maxFilters: number;
  bulkEditing: boolean;
  analytics: boolean;
};

export function getPlanAccess(plan: AppBillingPlanName): AppPlanAccess {
  if (!isAppBillingPlan(plan)) throw new Error("Unknown application plan.");
  return plan === PREMIUM_PLAN
    ? {
        plan,
        maxBlogs: null,
        maxFilters: 10,
        bulkEditing: true,
        analytics: true,
      }
    : {
        plan,
        maxBlogs: 1,
        maxFilters: 3,
        bulkEditing: false,
        analytics: false,
      };
}

// Forms use canonical names. Verified Shopify names are normalized on the server.
export function isAppBillingPlan(value: unknown): value is AppBillingPlanName {
  return value === PRO_PLAN || value === PREMIUM_PLAN;
}
