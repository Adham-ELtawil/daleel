import type { Metadata } from "next";
import { localeAttrs, t } from "@/src/i18n";
import { LocaleShell } from "@/src/components/locale-shell";
import { uiLocale } from "@/src/services/ui-locale";
import "katex/dist/katex.min.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await uiLocale();
  const title = t("title", locale, "landing");
  const description = t("description", locale, "landing");
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      siteName: title,
      locale: locale === "en" ? "en_US" : "ar_EG",
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await uiLocale();
  return (
    <html {...localeAttrs(locale)}>
      <body className="antialiased">
        <LocaleShell locale={locale}>{children}</LocaleShell>
      </body>
    </html>
  );
}
