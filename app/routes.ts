import { flatRoutes } from "@react-router/fs-routes";
import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("privacy", "routes/privacy.tsx"),
  route("faq", "routes/faq.tsx"),
  route("changelog", "routes/changelog.tsx"),
  route("tutorial", "routes/tutorial.tsx"),
  route("docs", "routes/docs.tsx"),
  ...(await flatRoutes({
    ignoredRouteFiles: [
      "**/privacy.tsx",
      "**/faq.tsx",
      "**/changelog.tsx",
      "**/tutorial.tsx",
      "**/docs.tsx",
    ],
  })),
] satisfies RouteConfig;
