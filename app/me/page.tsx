import Link from "next/link";
import { headers } from "next/headers";
import { connect, getDb } from "@/src/db/client";
import { formatAttemptDate } from "@/src/domain/attempt-ui";
import { bugClassLabel, t } from "@/src/i18n";
import { attemptHistory } from "@/src/services/attempt-service";
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
        <section role="status" className="card space-y-4 p-6">
          <p className="text-muted">{t("history_empty", locale)}</p>
          <Link href="/problem" className="button button-primary">
            {t("title", locale)}
          </Link>
        </section>
      )}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="card space-y-2 p-6">
            <Link href={`/attempt/${item.id}`} dir="ltr" className="text-lg font-semibold">
              {item.problemTitle}
            </Link>
            <p className="text-sm text-muted">
              {t(`status_${item.status}`, locale)} · {t("max_hint", locale)}: {item.maxHintLevel}
            </p>
            {item.mode === "idea" && (
              <span className="badge badge-neutral">{t("ideaBadge", locale)}</span>
            )}
            {item.mode === "code" && item.bugClass && <p>{bugClassLabel(item.bugClass, locale)}</p>}
            <time
              className="block text-sm text-muted"
              dateTime={new Date(item.createdAt).toISOString()}
            >
              {formatAttemptDate(item.createdAt, locale)}
            </time>
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
