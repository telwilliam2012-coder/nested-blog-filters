import { flatRoutes } from "@react-router/fs-routes";
import { route, type RouteConfig } from "@react-router/dev/routes";

export default [
  route("privacy", "routes/privacy.tsx"),
  ...(await flatRoutes({ ignoredRouteFiles: ["**/privacy.tsx"] })),
] satisfies RouteConfig;
