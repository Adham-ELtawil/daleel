import Link from "next/link";
import { t } from "@/src/i18n";
import { DemoChoices } from "@/src/components/demo-choices";
import { uiLocale } from "@/src/services/ui-locale";

export default async function Home() {
  const locale = await uiLocale();
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-5xl font-bold tracking-tight">{t("title", locale, "landing")}</h1>
      <p className="text-xl font-medium">{t("tagline", locale, "landing")}</p>
      <p className="text-base leading-7 opacity-80">{t("description", locale, "landing")}</p>
      <p className="text-sm opacity-60">{t("status", locale, "landing")}</p>
      <DemoChoices locale={locale} />
      <Link href="/problem" className="underline">
        {t("title", locale)}
      </Link>
    </main>
  );
}
