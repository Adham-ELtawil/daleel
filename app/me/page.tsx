import Link from "next/link";
import { connect, getDb } from "@/src/db/client";
import { formatAttemptDate } from "@/src/domain/attempt-ui";
import { t } from "@/src/i18n";
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
  );
  return (
    <main className="ms-auto me-auto max-w-3xl space-y-4 ps-6 pe-6 py-10">
      <h1 className="text-2xl font-bold">{t("history", locale)}</h1>
      {!items.length && <p>{t("history_empty", locale)}</p>}
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="space-y-2 rounded border p-4">
            <Link href={`/attempt/${item.id}`} dir="ltr" className="underline">
              {item.problemTitle}
            </Link>
            <p>
              {t(`status_${item.status}`, locale)} · {t("max_hint", locale)}: {item.maxHintLevel}
            </p>
            <time dateTime={new Date(item.createdAt).toISOString()}>
              {formatAttemptDate(item.createdAt, locale)}
            </time>
          </li>
        ))}
      </ul>
      {nextCursor && (
        <Link href={`/me?cursor=${encodeURIComponent(nextCursor)}`} className="underline">
          {t("load_more", locale)}
        </Link>
      )}
    </main>
  );
}
