import { renderToString } from "react-dom/server";
import { AdminI18nProvider } from "../app/i18n/admin-i18n";
import type { AdminLocale } from "../app/i18n/locale";
import { HelpContents } from "../app/components/help-content";
import { SupportContactForm } from "../app/components/support-contact-form";

export function renderSupport(locale: AdminLocale) {
  return renderToString(
    <AdminI18nProvider shop="one.myshopify.com" initialLocale={locale}>
      <HelpContents />
      <SupportContactForm
        shop="one.myshopify.com"
        pathname="/app/filters/example"
      />
    </AdminI18nProvider>,
  );
}
