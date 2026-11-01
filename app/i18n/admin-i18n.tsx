import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  adminLocaleStorageKey,
  DEFAULT_ADMIN_LOCALE,
  normalizeAdminLocale,
} from "./locale";
import type { AdminLocale } from "./locale";
import { translateAdmin } from "./messages";

function translations(locale: AdminLocale) {
  return {
    locale,
    t: (source: string, values?: Record<string, string | number>) =>
      translateAdmin(locale, source, values),
    formatNumber: (value: number) =>
      new Intl.NumberFormat(locale).format(value),
  };
}
type AdminI18n = ReturnType<typeof translations> & {
  setLocale: (value: string) => void;
};
const AdminI18nContext = createContext<AdminI18n>({
  ...translations(DEFAULT_ADMIN_LOCALE),
  setLocale: () => {},
});

export function AdminI18nProvider({
  children,
  initialLocale,
  shop,
}: {
  children: ReactNode;
  initialLocale: AdminLocale;
  shop: string;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const openingLocale = useRef(initialLocale);
  const storageKey = adminLocaleStorageKey(shop);
  useEffect(() => {
    try {
      updateLocale(
        normalizeAdminLocale(localStorage.getItem(storageKey)) ??
          openingLocale.current,
      );
    } catch {
      updateLocale(openingLocale.current);
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey)
        updateLocale(
          normalizeAdminLocale(event.newValue) ?? openingLocale.current,
        );
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey]);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);
  const setLocale = useCallback(
    (value: string) => {
      const next = normalizeAdminLocale(value);
      if (!next) return;
      updateLocale(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        return;
      }
    },
    [storageKey],
  );
  const value = useMemo(
    () => ({ ...translations(locale), setLocale }),
    [locale, setLocale],
  );
  return (
    <AdminI18nContext.Provider value={value}>
      <div lang={locale}>{children}</div>
    </AdminI18nContext.Provider>
  );
}

export function useAdminI18n() {
  return useContext(AdminI18nContext);
}
