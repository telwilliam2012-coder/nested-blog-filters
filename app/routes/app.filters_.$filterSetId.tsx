import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  ShouldRevalidateFunction,
} from "react-router";
import {
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import { FilterSetEditor } from "../components/filter-set-editor";
import { toFilterSetDraft } from "../filter-draft";
import { actionError, loaderError } from "../services/admin-errors.server";
import { getFilterSet, saveFilterSet } from "../services/filter-admin.server";
import { requireShopifyBlog } from "../services/shopify-content.server";
import { authenticate } from "../shopify.server";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const set = await getFilterSet(session.shop, params.filterSetId ?? "").catch(
    loaderError,
  );
  const blog = await requireShopifyBlog(admin, set.blogId).catch(loaderError);
  return { set, blog };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) =>
  actionResult && typeof actionResult === "object" && "error" in actionResult
    ? false
    : defaultShouldRevalidate;

export async function action({ request, params }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  try {
    const raw = String((await request.formData()).get("configuration") ?? "");
    if (raw.length > 200_000)
      return data(
        { error: "La configuración es demasiado grande." },
        { status: 400 },
      );
    let draft: unknown;
    try {
      draft = JSON.parse(raw);
    } catch {
      return data({ error: "La configuración no es válida." }, { status: 400 });
    }
    const id = await saveFilterSet(
      admin,
      session.shop,
      params.filterSetId ?? "",
      draft,
    );
    return redirect(`/app/filters/${id}?saved=1`);
  } catch (error) {
    const result = actionError(error);
    return data({ error: result.error }, { status: result.status });
  }
}

export default function EditFiltersPage() {
  const { set, blog } = useLoaderData<typeof loader>();
  const error = useActionData<typeof action>();
  const navigation = useNavigation();
  const [search] = useSearchParams();
  const submit = useSubmit();
  return (
    <FilterSetEditor
      key={`${set.id}:${set.revision}`}
      initial={toFilterSetDraft(set)}
      blogs={[blog]}
      setId={set.id}
      locked={Boolean(set.sync)}
      inUse={set.filters.flatMap((filter) =>
        filter.options
          .filter((option) => option._count.articles > 0)
          .map((option) => option.id),
      )}
      saving={navigation.state !== "idle"}
      saved={search.get("saved") === "1"}
      error={error?.error}
      onSave={(draft) =>
        submit({ configuration: JSON.stringify(draft) }, { method: "post" })
      }
    />
  );
}
