export const DREAMERS_SUPPORT_EMAIL = "telwilliam2012@gmail.com";
export const SUPPORT_LIMITS = {
  subjectMin: 3,
  subjectMax: 120,
  messageMin: 10,
  messageMax: 1500,
} as const;
export type SupportDraft = {
  subject: string;
  message: string;
  replyEmail: string;
};
type Translate = (
  source: string,
  values?: Record<string, string | number>,
) => string;

export function validateSupportDraft(draft: SupportDraft) {
  return {
    subject:
      draft.subject.trim().length < SUPPORT_LIMITS.subjectMin ||
      draft.subject.length > SUPPORT_LIMITS.subjectMax ||
      /[\r\n]/.test(draft.subject) ||
      draft.subject.includes("\0"),
    message:
      draft.message.trim().length < SUPPORT_LIMITS.messageMin ||
      draft.message.length > SUPPORT_LIMITS.messageMax ||
      draft.message.includes("\0"),
    replyEmail:
      Boolean(draft.replyEmail.trim()) &&
      (draft.replyEmail.length > 254 ||
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(draft.replyEmail.trim())),
  };
}

export function supportMailto(
  draft: SupportDraft,
  context: { shop: string; pathname: string; locale: string },
  t: Translate,
): string {
  if (Object.values(validateSupportDraft(draft)).some(Boolean))
    throw new Error("Invalid support draft");
  const pathname = new URL(context.pathname, "https://app.invalid").pathname;
  const body = [
    draft.message.trim(),
    "",
    `${t("Tienda")}: ${context.shop}`,
    `${t("Pantalla")}: ${pathname}`,
    `${t("Idioma")}: ${context.locale}`,
    ...(draft.replyEmail.trim()
      ? [`${t("Correo de respuesta")}: ${draft.replyEmail.trim()}`]
      : []),
  ].join("\n");
  return `mailto:${DREAMERS_SUPPORT_EMAIL}?subject=${encodeURIComponent(`[Nested Blog Filters] ${draft.subject.trim()}`)}&body=${encodeURIComponent(body)}`;
}
