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
  useSubmit,
} from "react-router";
import { FilterSetEditor } from "../components/filter-set-editor";
import { actionError, loaderError } from "../services/admin-errors.server";
import { saveFilterSet } from "../services/filter-admin.server";
import {
  getShopifyBlogs,
  requireShopifyBlog,
} from "../services/shopify-content.server";
import { authenticate } from "../shopify.server";
import { useAdminI18n } from "../i18n/admin-i18n";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const result = await getShopifyBlogs(
    admin,
    url.searchParams.get("after"),
  ).catch(loaderError);
  const selected = url.searchParams.get("blogId");
  if (selected && !result.nodes.some((blog) => blog.id === selected))
    result.nodes.unshift(
      await requireShopifyBlog(admin, selected).catch(loaderError),
    );
  return { ...result, selected: selected ?? result.nodes[0]?.id ?? "" };
}

export const shouldRevalidate: ShouldRevalidateFunction = ({
  actionResult,
  defaultShouldRevalidate,
}) =>
  actionResult && typeof actionResult === "object" && "error" in actionResult
    ? false
    : defaultShouldRevalidate;

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  try {
    const form = await request.formData();
    const raw = String(form.get("configuration") ?? "");
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
    const id = await saveFilterSet(admin, session.shop, null, draft);
    return redirect(`/app/filters/${id}?saved=1`);
  } catch (error) {
    const result = actionError(error);
    return data({ error: result.error }, { status: result.status });
  }
}

export default function NewFiltersPage() {
  const { t } = useAdminI18n();
  const result = useLoaderData<typeof loader>();
  const error = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  return (
    <>
      <FilterSetEditor
        key={result.selected}
        blogs={result.nodes}
        initial={{
          name: t("Filtros del blog"),
          blogId: result.selected,
          revision: 0,
          filters: [{ key: "motivo", label: t("Motivo"), options: [] }],
        }}
        saving={navigation.state !== "idle"}
        error={error?.error}
        onSave={(draft) =>
          submit({ configuration: JSON.stringify(draft) }, { method: "post" })
        }
      />
      {result.pageInfo.hasNextPage && (
        <s-page>
          <s-link
            href={`/app/filters/new?after=${encodeURIComponent(result.pageInfo.endCursor ?? "")}`}
          >
            {t("Consultar más blogs")}
          </s-link>
        </s-page>
      )}
    </>
  );
}
