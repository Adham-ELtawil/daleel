import Link from "next/link";
import { t } from "@/src/i18n";
import { DemoChoices } from "@/src/components/demo-choices";
import { uiLocale } from "@/src/services/ui-locale";

export default async function Home() {
  const locale = await uiLocale();
  return (
    <main className="ms-auto me-auto max-w-6xl space-y-12 ps-6 pe-6 py-12 sm:py-16">
      <section className="max-w-3xl space-y-5">
        <p className="text-sm font-semibold text-accent">{t("tagline", locale, "landing")}</p>
        <h1 className="text-4xl leading-tight sm:text-5xl">{t("headline", locale, "landing")}</h1>
        <p className="max-w-2xl text-lg text-muted">{t("description", locale, "landing")}</p>
      </section>
      <section aria-labelledby="steps-heading" className="space-y-5">
        <h2 id="steps-heading">{t("how_it_works", locale, "landing")}</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          {(["diagnose", "verify", "hint"] as const).map((step, index) => (
            <li key={step} className="card space-y-3 p-6">
              <span aria-hidden="true" className="badge">
                {index + 1}
              </span>
              <h3>{t(step, locale, "landing")}</h3>
              <p className="text-sm text-muted">{t(`${step}_description`, locale, "landing")}</p>
            </li>
          ))}
        </ol>
      </section>
      <DemoChoices locale={locale} />
      <Link href="/problem" className="button button-secondary">
        {t("title", locale)}
      </Link>
    </main>
  );
}
