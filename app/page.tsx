import Link from "next/link";
import { t } from "@/src/i18n";
import { DemoChoices } from "@/src/components/demo-choices";
import { FeatureSticker } from "@/src/components/feature-sticker";
import { VerdictHero } from "@/src/components/verdict-hero";
import { uiLocale } from "@/src/services/ui-locale";

export default async function Home() {
  const locale = await uiLocale();
  const [headlineBefore, headlineAfter] = t("headline", locale, "landing").split("{verdict}");
  return (
    <main className="ms-auto me-auto max-w-6xl space-y-14 ps-6 pe-6 py-12 sm:py-16">
      <section className="grid items-center gap-10 lg:grid-cols-2">
        <div className="space-y-6">
          <h1 className="text-[34px] leading-tight lg:text-[49px]">
            {headlineBefore}
            <bdi dir="ltr" className="whitespace-nowrap">
              {t("headline_verdict", locale, "landing")}
            </bdi>
            {headlineAfter}
          </h1>
          <p className="max-w-[70ch] text-xl font-light text-muted">
            {t("description", locale, "landing")}
          </p>
          <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
            <a href="#demo" className="button button-primary">
              {t("demo_cta", locale, "landing")}
            </a>
            <Link href="/problem" className="button button-secondary">
              {t("new_attempt", locale, "landing")}
            </Link>
          </div>
        </div>
        <VerdictHero locale={locale} />
      </section>
      <section aria-labelledby="steps-heading" className="space-y-6">
        <h2 id="steps-heading">{t("how_it_works", locale, "landing")}</h2>
        <ol className="step-rail grid gap-6 sm:grid-cols-3">
          {(["diagnose", "verify", "hint"] as const).map((step, index) => (
            <li
              key={step}
              className="relative space-y-3 border-s border-line ps-5 after:hidden sm:border-s-0 sm:ps-0 sm:after:absolute sm:after:start-12 sm:after:end-0 sm:after:top-4 sm:after:block sm:after:h-px sm:after:bg-line last:after:hidden"
            >
              <span aria-hidden="true" className="step-number">
                {index + 1}
              </span>
              <FeatureSticker
                name={
                  ({ diagnose: "diagnose", verify: "counterexample", hint: "hints" } as const)[step]
                }
              />
              <h3 className="text-xl">{t(step, locale, "landing")}</h3>
              <p className="text-sm text-muted">{t(`${step}_description`, locale, "landing")}</p>
            </li>
          ))}
        </ol>
      </section>
      <DemoChoices locale={locale} />
      <div className="flex items-center gap-4 border-t border-line pt-6">
        <FeatureSticker name="coach" size={72} />
        <p className="text-sm text-muted">
          {t("coach_strip", locale, "landing")}{" "}
          <Link href="/coach">{t("coach_link", locale, "landing")}</Link>
        </p>
      </div>
    </main>
  );
}
