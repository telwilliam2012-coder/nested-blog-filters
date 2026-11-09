import { BillingError } from "@shopify/shopify-api";
import { APP_BILLING_PLANS, type AppBillingPlanName } from "../billing-plans";
import type { authenticate } from "../shopify.server";

type AdminContext = Awaited<ReturnType<typeof authenticate.admin>>;

export function manualTestBillingEnabled() {
  return (
    process.env.SHOPIFY_BILLING_MODE === "manual_test" &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
  );
}

export function billingTestReturnUrl(shop: string) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop) || !apiKey) {
    throw new Error("Invalid Shopify test billing return configuration.");
  }
  const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/apps/${encodeURIComponent(apiKey)}/app`;
}

function confirmationUrl(value: unknown, shop: string) {
  let url: URL | undefined;
  try {
    if (typeof value === "string") url = new URL(value);
  } catch {
    // Report an invalid or missing confirmation URL through the normal banner.
  }
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![shop.toLowerCase(), "admin.shopify.com"].includes(url.hostname)
  ) {
    throw new BillingError({
      message: "Shopify did not return an allowed confirmation URL.",
      errorData: [
        {
          field: ["confirmationUrl"],
          message: "Shopify no devolvió una URL de confirmación válida.",
        },
      ],
    });
  }
  return url.toString();
}

export async function requestTestSubscription(
  context: Pick<AdminContext, "admin" | "session" | "redirect">,
  plan: AppBillingPlanName,
) {
  if (!manualTestBillingEnabled()) {
    throw new Error("Manual test billing is disabled outside development.");
  }
  const terms = APP_BILLING_PLANS[plan];
  const response = await context.admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate(
      $name: String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $trialDays: Int!
    ) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: true
      ) {
        confirmationUrl
        userErrors { field message }
      }
    }
  `,
    {
      variables: {
        name: plan,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: {
                  amount: terms.amount,
                  currencyCode: terms.currencyCode,
                },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
        returnUrl: billingTestReturnUrl(context.session.shop),
        trialDays: terms.trialDays,
      },
      tries: 1,
    },
  );
  const result = await response.json();
  const subscription = result.data?.appSubscriptionCreate;
  if (subscription?.userErrors?.length) {
    throw new BillingError({
      message: "Shopify rejected the test subscription.",
      errorData: subscription.userErrors,
    });
  }
  // Creating a PENDING subscription grants no access. The admin guards check
  // ACTIVE again after approval; never trust charge_id or the return URL.
  throw context.redirect(
    confirmationUrl(subscription?.confirmationUrl, context.session.shop),
    { target: "_top" },
  );
}
