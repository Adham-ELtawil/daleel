"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();
  return (
    <LocaleContext.Provider value={locale}>
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="ms-auto me-auto flex max-w-6xl flex-wrap items-center gap-5 ps-6 pe-6 py-4">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className="flex shrink-0 items-center gap-2 text-xl font-semibold text-ink"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              className="size-8 text-accent"
            >
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="m16 8-2 6-6 2 2-6Z" fill="currentColor" />
            </svg>
            <bdi dir="ltr">{t("title", locale, "landing")}</bdi>
          </Link>
          <nav
            aria-label={t("navigation", locale, "landing")}
            className="order-last flex basis-full flex-wrap gap-4 text-sm font-medium sm:order-none sm:basis-auto"
          >
            {(["/problem", "/me", "/coach"] as const).map((href) => (
              <Link
                key={href}
                href={href}
                className="nav-link border-b-2 border-transparent text-muted transition-colors duration-150 hover:text-ink hover:no-underline aria-[current=page]:border-accent aria-[current=page]:text-ink"
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined
                }
              >
                {href === "/problem"
                  ? t("title", locale)
                  : href === "/me"
                    ? t("history", locale)
                    : t("title", locale, "coach")}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="ms-auto button button-secondary shrink-0 ps-3 pe-3 py-1.5"
            aria-label={t("ui_language", locale)}
            onClick={() => {
              void switchUiLocale(locale, window.location.pathname, () => router.refresh());
            }}
          >
            {t("language_target", locale, "landing")}
          </button>
        </div>
      </header>
      {children}
    </LocaleContext.Provider>
  );
}
