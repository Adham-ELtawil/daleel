import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

export const t = (key: keyof typeof en.intake, locale: "en" | "ar-EG" = "en") =>
  (locale === "en" ? en : ar).intake[key];

export function resolveLocale(cookie: string | undefined, language: string | null): "en" | "ar-EG" {
  if (cookie === "en" || cookie === "ar-EG") return cookie;
  for (const part of (language ?? "").split(",")) {
    const tag = part.trim().split(";")[0].toLowerCase();
    if (/^ar(?:-|$)/.test(tag)) return "ar-EG";
    if (/^en(?:-|$)/.test(tag)) return "en";
  }
  return "en";
}
