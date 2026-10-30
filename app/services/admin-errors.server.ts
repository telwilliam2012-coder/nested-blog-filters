export class AdminInputError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AdminInputError";
  }
}

export function requireRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new AdminInputError(
      "La versión del conjunto no es válida. Recarga la página.",
    );
  }
  return Number(value);
}

export function actionError(error: unknown) {
  if (error instanceof Response) throw error;
  if (error instanceof AdminInputError)
    return { error: error.message, status: error.status };
  const code = (error as { code?: string })?.code;
  if (code === "P2002")
    return {
      error: "Ya existe un conjunto para este blog o un valor duplicado.",
      status: 409,
    };
  return {
    error:
      "No se pudo completar la operación. Recarga la página y vuelve a intentarlo.",
    status: 502,
  };
}

export function loaderError(error: unknown): never {
  const result = actionError(error);
  throw new Response(result.error, { status: result.status });
}
