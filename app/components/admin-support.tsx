import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ElementRef, ReactNode } from "react";
import { useLocation } from "react-router";
import { useAdminI18n } from "../i18n/admin-i18n";
import { AdminSupportContext } from "../support/context";
import { HelpContents, QuickStartSteps } from "./help-content";
import { SupportContactForm } from "./support-contact-form";
import styles from "./admin-support.module.css";

export function AdminSupportProvider({
  children,
  shop,
}: {
  children: ReactNode;
  shop: string;
}) {
  const [open, setOpen] = useState(false);
  const [documentation, setDocumentation] = useState(false);
  const openHelp = useCallback(() => {
    setDocumentation(false);
    setOpen(true);
  }, []);
  const showDocumentation = useCallback(() => setDocumentation(true), []);
  const closeHelp = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openHelp, closeHelp }), [openHelp, closeHelp]);
  return (
    <AdminSupportContext.Provider value={value}>
      {children}
      <HelpWidget
        open={open}
        documentation={documentation}
        showDocumentation={showDocumentation}
        openHelp={openHelp}
        closeHelp={closeHelp}
        shop={shop}
      />
    </AdminSupportContext.Provider>
  );
}

function HelpWidget({
  open,
  documentation,
  showDocumentation,
  openHelp,
  closeHelp,
  shop,
}: {
  open: boolean;
  documentation: boolean;
  showDocumentation: () => void;
  openHelp: () => void;
  closeHelp: () => void;
  shop: string;
}) {
  const { t, locale } = useAdminI18n();
  const { pathname } = useLocation();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const launcher = useRef<ElementRef<"s-button">>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const onClose = () => {
      if (element.open) return;
      closeHelp();
      if (opener.current?.isConnected) opener.current.focus();
      else launcher.current?.focus();
    };
    const onCancel = (event: Event) => {
      event.preventDefault();
      closeHelp();
    };
    const onClick = (event: MouseEvent) => {
      if (event.target !== element) return;
      const bounds = element.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        closeHelp();
    };
    element.addEventListener("close", onClose);
    element.addEventListener("cancel", onCancel);
    element.addEventListener("click", onClick);
    return () => {
      element.removeEventListener("close", onClose);
      element.removeEventListener("cancel", onCancel);
      element.removeEventListener("click", onClick);
    };
  }, [closeHelp]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      opener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      element.showModal();
      heading.current?.focus();
    } else if (!open && element.open) element.close();
  }, [open]);
  useEffect(() => {
    if (!dialog.current?.open) return;
    dialog.current.scrollTop = 0;
    heading.current?.focus();
  }, [documentation]);
  return (
    <>
      <div className={styles.launcher}>
        <s-button
          ref={launcher}
          icon="question-circle"
          variant="primary"
          accessibilityLabel={t("Abrir ayuda de Dreamers APP")}
          onClick={openHelp}
          data-help-launcher
        >
          {t("Ayuda")}
        </s-button>
      </div>
      <dialog
        ref={dialog}
        id="nbf-help-drawer"
        className={styles.drawer}
        lang={locale}
        aria-labelledby="nbf-help-heading"
        aria-modal="true"
      >
        <header className={styles.header}>
          <h2 ref={heading} id="nbf-help-heading" tabIndex={-1}>
            {documentation
              ? t("Ayuda y documentación")
              : t("Ayuda de Dreamers APP")}
          </h2>
          <s-button
            onClick={closeHelp}
            accessibilityLabel={t("Cerrar ayuda")}
            data-help-close
          >
            {t("Cerrar")}
          </s-button>
        </header>
        <div className={styles.body}>
          <div hidden={documentation}>
            <s-stack gap="large">
              <s-section heading={t("Inicio rápido")}>
                <QuickStartSteps />
                <s-button onClick={showDocumentation} icon="book-open">
                  {t("Ver documentación completa")}
                </s-button>
              </s-section>
              <s-section heading={t("Contacta con Dreamers APP")}>
                <SupportContactForm shop={shop} pathname={pathname} />
              </s-section>
            </s-stack>
          </div>
          {documentation && (
            <div data-help-inline-docs>
              <s-stack gap="base">
                <s-button onClick={openHelp} data-help-back>
                  {t("Volver a la ayuda rápida")}
                </s-button>
                <HelpContents />
              </s-stack>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
