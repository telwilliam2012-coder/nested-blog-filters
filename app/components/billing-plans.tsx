import {
  APP_BILLING_PLAN_NAMES,
  APP_BILLING_PLANS,
  type AppBillingPlanName,
} from "../billing-plans";
import { useAdminI18n } from "../i18n/admin-i18n";

export function BillingPlanPicker({
  isTest,
  manualTest = false,
  pending = false,
  pendingPlan,
  currentPlan = null,
  error,
  errorDetails,
  onChoose,
}: {
  isTest: boolean;
  manualTest?: boolean;
  pending?: boolean;
  pendingPlan?: string;
  currentPlan?: AppBillingPlanName | null;
  error?: string;
  errorDetails?: string[];
  onChoose: (plan: AppBillingPlanName) => void;
}) {
  const { t, locale } = useAdminI18n();
  return (
    <s-page heading={t("Elige tu plan")}>
      <s-stack gap="large">
        <s-paragraph>
          {t(
            "Selecciona un plan para activar Nested Blog Filters. Shopify te mostrará el importe y te pedirá aprobar la suscripción.",
          )}
        </s-paragraph>
        {isTest && (
          <s-banner
            heading={
              manualTest
                ? t("Suscripción de prueba")
                : t("Confirmación en Shopify")
            }
            tone="info"
          >
            {manualTest
              ? t(
                  "Estás en modo de prueba. Esta suscripción no genera cobros reales.",
                )
              : t(
                  "Las condiciones de prueba y los posibles cargos se muestran en Shopify antes de aprobar el plan.",
                )}
          </s-banner>
        )}
        {error && (
          <s-banner
            heading={t("No se pudo iniciar la suscripción")}
            tone="critical"
          >
            {t(error)}
            {errorDetails && errorDetails.length > 0 && (
              <s-unordered-list>
                {errorDetails.map((detail, index) => (
                  <s-list-item key={index}>{t(detail)}</s-list-item>
                ))}
              </s-unordered-list>
            )}
          </s-banner>
        )}
        <s-grid
          gridTemplateColumns="repeat(auto-fit, minmax(min(100%, 240px), 1fr))"
          gap="base"
        >
          {APP_BILLING_PLAN_NAMES.map((name) => {
            const plan = APP_BILLING_PLANS[name];
            const amount = new Intl.NumberFormat(locale, {
              style: "currency",
              currency: plan.currencyCode,
              currencyDisplay: "code",
            }).format(plan.amount);
            const annualAmount = new Intl.NumberFormat(locale, {
              style: "currency",
              currency: plan.currencyCode,
              currencyDisplay: "code",
            }).format(plan.annualAmount);
            return (
              <s-section key={name} heading={name}>
                <s-stack gap="base">
                  {currentPlan === name && (
                    <s-badge tone="success">{t("Plan actual")}</s-badge>
                  )}
                  <s-heading>{amount}</s-heading>
                  <s-paragraph>
                    {t("Cada {{days}} días", { days: plan.intervalDays })}
                  </s-paragraph>
                  {!manualTest && (
                    <s-paragraph>
                      {t("O {{amount}} al año", { amount: annualAmount })}
                    </s-paragraph>
                  )}
                  <s-paragraph>
                    {t("{{days}} días de prueba gratis", {
                      days: plan.trialDays,
                    })}
                  </s-paragraph>
                  <s-unordered-list>
                    {plan.features.map((feature) => (
                      <s-list-item key={feature}>{t(feature)}</s-list-item>
                    ))}
                  </s-unordered-list>
                  <s-button
                    variant="primary"
                    disabled={pending}
                    loading={pending && pendingPlan === name}
                    onClick={() => onChoose(name)}
                  >
                    {currentPlan === name
                      ? t("Gestionar plan")
                      : t("Elegir {{plan}}", { plan: name })}
                  </s-button>
                </s-stack>
              </s-section>
            );
          })}
        </s-grid>
        {!manualTest && (
          <s-paragraph>
            {t(
              "Los precios y los días de prueba se confirman en la página de planes de Shopify.",
            )}
          </s-paragraph>
        )}
        <s-paragraph>
          {t(
            "El acceso se activa después de aprobar la suscripción en Shopify.",
          )}
        </s-paragraph>
        <s-link href="/app/help">{t("Ayuda")}</s-link>
      </s-stack>
    </s-page>
  );
}
