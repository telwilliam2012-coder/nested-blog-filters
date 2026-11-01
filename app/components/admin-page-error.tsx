import { isRouteErrorResponse, useRouteError } from "react-router";
import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAdminI18n } from "../i18n/admin-i18n";

export function AdminPageError() {
  const error = useRouteError();
  const { t } = useAdminI18n();
  if (
    isRouteErrorResponse(error) &&
    (error.status < 400 || [401, 403, 410].includes(error.status))
  ) {
    return boundary.error(error);
  }
  const message =
    isRouteErrorResponse(error) && typeof error.data === "string"
      ? error.data
      : "No se pudo completar la operación. Recarga la página y vuelve a intentarlo.";
  return (
    <s-page heading={t("No se pudo completar la operación")}>
      <s-section>
        <s-banner tone="critical" heading={t("Reintentar")}>
          <s-paragraph>{t(message)}</s-paragraph>
        </s-banner>
        <s-button href="/app">{t("Inicio")}</s-button>
      </s-section>
    </s-page>
  );
}

export const adminHeaders: HeadersFunction = (args) => boundary.headers(args);
