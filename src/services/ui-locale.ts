import { cookies, headers } from "next/headers";
import { resolveLocale } from "@/src/i18n";

export async function uiLocale() {
  return resolveLocale(
    (await cookies()).get("daleel_locale")?.value,
    (await headers()).get("accept-language"),
  );
}
