import type { Metadata } from "next";
import { localeAttrs, t } from "@/src/i18n";
import { LocaleShell } from "@/src/components/locale-shell";
import { uiLocale } from "@/src/services/ui-locale";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await uiLocale();
  return { title: t("title", locale, "landing"), description: t("description", locale, "landing") };
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
