"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { t } from "@/src/i18n";

const LocaleContext = createContext<"en" | "ar-EG">("en");
export const useLocale = () => useContext(LocaleContext);
export async function switchUiLocale(
  locale: "en" | "ar-EG",
  pathname: string,
  refresh: () => void,
) {
  const target = locale === "en" ? "ar-EG" : "en";
  document.cookie = `daleel_locale=${target}; Path=/; Max-Age=31536000; SameSite=Lax`;
  const attempt = /^\/attempt\/([^/]+)\/?$/.exec(pathname);
  // Warm the target ladder before the server refresh so both reads share its cache.
  if (attempt) await fetch(`/api/attempts/${attempt[1]}?locale=${target}`).catch(() => null);
  refresh();
}
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
        <Link href="/" className="flex items-center gap-2 font-bold">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 24 24"
            className="size-7 text-teal-600"
          >
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m16 8-2 6-6 2 2-6Z" fill="currentColor" />
          </svg>
          <bdi dir="ltr">{t("title", locale, "landing")}</bdi>
        </Link>
        <nav aria-label={t("navigation", locale, "landing")} className="flex flex-wrap gap-4">
          <Link href="/problem">{t("title", locale)}</Link>
          <Link href="/me">{t("history", locale)}</Link>
          <Link href="/coach">{t("title", locale, "coach")}</Link>
        </nav>
        <button
          type="button"
          className="ms-auto underline"
          aria-label={t("ui_language", locale)}
          onClick={() => {
            void switchUiLocale(locale, window.location.pathname, () => router.refresh());
          }}
        >
          {t(locale === "en" ? "arabic" : "english", locale)}
        </button>
      </header>
      {children}
    </LocaleContext.Provider>
  );
}
