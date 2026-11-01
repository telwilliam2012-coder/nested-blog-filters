import { useAdminI18n } from "../i18n/admin-i18n";

export default function AdditionalPage() {
  const { t } = useAdminI18n();
  return (
    <s-page heading={t("Additional page")}>
      <s-section heading={t("Multiple pages")}>
        <s-paragraph>
          {t(
            "The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using",
          )}{" "}
          <s-link
            href="https://shopify.dev/docs/apps/tools/app-bridge"
            target="_blank"
          >
            {t("App Bridge")}
          </s-link>
          .
        </s-paragraph>
        <s-paragraph>
          {t(
            "To create your own page and have it show up in the app navigation, add a page inside",
          )}{" "}
          <code>app/routes</code>
          {t(", and a link to it in the")} <code>&lt;ui-nav-menu&gt;</code>{" "}
          {t("component found in")} <code>app/routes/app.jsx</code>.
        </s-paragraph>
      </s-section>
      <s-section slot="aside" heading={t("Resources")}>
        <s-unordered-list>
          <s-list-item>
            <s-link
              href="https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav"
              target="_blank"
            >
              {t("App nav best practices")}
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}
