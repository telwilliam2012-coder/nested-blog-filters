export function loader() {
  return new Response(
    "Política de Privacidad / Términos en desarrollo para Dreamers APP",
    {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
