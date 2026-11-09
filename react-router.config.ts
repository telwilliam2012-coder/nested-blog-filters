import type { Config } from "@react-router/dev/config";

export default {
  // Polaris navigation can open routes before React Router discovers them.
  // Include route metadata in the first load instead of fetching /__manifest.
  routeDiscovery: { mode: "initial" },
} satisfies Config;
