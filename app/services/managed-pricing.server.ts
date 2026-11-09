import { createHash } from "node:crypto";
import type { authenticate } from "../shopify.server";
import {
  getPlanAccess,
  PREMIUM_PLAN,
  PRO_PLAN,
  type AppBillingPlanName,
  type AppPlanAccess,
} from "../billing-plans";

type Admin = Pick<
  Awaited<ReturnType<typeof authenticate.admin>>["admin"],
  "graphql"
>;
type VerificationOptions = { forceFresh?: boolean };
type Dependencies = {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  env?: () => NodeJS.ProcessEnv;
  timeoutMs?: number;
};
type CachedAccess = { access: AppPlanAccess; expiresAt: number };

const CACHE_TTL_MS = 30_000;
const MAX_CACHE_ENTRIES = 512;
const API_VERSION = "2026-07";
const APP_GID = /^gid:\/\/shopify\/App\/[1-9]\d*$/;
const SHOP_GID = /^gid:\/\/shopify\/Shop\/[1-9]\d*$/;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

export const MANAGED_PRICING_IDENTITY_QUERY = `#graphql
  query ManagedPricingIdentity {
    shop { id myshopifyDomain }
    currentAppInstallation { app { id apiKey } }
  }
`;

export const MANAGED_PRICING_SUBSCRIPTION_QUERY = `#graphql
  query ManagedPricingSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      app { id apiKey }
      shop { id myshopifyDomain }
      billingPeriod
      cancelAtEndOfCycle
      currentBillingCycle { startTime endTime }
      trialEndsAt
      items { handle price { __typename } }
    }
  }
`;

export class ManagedPricingVerificationError extends Error {
  readonly status = 503;
  constructor(
    readonly code:
      | "CONFIGURATION"
      | "IDENTITY"
      | "PARTNER_RESPONSE"
      | "UNKNOWN_PLAN"
      | "UNAVAILABLE",
  ) {
    super("Shopify subscription status could not be verified.");
    this.name = "ManagedPricingVerificationError";
  }
}

export function managedPricingVerificationEnabled() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.SHOPIFY_BILLING_VERIFICATION?.trim().toLowerCase() === "partner"
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function domain(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().toLowerCase();
  if (SHOP_DOMAIN.test(name)) return name;
  try {
    const url = new URL(name);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      SHOP_DOMAIN.test(url.hostname)
    )
      return url.hostname;
  } catch {
    // Provider responses must identify the authenticated myshopify.com domain.
  }
  return null;
}

function configuration(env: NodeJS.ProcessEnv) {
  const partnerId = env.SHOPIFY_PARTNER_ID?.trim() ?? "";
  const token = env.SHOPIFY_PARTNER_API_ACCESS_TOKEN?.trim() ?? "";
  const apiKey = env.SHOPIFY_API_KEY?.trim() ?? "";
  if (!/^[1-9]\d*$/.test(partnerId) || !token || !apiKey)
    throw new ManagedPricingVerificationError("CONFIGURATION");
  return {
    partnerId,
    token,
    apiKey,
    identity: createHash("sha256")
      .update(JSON.stringify([partnerId, token, apiKey]))
      .digest("hex"),
  };
}

function hasErrors(payload: Record<string, unknown>) {
  return (
    payload.errors !== undefined &&
    (!Array.isArray(payload.errors) || payload.errors.length > 0)
  );
}

function futureBoundary(value: unknown, now: number) {
  if (value === null || value === undefined) return Infinity;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    throw new ManagedPricingVerificationError("PARTNER_RESPONSE");
  const timestamp = Date.parse(value);
  // A cycle end is the next billing date, not proof of cancellation. The fresh
  // canonical response remains authoritative; never cache across a future edge.
  return timestamp > now ? timestamp : Infinity;
}

