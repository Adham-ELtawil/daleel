import Link from "next/link";
import { headers } from "next/headers";
import { connect, getDb } from "@/src/db/client";
import { formatAttemptDate } from "@/src/domain/attempt-ui";
import { bugClassLabel, t } from "@/src/i18n";
import { attemptHistory } from "@/src/services/attempt-service";
import { StatusChip } from "@/src/components/ui/status-chip";
import { uiLocale } from "@/src/services/ui-locale";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const locale = await uiLocale();
  const { cursor } = await searchParams;
  const { items, nextCursor } = await attemptHistory(
    await connect(getDb()),
    typeof cursor === "string" ? cursor : null,
    (await headers()).get("cookie"),
  );
  return (
    <main className="ms-auto me-auto max-w-3xl space-y-6 ps-6 pe-6 py-10">
      <h1>{t("history", locale)}</h1>
      {!items.length && (
        <section role="status" className="state-panel state-empty space-y-4">
          <p className="text-muted">{t("history_empty", locale)}</p>
          <Link href="/problem" className="button button-primary">
            {t("title", locale)}
          </Link>
          <Link href="/#demo" className="ms-4">
            {t("try_demo", locale)}
          </Link>
        </section>
      )}
      <ul className="border-t border-line">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/attempt/${item.id}`}
              className="history-row grid items-center gap-3 border-b border-line border-s-[3px] border-s-transparent ps-4 pe-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0 space-y-2">
                <h2 dir="ltr" className="truncate text-lg text-ink">
                  {item.problemTitle}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={item.status} locale={locale} />
                  {item.mode === "idea" && (
                    <span className="badge badge-idea">{t("ideaBadge", locale)}</span>
                  )}
                  {item.mode === "code" && item.bugClass && (
                    <span className="badge badge-neutral">
                      {bugClassLabel(item.bugClass, locale)}
                    </span>
                  )}
                  <span
                    role="img"
                    aria-label={t("max_hint", locale) + ": " + item.maxHintLevel}
                    className="flex gap-1"
                  >
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        aria-hidden="true"
                        data-hint-segment={level}
                        data-filled={level <= item.maxHintLevel}
                        className={`h-1.5 w-5 rounded-sm ${level <= item.maxHintLevel ? "bg-accent" : "bg-line"}`}
                      />
                    ))}
                  </span>
                </div>
              </div>
              <time
                className="text-sm text-muted"
                dateTime={new Date(item.createdAt).toISOString()}
              >
                {formatAttemptDate(item.createdAt, locale)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <Link
          href={`/me?cursor=${encodeURIComponent(nextCursor)}`}
          className="button button-secondary"
        >
          {t("load_more", locale)}
        </Link>
      )}
    </main>
  );
}
