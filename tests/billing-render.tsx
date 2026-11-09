import { renderToString } from "react-dom/server";
import { BillingPlanPicker } from "../app/components/billing-plans";
import { AdminI18nProvider } from "../app/i18n/admin-i18n";
import type { AdminLocale } from "../app/i18n/locale";
import type { AppBillingPlanName } from "../app/billing-plans";

export function renderBillingPlans(
  locale: AdminLocale,
  currentPlan: AppBillingPlanName | null = null,
) {
  return renderToString(
    <AdminI18nProvider shop="billing-test.myshopify.com" initialLocale={locale}>
      <BillingPlanPicker isTest currentPlan={currentPlan} onChoose={() => {}} />
    </AdminI18nProvider>,
  );
}
