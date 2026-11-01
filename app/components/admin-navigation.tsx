import { useAdminI18n } from "../i18n/admin-i18n";

export function AdminNavigation() {
  const { t } = useAdminI18n();
  return (
    <s-app-nav>
      <s-link href="/app">{t("Inicio")}</s-link>
      <s-link href="/app/blogs">{t("Blogs")}</s-link>
      <s-link href="/app/filters">{t("Filtros")}</s-link>
      <s-link href="/app/articles">{t("Artículos")}</s-link>
      <s-link href="/app/help">{t("Ayuda")}</s-link>
    </s-app-nav>
  );
}
