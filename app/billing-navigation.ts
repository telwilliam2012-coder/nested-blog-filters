const SHOPIFY_CONTEXT_PARAMETERS = [
  "shop",
  "host",
  "embedded",
  "locale",
  "admin_theme",
] as const;

export function billingActionPath(search: string) {
  const source = new URLSearchParams(search);
  const context = new URLSearchParams();
  for (const key of SHOPIFY_CONTEXT_PARAMETERS) {
    const value = source.get(key);
    if (value !== null) context.set(key, value);
  }
  const query = context.toString();
  return query ? `/app/billing?${query}` : "/app/billing";
}
