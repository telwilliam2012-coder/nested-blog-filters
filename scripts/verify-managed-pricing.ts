import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  isAppBillingPlan,
  type AppBillingPlanName,
  type AppPlanAccess,
} from "../app/billing-plans";
import type { unauthenticated } from "../app/shopify.server";

type OfflineContext = Awaited<ReturnType<typeof unauthenticated.admin>>;
export type ManagedPricingDiagnosticDependencies = {
  loadContext: (
    shop: string,
  ) => Promise<Pick<OfflineContext, "admin" | "session">>;
  verify: (
    admin: OfflineContext["admin"],
    expectedShop: string,
    options: { forceFresh: true },
  ) => Promise<AppPlanAccess | null>;
  disconnect?: () => Promise<void>;
};
type DiagnosticResult =
  | { shop: string; verified: true; plan: AppBillingPlanName | null }
  | { verified: false; code: string };
type DiagnosticOutcome = { exitCode: number; result: DiagnosticResult };

const SHOP = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/i;
const PROVIDER_CODES = new Set([
  "CONFIGURATION",
  "IDENTITY",
  "PARTNER_RESPONSE",
  "UNKNOWN_PLAN",
  "UNAVAILABLE",
]);

class DiagnosticAuthenticationError extends Error {}

export function diagnosticShop(args: string[]): string | null {
  const value =
    args.length === 1 && !args[0].startsWith("-")
      ? args[0]
      : args.length === 2 && args[0] === "--shop"
        ? args[1]
        : null;
  return value && SHOP.test(value) ? value.toLowerCase() : null;
}

export async function verifyShopManagedPricing(
  shop: string,
  dependencies: ManagedPricingDiagnosticDependencies,
): Promise<{ shop: string; verified: true; plan: AppBillingPlanName | null }> {
  if (!SHOP.test(shop)) throw new DiagnosticAuthenticationError();
  let context: Pick<OfflineContext, "admin" | "session">;
  try {
    context = await dependencies.loadContext(shop);
  } catch (error) {
    // The core operation preserves native SDK control responses for callers.
    if (error instanceof Response) throw error;
    throw new DiagnosticAuthenticationError();
  }
  if (
    typeof context.session?.shop !== "string" ||
    context.session.shop.toLowerCase() !== shop.toLowerCase()
  )
    throw new DiagnosticAuthenticationError();
  const access = await dependencies.verify(context.admin, shop, {
    forceFresh: true,
  });
  if (access !== null && !isAppBillingPlan(access?.plan))
    throw new Error("Invalid verification result.");
  return { shop, verified: true, plan: access?.plan ?? null };
}

async function defaultDependencies(): Promise<ManagedPricingDiagnosticDependencies> {
  // Lazy imports keep an invalid CLI invocation and unit-test imports from
  // initializing Shopify, accessing session storage, or reading configuration.
  const [{ unauthenticated }, { verifyManagedPricing }, { default: prisma }] =
    await Promise.all([
      import("../app/shopify.server"),
      import("../app/services/managed-pricing.server"),
      import("../app/db.server"),
    ]);
  return {
    loadContext: (shop) => unauthenticated.admin(shop),
    verify: verifyManagedPricing,
    disconnect: () => prisma.$disconnect(),
  };
}

function diagnosticCode(error: unknown, phase: "initialize" | "verify") {
  if (error instanceof Response) return "AUTHENTICATION_REQUIRED";
  if (error instanceof DiagnosticAuthenticationError)
    return "OFFLINE_SESSION_UNAVAILABLE";
  try {
    const value = error as { name?: unknown; code?: unknown } | null;
    if (
      value?.name === "ManagedPricingVerificationError" &&
      typeof value.code === "string" &&
      PROVIDER_CODES.has(value.code)
    )
      return value.code;
  } catch {
    // Never render an arbitrary provider property, message, or stack.
  }
  return phase === "initialize"
    ? "INITIALIZATION_FAILED"
    : "VERIFICATION_FAILED";
}

export async function runManagedPricingDiagnostic(
  args: string[],
  loadDependencies: () => Promise<ManagedPricingDiagnosticDependencies> = defaultDependencies,
): Promise<DiagnosticOutcome> {
  const shop = diagnosticShop(args);
  if (!shop)
    return {
      exitCode: 2,
      result: { verified: false, code: "INVALID_ARGUMENTS" },
    };

  // This is a private one-shot CLI process. Silence SDK initialization/logging
  // so its only output is the deliberately limited JSON result below.
  const logging = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  for (const method of Object.keys(logging) as Array<keyof typeof logging>)
    console[method] = () => {};
  let dependencies: ManagedPricingDiagnosticDependencies | undefined;
  let phase: "initialize" | "verify" = "initialize";
  let outcome: DiagnosticOutcome;
  try {
    dependencies = await loadDependencies();
    phase = "verify";
    outcome = {
      exitCode: 0,
      result: await verifyShopManagedPricing(shop, dependencies),
    };
  } catch (error) {
    outcome = {
      exitCode: 1,
      result: { verified: false, code: diagnosticCode(error, phase) },
    };
  } finally {
    try {
      await dependencies?.disconnect?.();
    } catch {
      outcome = {
        exitCode: 1,
        result: { verified: false, code: "SESSION_CLEANUP_FAILED" },
      };
    }
    Object.assign(console, logging);
  }
  return outcome!;
}

export function diagnosticIsMain(
  moduleUrl: string,
  filename = process.argv[1],
) {
  return Boolean(
    filename && pathToFileURL(resolve(filename)).href === moduleUrl,
  );
}

if (diagnosticIsMain(import.meta.url)) {
  const outcome = await runManagedPricingDiagnostic(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
  process.exitCode = outcome.exitCode;
}
