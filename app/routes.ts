import { flatRoutes } from "@react-router/fs-routes";
import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("privacy", "routes/privacy.tsx"),
  route("faq", "routes/faq.tsx"),
  route("changelog", "routes/changelog.tsx"),
  ...(await flatRoutes({
    ignoredRouteFiles: ["**/privacy.tsx", "**/faq.tsx", "**/changelog.tsx"],
  })),
] satisfies RouteConfig;