export function createManagedPricingVerifier(dependencies: Dependencies = {}) {
  const fetchRequest: typeof globalThis.fetch =
    dependencies.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const now = dependencies.now ?? Date.now;
  const env = dependencies.env ?? (() => process.env);
  const timeoutMs = Math.min(dependencies.timeoutMs ?? 10_000, 10_000);
  const cache = new Map<string, CachedAccess>();
  const inFlight = new Map<string, Promise<AppPlanAccess | null>>();

  return async function verifyManagedPricing(
    admin: Admin,
    expectedShop: string,
    options: VerificationOptions = {},
  ): Promise<AppPlanAccess | null> {
    const config = configuration(env());
    const shopDomain = domain(expectedShop);
    if (!shopDomain) throw new ManagedPricingVerificationError("IDENTITY");
    const key = `${config.identity}:${shopDomain}`;
    const currentTime = now();
    for (const [entryKey, entry] of cache) {
      if (entry.expiresAt <= currentTime) cache.delete(entryKey);
    }
    if (options.forceFresh) cache.delete(key);
    const cached = cache.get(key);
    if (cached) {
      cache.delete(key);
      cache.set(key, cached);
      return { ...cached.access };
    }
    const pending = inFlight.get(key);
    if (pending) {
      const access = await pending;
      return access ? { ...access } : null;
    }
    if (inFlight.size >= MAX_CACHE_ENTRIES)
      throw new ManagedPricingVerificationError("UNAVAILABLE");

    const operation = (async (): Promise<AppPlanAccess | null> => {
      try {
        const identityResponse = await admin.graphql(
          MANAGED_PRICING_IDENTITY_QUERY,
        );
        const identityPayload = record(await identityResponse.json());
        const identityData = record(identityPayload?.data);
        const shop = record(identityData?.shop);
        const installation = record(identityData?.currentAppInstallation);
        const app = record(installation?.app);
        if (
          !identityResponse.ok ||
          !identityPayload ||
          hasErrors(identityPayload) ||
          typeof shop?.id !== "string" ||
          !SHOP_GID.test(shop.id) ||
          domain(shop.myshopifyDomain) !== shopDomain ||
          typeof app?.id !== "string" ||
          !APP_GID.test(app.id) ||
          app.apiKey !== config.apiKey
        )
          throw new ManagedPricingVerificationError("IDENTITY");

        const response = await fetchRequest(
          `https://partners.shopify.com/${config.partnerId}/api/${API_VERSION}/graphql.json`,
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "X-Shopify-Access-Token": config.token,
            },
            body: JSON.stringify({
              query: MANAGED_PRICING_SUBSCRIPTION_QUERY,
              variables: { appId: app.id, shopId: shop.id },
            }),
          },
        );
        if (!response.ok)
          throw new ManagedPricingVerificationError("PARTNER_RESPONSE");
        const payload = record(await response.json());
        const data = record(payload?.data);
        if (
          !payload ||
          hasErrors(payload) ||
          !data ||
          !("activeSubscription" in data)
        )
          throw new ManagedPricingVerificationError("PARTNER_RESPONSE");
        if (data.activeSubscription === null) return null;
        const subscription = record(data.activeSubscription);
        const returnedApp = record(subscription?.app);
        const returnedShop = record(subscription?.shop);
        if (
          !subscription ||
          returnedApp?.id !== app.id ||
          returnedApp.apiKey !== config.apiKey ||
          returnedShop?.id !== shop.id ||
          domain(returnedShop.myshopifyDomain) !== shopDomain ||
          !["ANNUAL", "EVERY_30_DAYS"].includes(
            String(subscription.billingPeriod),
          ) ||
          typeof subscription.cancelAtEndOfCycle !== "boolean" ||
          !Array.isArray(subscription.items)
        )
          throw new ManagedPricingVerificationError("PARTNER_RESPONSE");

        let plan: AppBillingPlanName | null = null;
        for (const value of subscription.items) {
          const item = record(value);
          const price = record(item?.price);
          if (
            price?.__typename !== "FlatRatePrice" ||
            typeof item?.handle !== "string"
          )
            continue;
          const handle = item.handle.trim().toLowerCase();
          if (handle === "premium") plan = PREMIUM_PLAN;
          else if (handle === "pro" && plan === null) plan = PRO_PLAN;
        }
        if (!plan) throw new ManagedPricingVerificationError("UNKNOWN_PLAN");
        const access = getPlanAccess(plan);
        const completedAt = now();
        const cycle =
          subscription.currentBillingCycle === null
            ? null
            : record(subscription.currentBillingCycle);
        if (subscription.currentBillingCycle !== null && !cycle)
          throw new ManagedPricingVerificationError("PARTNER_RESPONSE");
        if (
          !Object.hasOwn(subscription, "trialEndsAt") ||
          (cycle &&
            (typeof cycle.startTime !== "string" ||
              typeof cycle.endTime !== "string"))
        )
          throw new ManagedPricingVerificationError("PARTNER_RESPONSE");
        if (cycle) futureBoundary(cycle.startTime, completedAt);
        const expiresAt = Math.min(
          completedAt + CACHE_TTL_MS,
          cycle ? futureBoundary(cycle.endTime, completedAt) : Infinity,
          futureBoundary(subscription.trialEndsAt, completedAt),
        );
        if (expiresAt > completedAt) {
          while (cache.size >= MAX_CACHE_ENTRIES)
            cache.delete(cache.keys().next().value!);
          cache.set(key, { access, expiresAt });
        }
        return { ...access };
      } catch (error) {
        cache.delete(key);
        // The SDK can throw App Bridge reauthorization responses. Preserve their
        // original identity, status, and headers instead of disguising auth as 503.
        if (error instanceof Response) throw error;
        if (error instanceof ManagedPricingVerificationError) throw error;
        // Do not expose credentials, provider bodies, or fetch internals.
        throw new ManagedPricingVerificationError("UNAVAILABLE");
      }
    })();
    inFlight.set(key, operation);
    try {
      return await operation;
    } finally {
      if (inFlight.get(key) === operation) inFlight.delete(key);
    }
  };
}

export const verifyManagedPricing = createManagedPricingVerifier();
