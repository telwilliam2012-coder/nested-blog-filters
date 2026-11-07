import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => [
  { title: "Nested Blog Filters & Search" },
  {
    name: "description",
    content:
      "Organiza y filtra los artículos de tu blog de Shopify con filtros anidados y búsqueda avanzada.",
  },
];

export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const entersFromShopify =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.get("embedded") === "1" ||
    url.searchParams.has("id_token");

  // Keep Shopify launches on the admin home with their original query context.
  if (entersFromShopify) {
    return redirect(`/app${url.search}`, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return null;
}

export default function AppEntry() {
  return (
    <main className={styles.index} lang="es">
      <div className={styles.content}>
        <h1 className={styles.heading}>Nested Blog Filters &amp; Search</h1>
        <p className={styles.text}>
          Organiza y filtra los artículos de tu blog de Shopify con filtros
          anidados y búsqueda avanzada.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Filtros Anidados:</strong> Organiza tus entradas por
            categorías, subcategorías y etiquetas estructuradas.
          </li>
          <li>
            <strong>Búsqueda Rápida:</strong> Permite a tus usuarios encontrar
            contenido al instante desde el storefront.
          </li>
          <li>
            <strong>Fácil Integración:</strong> Configuración rápida a través
            del proxy de la app sin modificar código complejo en el tema.
          </li>
        </ul>
        <footer>
          <a href="/privacy">Política de privacidad</a>
        </footer>
      </div>
    </main>
  );
}
