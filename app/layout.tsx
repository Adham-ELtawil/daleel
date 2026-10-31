import type { Metadata } from "next";
import localFont from "next/font/local";
import { localeAttrs, t } from "@/src/i18n";
import { LocaleShell } from "@/src/components/locale-shell";
import { uiLocale } from "@/src/services/ui-locale";
import "./globals.css";

const plex = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-latin-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-arabic-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-daleel",
  display: "swap",
});

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
      <body className={`${plex.variable} antialiased`}>
        <LocaleShell locale={locale}>{children}</LocaleShell>
      </body>
    </html>
  );
}
