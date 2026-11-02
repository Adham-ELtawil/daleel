import { LoadingSkeleton } from "@/src/components/attempt-feedback";
import { localeAttrs, t } from "@/src/i18n";
import { uiLocale } from "@/src/services/ui-locale";

export default async function Loading() {
  const locale = await uiLocale();
  return (
    <main {...localeAttrs(locale)} className="ms-auto me-auto max-w-6xl ps-6 pe-6 py-10">
      <LoadingSkeleton label={t("preparing_language", locale)} />
    </main>
  );
}
