import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

export const t = (key: keyof typeof en.intake, locale: "en" | "ar-EG" = "en") =>
  (locale === "en" ? en : ar).intake[key];
