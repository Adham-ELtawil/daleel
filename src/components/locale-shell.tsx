"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t } from "@/src/i18n";

const LocaleContext = createContext<"en" | "ar-EG">("en");
export const useLocale = () => useContext(LocaleContext);
export function LocaleShell({
  locale,
  children,
}: {
  locale: "en" | "ar-EG";
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <LocaleContext.Provider value={locale}>
      <header className="flex flex-wrap items-center gap-4 border-b ps-6 pe-6 py-3">
        <Link href="/problem">{t("title", locale)}</Link>
        <Link href="/me">{t("history", locale)}</Link>
        <button
          type="button"
          className="ms-auto underline"
          aria-label={t("ui_language", locale)}
          onClick={() => {
            document.cookie = `daleel_locale=${locale === "en" ? "ar-EG" : "en"}; Path=/; Max-Age=31536000; SameSite=Lax`;
            router.refresh();
          }}
        >
          {t(locale === "en" ? "arabic" : "english", locale)}
        </button>
      </header>
      {children}
    </LocaleContext.Provider>
  );
}
