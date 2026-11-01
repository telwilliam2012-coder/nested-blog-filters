import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import {
  createStaticHandler,
  createStaticRouter,
  StaticRouterProvider,
} from "react-router";
import { ArticleManager } from "../app/components/article-manager";

export async function renderArticleManager(
  props: ComponentProps<typeof ArticleManager>,
) {
  const handler = createStaticHandler([
    { path: "/app/articles", element: <ArticleManager {...props} /> },
  ]);
  const context = await handler.query(
    new Request("http://localhost/app/articles"),
  );
  if (context instanceof Response)
    throw new Error("The article manager did not render.");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToString(
    <StaticRouterProvider router={router} context={context} hydrate={false} />,
  );
}
