import { useAdminI18n } from "../i18n/admin-i18n";
import { HelpContents } from "../components/help-content";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export default function HelpPage() {
  const { t } = useAdminI18n();
  return (
    <s-page heading={t("Ayuda y documentación")}>
      <HelpContents />
    </s-page>
  );
}
