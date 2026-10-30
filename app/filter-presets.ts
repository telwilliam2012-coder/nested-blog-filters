import type { FilterDraft } from "./services/filter-admin.server";

export function celebrationFilters(
  existing: FilterDraft[] = [],
): FilterDraft[] {
  const options = (values: string[]) =>
    values.map((value) => ({ value, label: value }));
  const presets: FilterDraft[] = [
    {
      key: "motivo",
      label: "Motivos",
      source: "tag",
      options: options(["Decoraciones", "Celebraciones"]),
    },
    {
      key: "ocasion",
      label: "Ocasión",
      source: "tag",
      parentKey: "motivo",
      parentValues: ["Celebraciones"],
      options: options(["Festividades", "Ocasiones Especiales"]),
    },
    {
      key: "festividad",
      label: "Festividades",
      source: "tag",
      parentKey: "ocasion",
      parentValues: ["Festividades"],
      options: options(["Halloween", "Navidad", "Amor y Amistad"]),
    },
  ];
  const assigned = new Map<string, FilterDraft>();
  const used = new Set<FilterDraft>();
  const overlap = (preset: FilterDraft, filter: FilterDraft) =>
    preset.options.filter((option) =>
      filter.options.some((old) => old.value === option.value),
    ).length;
  const ordered = [...presets].sort(
    (a, b) =>
      Math.max(0, ...existing.map((filter) => overlap(b, filter))) -
      Math.max(0, ...existing.map((filter) => overlap(a, filter))),
  );
  for (const preset of ordered) {
    const candidates = existing.filter((filter) => !used.has(filter));
    const old = [...candidates].sort(
      (a, b) => overlap(preset, b) - overlap(preset, a),
    )[0];
    const match =
      old && overlap(preset, old) > 0
        ? old
        : candidates.find((filter) => filter.key === preset.key);
    if (match) {
      assigned.set(preset.key, match);
      used.add(match);
    }
  }
  const occupied = new Set(existing.map((filter) => filter.key));
  const keys = new Map<string, string>();
  for (const preset of presets) {
    let key = assigned.get(preset.key)?.key;
    if (!key) {
      key = preset.key;
      for (let suffix = 2; occupied.has(key); suffix++)
        key = `${preset.key}_${suffix}`;
      occupied.add(key);
    }
    keys.set(preset.key, key);
  }
  return [
    ...presets.map((preset) => {
      const old = assigned.get(preset.key);
      const options = preset.options.map((option) => ({
        ...option,
        id: old?.options.find((item) => item.value === option.value)?.id,
      }));
      return {
        ...preset,
        id: old?.id,
        key: keys.get(preset.key)!,
        parentKey: preset.parentKey ? keys.get(preset.parentKey) : null,
        options: [
          ...options,
          ...(old?.options.filter(
            (option) => !options.some((item) => item.value === option.value),
          ) ?? []),
        ],
      };
    }),
    ...existing.filter((filter) => !used.has(filter)),
  ];
}
