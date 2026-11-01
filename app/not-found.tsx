import Link from "next/link";
import { localeAttrs, t } from "@/src/i18n";
import { uiLocale } from "@/src/services/ui-locale";
import { Window } from "@/src/components/ui/window";

export default async function NotFound() {
  const locale = await uiLocale();
  return (
    <main {...localeAttrs(locale)} className="ms-auto me-auto max-w-6xl ps-6 pe-6 py-16 text-start">
      <div className="max-w-xl space-y-6">
        <Window
          title={
            <bdi dir="ltr" className="font-mono">
              {t("title", locale, "landing")}
            </bdi>
          }
        >
          <p dir="ltr" className="bidi-isolate p-4 font-mono text-danger">
            <span aria-hidden="true">✗ </span>
            {t("title", "en", "notFound")}
          </p>
        </Window>
        <h1 className="text-xl font-normal">{t("sentence", locale, "notFound")}</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/" className="button button-secondary">
            {t("home", locale, "notFound")}
          </Link>
          <Link href="/problem" className="button button-primary">
            {t("new_attempt", locale, "notFound")}
          </Link>
        </div>
      </div>
    </main>
  );
}
