import { useState } from "react";
import { useAdminI18n } from "../i18n/admin-i18n";
import {
  SUPPORT_LIMITS,
  supportMailto,
  validateSupportDraft,
} from "../support/contact";
import type { SupportDraft } from "../support/contact";

const emptyDraft: SupportDraft = { subject: "", message: "", replyEmail: "" };

export function SupportContactForm({
  shop,
  pathname,
}: {
  shop: string;
  pathname: string;
}) {
  const { t, locale } = useAdminI18n();
  const [draft, setDraft] = useState(emptyDraft);
  const [attempted, setAttempted] = useState(false);
  const [prepared, setPrepared] = useState<{
    draft: SupportDraft;
    pathname: string;
  } | null>(null);
  const errors = validateSupportDraft(draft);
  const preparedHref = prepared
    ? supportMailto(
        prepared.draft,
        { shop, pathname: prepared.pathname, locale },
        t,
      )
    : null;
  function update(field: keyof SupportDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setPrepared(null);
  }
  return (
    <form
      noValidate
      data-support-form
      onSubmit={(event) => {
        event.preventDefault();
        setAttempted(true);
        if (Object.values(errors).some(Boolean)) return;
        const href = supportMailto(draft, { shop, pathname, locale }, t);
        setPrepared({ draft, pathname });
        try {
          window.open(href, "_blank", "noopener,noreferrer");
        } catch {
          return;
        }
      }}
    >
      <s-stack gap="base">
        <s-paragraph>
          {t(
            "Se abrirá un borrador en tu aplicación de correo. Revísalo y envíalo desde allí.",
          )}
        </s-paragraph>
        <s-text-field
          label={t("Asunto")}
          value={draft.subject}
          required
          maxLength={SUPPORT_LIMITS.subjectMax}
          data-support-field="subject"
          error={
            attempted && errors.subject
              ? t(
                  "Escribe un asunto de entre 3 y 120 caracteres, en una sola línea.",
                )
              : undefined
          }
          onInput={(event) => update("subject", event.currentTarget.value)}
        />
        <s-email-field
          label={t("Correo de respuesta (opcional)")}
          value={draft.replyEmail}
          maxLength={254}
          data-support-field="replyEmail"
          error={
            attempted && errors.replyEmail
              ? t("Introduce un correo electrónico válido.")
              : undefined
          }
          onInput={(event) => update("replyEmail", event.currentTarget.value)}
        />
        <s-text-area
          label={t("Describe el problema")}
          value={draft.message}
          required
          maxLength={SUPPORT_LIMITS.messageMax}
          data-support-field="message"
          error={
            attempted && errors.message
              ? t("Describe el problema con entre 10 y 1500 caracteres.")
              : undefined
          }
          onInput={(event) => update("message", event.currentTarget.value)}
        />
        <s-paragraph color="subdued">
          {t(
            "Se incluirán la tienda y la sección actual para ayudarnos a resolver tu consulta.",
          )}
        </s-paragraph>
        {attempted && Object.values(errors).some(Boolean) && (
          <div role="alert">
            <s-text tone="critical">
              {t("Revisa los campos marcados antes de preparar el correo.")}
            </s-text>
          </div>
        )}
        <s-stack direction="inline" gap="base">
          <s-button type="submit" variant="primary" icon="email">
            {t("Preparar correo")}
          </s-button>
          <s-button
            type="button"
            onClick={() => {
              setDraft(emptyDraft);
              setAttempted(false);
              setPrepared(null);
            }}
          >
            {t("Borrar mensaje")}
          </s-button>
        </s-stack>
        <div aria-live="polite">
          {preparedHref && (
            <s-banner heading={t("Borrador preparado")} tone="success">
              <s-paragraph>
                {t(
                  "Si no se abrió tu aplicación de correo, usa este enlace. El mensaje lo enviarás desde tu cliente de correo.",
                )}
              </s-paragraph>
              <s-link href={preparedHref} target="_blank" data-support-prepared>
                {t("Abrir correo preparado")}
              </s-link>
            </s-banner>
          )}
        </div>
      </s-stack>
    </form>
  );
}
