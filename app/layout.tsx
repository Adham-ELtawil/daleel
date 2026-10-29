import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daleel",
  description: "AI training coach for competitive programmers",
};

// Locale routing (app/[locale]) and RTL arrive in PR-14; English/LTR until then.
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" dir="ltr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
