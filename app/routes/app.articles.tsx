import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useLoaderData } from "react-router";
import { ArticleManager } from "../components/article-manager";
import prisma from "../db.server";
import {
  actionError,
  AdminInputError,
  loaderError,
} from "../services/admin-errors.server";
import {
  cancelArticleSync,
  editArticleAttributes,
  getArticleManagementPage,
  syncArticlePage,
  type ArticleEdit,
} from "../services/article-admin.server";
import { getFilterSet } from "../services/filter-admin.server";
import { authenticatePaidAdmin } from "../services/billing.server";
export {
  AdminPageError as ErrorBoundary,
  adminHeaders as headers,
} from "../components/admin-page-error";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session, planAccess } = await authenticatePaidAdmin(request);
  const sets = await prisma.filterSet.findMany({
    where: { shop: session.shop },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  const params = new URL(request.url).searchParams;
  const id = params.get("filterSetId") ?? sets[0]?.id;
  if (!id) return { sets, management: null, loadError: null, planAccess };
  const set = await getFilterSet(session.shop, id).catch(loaderError);
  try {
    const management = await getArticleManagementPage(
      admin,
      session.shop,
      id,
      Number(params.get("page") ?? 1),
    );
    return { sets, management, loadError: null, planAccess };
  } catch (error) {
    const result = actionError(error);
    return {
      sets,
      management: { set, articles: [], total: 0, page: 1, totalPages: 0 },
      loadError: result.error,
      planAccess,
    };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session, planAccess } = await authenticatePaidAdmin(request);
  try {
    const form = await request.formData();
    const id = String(form.get("filterSetId") ?? "");
    const intent = form.get("intent");
    if (intent === "sync") {
      const progress = await syncArticlePage(
        admin,
        session.shop,
        id,
        Number(form.get("revision")),
        String(form.get("jobId") ?? "") || null,
      );
      return data({
        error: null,
        message: progress.complete
          ? `Importación terminada: ${progress.importedCount} artículos consultados.`
          : null,
        progress,
      });
    }
    if (intent === "cancel") {
      await cancelArticleSync(
        session.shop,
        id,
        String(form.get("jobId") ?? ""),
      );
      return data({
        error: null,
        message:
          "Importación cancelada. Los artículos ya importados se conservaron.",
        progress: null,
      });
    }
    if (intent === "edit") {
      const raw = String(form.get("payload") ?? "");
      if (raw.length > 100_000)
        throw new AdminInputError("La selección es demasiado grande.");
      let input: ArticleEdit;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new AdminInputError("La selección no es válida.");
      }
      const count = await editArticleAttributes(
        admin,
        session.shop,
        id,
        input,
        planAccess,
      );
      return data({
        error: null,
        message: `Cambios guardados en ${count} artículos.`,
        progress: null,
      });
    }
    throw new AdminInputError("La operación no es válida.");
  } catch (error) {
    const result = actionError(error);
    return data(
      { error: result.error, message: null, progress: null },
      { status: result.status },
    );
  }
}

export default function ArticlesPage() {
  const result = useLoaderData<typeof loader>();
  return (
    <ArticleManager key={result.management?.set.id ?? "empty"} {...result} />
  );
}
