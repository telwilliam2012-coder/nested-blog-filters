import type { ReactNode } from "react";
import { useAdminI18n } from "../i18n/admin-i18n";
import { DREAMERS_SUPPORT_EMAIL } from "../support/contact";
import { useAdminSupport } from "../support/context";
import styles from "./admin-support.module.css";

export function QuickStartSteps() {
  const { t } = useAdminI18n();
  return (
    <s-stack gap="base">
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack gap="small">
          <s-heading>{t("1. Crea tus filtros")}</s-heading>
          <s-paragraph>
            {t(
              "Elige un blog, define sus opciones y configura qué selección muestra cada nivel siguiente.",
            )}
          </s-paragraph>
        </s-stack>
      </s-box>
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack gap="small">
          <s-heading>{t("2. Etiqueta y sincroniza")}</s-heading>
          <s-paragraph>
            {t(
              "Asigna las etiquetas a los artículos en Shopify o desde Artículos. Después sincroniza el blog para actualizar el índice.",
            )}
          </s-paragraph>
        </s-stack>
      </s-box>
      <s-box padding="base" background="subdued" borderRadius="base">
        <s-stack gap="small">
          <s-heading>{t("3. Activa el bloque en el tema")}</s-heading>
          <s-paragraph>
            {t(
              "Añade Filtros del blog a la plantilla del blog, ajusta los colores y comprueba los resultados con artículos publicados.",
            )}
          </s-paragraph>
        </s-stack>
      </s-box>
    </s-stack>
  );
}

export function HelpEntryCard() {
  const { t } = useAdminI18n();
  const { openHelp } = useAdminSupport();
  return (
    <s-section heading={t("Ayuda de Dreamers APP")}>
      <s-stack gap="base">
        <s-paragraph>
          {t(
            "Consulta la guía, resuelve dudas o prepara una consulta sin perder tu configuración.",
          )}
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button href="/app/help" icon="book-open">
            {t("Ver documentación")}
          </s-button>
          <s-button onClick={openHelp} icon="question-circle">
            {t("Abrir ayuda rápida")}
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

function Faq({
  question,
  children,
}: {
  question: string;
  children: ReactNode;
}) {
  return (
    <details className={styles.faq}>
      <summary>{question}</summary>
      <div className={styles.answer}>{children}</div>
    </details>
  );
}

export function HelpContents() {
  const { t } = useAdminI18n();
  const { openHelp } = useAdminSupport();
  return (
    <s-stack gap="large">
      <s-section heading={t("Guía de inicio en tres pasos")}>
        <QuickStartSteps />
      </s-section>
      <s-section heading={t("Cómo organizar las etiquetas")}>
        <s-stack gap="base">
          <s-paragraph>
            {t(
              "Selecciona Etiquetas de los artículos en Shopify como origen. El valor de cada opción debe corresponder a una etiqueta del artículo; la etiqueta visible del filtro puede tener otro nombre.",
            )}
          </s-paragraph>
          <s-paragraph>
            {t(
              "Define el árbol en el constructor con Mostrar este filtro después de y las opciones que lo activan. Escribir una etiqueta con guion bajo no crea niveles automáticamente.",
            )}
          </s-paragraph>
          <s-box padding="base" background="subdued" borderRadius="base">
            <s-stack gap="small">
              <s-heading>{t("Ejemplo de tres niveles")}</s-heading>
              <s-paragraph>
                <code>Celebraciones → Festividades → Navidad</code>
              </s-paragraph>
              <s-paragraph>
                {t(
                  "Crea esas opciones en tres filtros. El segundo depende de Celebraciones y el tercero de Festividades. Asigna las tres etiquetas al artículo para incluirlo en esa rama.",
                )}
              </s-paragraph>
            </s-stack>
          </s-box>
          <s-paragraph>
            {t(
              "Si prefieres una convención como Categoría_Subcategoría, configura ese texto completo como valor de opción y como etiqueta del artículo. Sus relaciones se definen en el constructor.",
            )}
          </s-paragraph>
          <s-paragraph>
            {t(
              "Usar estructura Celebraciones prepara un ejemplo de jerarquía. Revisa sus opciones antes de guardar y vuelve a sincronizar después de cambiar etiquetas.",
            )}
          </s-paragraph>
          <s-button href="/app/filters">{t("Configurar filtros")}</s-button>
        </s-stack>
      </s-section>
      <s-section heading={t("Preguntas frecuentes")}>
        <Faq question={t("¿Cómo cambio los colores desde el tema?")}>
          <s-paragraph>
            {t(
              "Abre Tienda online → Temas → Personalizar, entra en la plantilla del blog y selecciona Filtros del blog. Ajusta Color de fondo del Badge, Color de texto del Badge y Color de acento general; después guarda el tema.",
            )}
          </s-paragraph>
          <s-paragraph>
            {t(
              "También puedes cambiar la Paleta general, el Buscador y las Selecciones activas: fondos, textos, bordes y etiquetas seleccionadas. Deja vacíos los colores opcionales para heredar la paleta general.",
            )}
          </s-paragraph>
        </Faq>
        <Faq question={t("¿Por qué no aparecen mis filtros?")}>
          <s-paragraph>
            {t(
              "Comprueba que el blog tenga un conjunto guardado con opciones, que sus artículos estén sincronizados y que el bloque esté añadido a la plantilla del blog correcto. Si el problema continúa, contacta con soporte.",
            )}
          </s-paragraph>
        </Faq>
        <Faq question={t("¿Por qué falta un artículo en los resultados?")}>
          <s-paragraph>
            {t(
              "Solo aparecen artículos publicados cuya fecha de publicación ya haya llegado. Comprueba sus etiquetas, las opciones seleccionadas y la última sincronización; los borradores y las publicaciones futuras no se muestran.",
            )}
          </s-paragraph>
        </Faq>
        <Faq question={t("¿Las etiquetas con guion bajo generan el árbol?")}>
          <s-paragraph>
            {t(
              "No. Cada etiqueta se interpreta como un valor completo. Crea las relaciones entre filtros en el constructor y elige las opciones que activan cada nivel.",
            )}
          </s-paragraph>
        </Faq>
        <Faq question={t("¿Cuándo debo sincronizar los artículos?")}>
          <s-paragraph>
            {t(
              "Sincroniza después de cambiar etiquetas, publicar artículos o modificar las opciones de tus filtros. Puedes pausar y reanudar la importación; termina o cancela antes de editar el conjunto.",
            )}
          </s-paragraph>
        </Faq>
        <Faq question={t("¿Cómo cambio el idioma de la ayuda?")}>
          <s-paragraph>
            {t(
              "Usa Idioma de la aplicación en Inicio. Todo el panel y esta ayuda cambian juntos. La tienda usa el idioma activo de Shopify; los nombres y el contenido que hayas creado no se traducen automáticamente.",
            )}
          </s-paragraph>
        </Faq>
      </s-section>
      <s-section heading={t("Contacta con Dreamers APP")}>
        <s-stack gap="base">
          <s-paragraph>
            {t(
              "Cuéntanos qué esperabas encontrar y qué ocurrió. Puedes preparar tu consulta desde el asistente o escribirnos directamente por correo.",
            )}
          </s-paragraph>
          <s-text>{DREAMERS_SUPPORT_EMAIL}</s-text>
          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              href={`mailto:${DREAMERS_SUPPORT_EMAIL}`}
              target="_blank"
              icon="email"
            >
              {t("Escribir al soporte")}
            </s-button>
            <s-button onClick={openHelp}>
              {t("Preparar una consulta aquí")}
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-stack>
  );
}
