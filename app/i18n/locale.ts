export const ADMIN_LOCALES = ["es", "en", "de", "it", "fr"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];
export const DEFAULT_ADMIN_LOCALE: AdminLocale = "es";
export const LANGUAGE_NAMES: Record<AdminLocale, string> = {
  es: "Español",
  en: "Inglés",
  de: "Alemán",
  it: "Italiano",
  fr: "Francés",
};

export function normalizeAdminLocale(value: unknown): AdminLocale | null {
  if (typeof value !== "string") return null;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return ADMIN_LOCALES.includes(language as AdminLocale)
    ? (language as AdminLocale)
    : null;
}

export function adminLocaleStorageKey(shop: string): string {
  return `nbf.admin.locale:${shop}`;
}

export function requestAdminLocale(request: Request): AdminLocale {
  const queryLocale = normalizeAdminLocale(
    new URL(request.url).searchParams.get("locale"),
  );
  if (queryLocale) return queryLocale;
  const accepted = (request.headers.get("Accept-Language") ?? "")
    .split(",")
    .map((entry) => {
      const [language, ...parameters] = entry.trim().split(";");
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      return {
        locale: normalizeAdminLocale(language),
        quality: quality ? Number(quality.trim().slice(2)) : 1,
      };
    })
    .filter((entry) => entry.locale && entry.quality > 0 && entry.quality <= 1)
    .sort((a, b) => b.quality - a.quality);
  return accepted[0]?.locale ?? DEFAULT_ADMIN_LOCALE;
}
