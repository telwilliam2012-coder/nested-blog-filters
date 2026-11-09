import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { FilterEngineError } from "../services/filter-engine.server";
import { getFilterHomePreview } from "../services/filter-home.server";
import { authenticatePaidAdmin } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticatePaidAdmin(request);

  try {
    const preview = await getFilterHomePreview(
      session.shop,
      new URL(request.url).searchParams,
    );

    return data(
      { preview, error: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) throw error;

    if (error instanceof FilterEngineError) {
      return data(
        { preview: null, error: error.message },
        {
          status: error.code === "FILTER_SET_NOT_FOUND" ? 404 : 400,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }

    console.error("Unable to preview blog filters.", error);
    return data(
      {
        preview: null,
        error: "No pudimos consultar los filtros. Vuelve a intentarlo.",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
