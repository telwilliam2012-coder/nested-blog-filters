import { readParentValues } from "./filter-hierarchy";
import type {
  FilterSetDraft,
  OptionDraft,
} from "./services/filter-admin.server";

type StoredFilterSet = {
  name: string;
  blogId: string;
  revision: number;
  filters: Array<{
    id: string;
    key: string;
    label: string;
    source?: string;
    parentKey?: string | null;
    parentValues?: string | null;
    options: OptionDraft[];
  }>;
};

export function toFilterSetDraft(set: StoredFilterSet): FilterSetDraft {
  return {
    name: set.name,
    blogId: set.blogId,
    revision: set.revision,
    filters: set.filters.map((filter) => ({
      id: filter.id,
      key: filter.key,
      label: filter.label,
      source: filter.source === "tag" ? "tag" : "metafield",
      parentKey: filter.parentKey ?? null,
      parentValues: readParentValues(filter.parentValues),
      options: filter.options.map(({ id, value, label }) => ({
        id,
        value,
        label,
      })),
    })),
  };
}
