import es from "../locales/es.json";
import en from "../locales/en.json";
import de from "../locales/de.json";
import it from "../locales/it.json";
import fr from "../locales/fr.json";
import type { AdminLocale } from "./locale";

export const adminMessages: Record<AdminLocale, Record<string, string>> = {
  es,
  en,
  de,
  it,
  fr,
};
type Values = Record<string, string | number>;
const dynamicMessages = Object.keys(es)
  .filter((source) => source.includes("{{"))
  .map((source) => {
    const names: string[] = [];
    const parts = source.split(/(\{\{\s*\w+\s*\}\})/g);
    const pattern = parts
      .map((part) => {
        const parameter = /^\{\{\s*(\w+)\s*\}\}$/.exec(part);
        if (parameter) {
          names.push(parameter[1]);
          return "([\\s\\S]*?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return {
      source,
      names,
      prefix: parts[0],
      pattern: new RegExp(`^${pattern}$`),
    };
  })
  .sort(
    (a, b) =>
      b.source.replace(/\{\{.*?\}\}/g, "").length -
      a.source.replace(/\{\{.*?\}\}/g, "").length,
  );

export function translateAdmin(
  locale: AdminLocale,
  source: string,
  values: Values = {},
  depth = 0,
): string {
  const catalog = adminMessages[locale];
  let message = Object.hasOwn(catalog, source) ? catalog[source] : undefined;
  let parameters = values;
  if (message === undefined) {
    for (const candidate of dynamicMessages) {
      if (!source.startsWith(candidate.prefix)) continue;
      const match = candidate.pattern.exec(source);
      if (!match) continue;
      message = catalog[candidate.source];
      parameters = Object.fromEntries(
        candidate.names.map((name, index) => {
          const value = match[index + 1];
          return [
            name,
            depth < 2 ? translateAdmin(locale, value, {}, depth + 1) : value,
          ];
        }),
      );
      break;
    }
  }
  return (message ?? source).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (placeholder, name: string) => {
      const value = parameters[name];
      return value === undefined
        ? placeholder
        : typeof value === "number"
          ? new Intl.NumberFormat(locale).format(value)
          : value;
    },
  );
}
