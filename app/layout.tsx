import type { Metadata } from "next";
import { LocaleShell } from "@/src/components/locale-shell";
import { uiLocale } from "@/src/services/ui-locale";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daleel",
  description: "AI training coach for competitive programmers",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await uiLocale();
  return (
    <html lang={locale} dir={locale === "en" ? "ltr" : "rtl"}>
      <body className="antialiased">
        <LocaleShell locale={locale}>{children}</LocaleShell>
      </body>
    </html>
  );
}
