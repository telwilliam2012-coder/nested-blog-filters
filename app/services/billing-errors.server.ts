type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;
}

function safeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\bBearer\s+[^\s,"']+/gi, "Bearer [redacted]")
    .replace(/\bshp[a-z]{2,5}_[a-z0-9_-]+\b/gi, "[redacted]")
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+\b/gi, "[redacted]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|api[_-]?secret(?:key)?|client_secret|id_token|authorization|cookie|hmac|session_token)\b["']?\s*[:=]\s*["']?[^\s,"'&;}]+/gi,
      "$1=[redacted]",
    )
    .replace(/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "[email redacted]")
    .slice(0, 600);
}

function providerErrors(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    const entry = record(item);
    const message = safeText(entry?.message);
    if (!message) return [];
    const field = Array.isArray(entry?.field)
      ? entry.field.map(safeText).filter(Boolean).join(".")
      : safeText(entry?.field);
    return [{ field, message }];
  });
}

export function describeBillingFailure(error: unknown) {
  const source = record(error);
  const errorData = record(source?.errorData);
  const body = record(source?.body);
  const responseErrors = record(body?.errors);
  const response = record(source?.response);
  const cause = record(source?.cause);
  const errorType = error instanceof Error ? error.constructor.name : "Unknown";
  const userErrors = providerErrors(source?.errorData);
  const graphQLErrors = providerErrors(
    errorData?.graphQLErrors ?? responseErrors?.graphQLErrors ?? body?.errors,
  );
  const upstreamStatus =
    typeof response?.code === "number"
      ? response.code
      : typeof response?.status === "number"
        ? response.status
        : typeof errorData?.networkStatusCode === "number"
          ? errorData.networkStatusCode
          : typeof responseErrors?.networkStatusCode === "number"
            ? responseErrors.networkStatusCode
            : undefined;
  const unavailable =
    /^Http(?:Request|MaxRetries|Retriable|Internal|Throttling)Error$/.test(
      errorType,
    ) ||
    /^(?:ECONN|EAI_|ENOTFOUND|ETIMEDOUT|UND_ERR_)/.test(
      String(cause?.code ?? ""),
    ) ||
    (upstreamStatus !== undefined && upstreamStatus >= 500) ||
    (error instanceof TypeError && /fetch failed/i.test(error.message));
  const rejected =
    !unavailable &&
    (errorType === "BillingError" ||
      userErrors.length > 0 ||
      graphQLErrors.length > 0 ||
      (upstreamStatus !== undefined &&
        upstreamStatus >= 400 &&
        upstreamStatus < 500 &&
        upstreamStatus !== 429));
  const shopifyErrors = [...userErrors, ...graphQLErrors];
  return {
    status: rejected ? 422 : unavailable ? 503 : 500,
    error: rejected
      ? "Shopify rechazó la solicitud de suscripción. Revisa el detalle o contacta con soporte."
      : unavailable
        ? "No pudimos conectar con Shopify. Vuelve a intentarlo en unos momentos."
        : "No se pudo iniciar la suscripción. Vuelve a intentarlo.",
    details: shopifyErrors.map((entry) => entry.message),
    diagnostic: {
      errorType,
      message: safeText(source?.message) || "Unknown billing failure",
      upstreamStatus,
      causeCode: safeText(cause?.code) || undefined,
      shopifyErrors,
    },
  };
}
