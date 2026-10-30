import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

export function t<Scope extends keyof typeof en>(
  key: keyof (typeof en)[Scope] & string,
  locale: "en" | "ar-EG",
  scope: Scope,
): string;
export function t(key: keyof typeof en.intake, locale?: "en" | "ar-EG"): string;
export function t(key: string, locale: "en" | "ar-EG" = "en", scope: keyof typeof en = "intake") {
  const messages: Record<string, string> = (locale === "en" ? en : ar)[scope];
  return messages[key];
}

export function localeAttrs(locale: "en" | "ar-EG") {
  return locale === "en" ? { lang: "en", dir: "ltr" } as const : { lang: "ar", dir: "rtl" } as const;
}

export function resolveLocale(cookie: string | undefined, language: string | null): "en" | "ar-EG" {
  if (cookie === "en" || cookie === "ar-EG") return cookie;
  for (const part of (language ?? "").split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase();
    if (/^ar(?:-|$)/.test(tag)) return "ar-EG";
    if (/^en(?:-|$)/.test(tag)) return "en";
  }
  return "en";
}
