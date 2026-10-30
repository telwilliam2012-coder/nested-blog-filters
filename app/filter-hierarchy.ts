type HierarchyFilter = {
  id: string;
  key: string;
  parentKey: string | null;
};

export function readParentValues(value: string | null | undefined): string[] {
  const values: unknown = JSON.parse(value ?? "[]");
  if (
    !Array.isArray(values) ||
    values.some((item) => typeof item !== "string")
  ) {
    throw new Error(
      "Las condiciones del filtro deben ser una lista de valores.",
    );
  }
  return values;
}

export function descendantFilterIds(filters: HierarchyFilter[], id: string) {
  const keys = new Set(
    filters.filter((filter) => filter.id === id).map((filter) => filter.key),
  );
  const ids = new Set<string>();
  for (const filter of filters) {
    if (filter.parentKey && keys.has(filter.parentKey)) {
      ids.add(filter.id);
      keys.add(filter.key);
    }
  }
  return ids;
}

export const normalizeTag = (value: string) =>
  value.normalize("NFKC").trim().toLocaleLowerCase("es");

export function matchingTagValues(
  tags: string[],
  options: Array<{ value: string }>,
) {
  const present = new Set(tags.map(normalizeTag));
  return options
    .filter((option) => present.has(normalizeTag(option.value)))
    .map((option) => option.value);
}
