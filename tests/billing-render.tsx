import { renderToString } from "react-dom/server";
import { BillingPlanPicker } from "../app/components/billing-plans";
import { AdminI18nProvider } from "../app/i18n/admin-i18n";
import type { AdminLocale } from "../app/i18n/locale";
import type { AppBillingPlanName } from "../app/billing-plans";

export function renderBillingPlans(
  locale: AdminLocale,
  currentPlan: AppBillingPlanName | null = null,
  state: { manualTest?: boolean; pending?: boolean; pendingPlan?: string } = {},
) {
  return renderToString(
    <AdminI18nProvider shop="billing-test.myshopify.com" initialLocale={locale}>
      <BillingPlanPicker
        isTest
        currentPlan={currentPlan}
        pricingUrl="https://admin.shopify.com/store/billing-test/charges/nested-blog-filters/pricing_plans"
        {...state}
        onChoose={() => {}}
      />
    </AdminI18nProvider>,
  );
}
