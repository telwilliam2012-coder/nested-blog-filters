import "@shopify/shopify-api/adapters/web-api";
import type { ActionFunctionArgs } from "react-router";
import {
  ApiVersion,
  shopifyApi,
  WebhookValidationErrorReason,
} from "@shopify/shopify-api";
import db from "../db.server";

const webhookApi = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  hostName: new URL(process.env.SHOPIFY_APP_URL || "https://localhost").host,
  isEmbeddedApp: true,
});

export const loader = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return loader();
  if (!request.headers.get("X-Shopify-Hmac-Sha256")) {
    return new Response(null, { status: 401 });
  }

  const rawBody = await request.text();
  const validation = await webhookApi.webhooks.validate({
    rawBody,
    rawRequest: request,
  });
  if (!validation.valid) {
    return new Response(null, {
      status:
        validation.reason === WebhookValidationErrorReason.InvalidHmac
          ? 401
          : 400,
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return new Response(null, { status: 400 });
  }

  const { topic, domain: shop } = validation;
  switch (topic) {
    case "APP_UNINSTALLED":
    case "SHOP_REDACT": {
      const shopField =
        topic === "APP_UNINSTALLED" ? "myshopify_domain" : "shop_domain";
      if ((payload as Record<string, unknown>)[shopField] !== shop) {
        return new Response(null, { status: 400 });
      }
      await db.$transaction([
        db.filterSet.deleteMany({ where: { shop } }),
        db.session.deleteMany({ where: { shop } }),
      ]);
      break;
    }
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // The app stores blog configuration and merchant sessions, not customer data.
      break;
    default:
      return new Response(null, { status: 404 });
  }

  return new Response(null, { status: 200 });
};
