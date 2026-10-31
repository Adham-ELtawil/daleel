import { headers } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { PrintReport } from "@/src/components/print-report";
import { connect, getDb } from "@/src/db/client";
import { teams } from "@/src/db/schema";
import { localeAttrs, t } from "@/src/i18n";
import { getCurrentUser } from "@/src/services/current-user";
import { HttpError } from "@/src/services/http-error";
import { uiLocale } from "@/src/services/ui-locale";
import { weeklyReport } from "@/src/services/weekly-report";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string | string[]; week?: string | string[] }>;
}) {
  const locale = await uiLocale();
  const tr = (key: Parameters<typeof t<"report">>[0]) => {
    return t(key, locale, "report");
  };
  const coach = (key: Parameters<typeof t<"coach">>[0]) => t(key, locale, "coach");
  const layout = "report ms-auto me-auto max-w-4xl space-y-6 ps-6 pe-6 py-10";
  const message = (text: string) => (
    <main {...localeAttrs(locale)} className={layout}>
      <h1>{tr("title")}</h1>
      <p role="status">{text}</p>
    </main>
  );
  const db = await connect(getDb());
  const user = await getCurrentUser(db, (await headers()).get("cookie"));
  if (user.role !== "coach" || user.isGuest) return message(coach("coach_only"));
  const owned = await db
    .select()
    .from(teams)
    .where(eq(teams.coachId, user.id))
    .orderBy(teams.name, teams.id);
  if (!owned.length) return message(coach("no_teams"));
  const query = await searchParams;
  const team = query.team === undefined ? owned[0] : owned.find((item) => item.id === query.team);
  if (!team || (query.week !== undefined && typeof query.week !== "string"))
    return message(coach("invalid_selection"));
  let data: Awaited<ReturnType<typeof weeklyReport>>;
  try {
    data = await weeklyReport(db, user, team.id, query.week ?? null, locale);
  } catch (error) {
    if (error instanceof HttpError && error.status < 500)
      return message(coach("invalid_selection"));
    throw error;
  }
  const { stats, report, candidates } = data;
  const byId = new Map(candidates.map((p) => [p.id, p]));
  const selection = new URLSearchParams({ team: team.id, week: stats.weekStart }).toString();
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  return (
    <main {...localeAttrs(locale)} className={layout}>
      <h1 className="text-3xl font-bold">
        {tr("title")}: <bdi>{team.name}</bdi>
      </h1>
      <p>
        {coach("week")}: <bdi dir="ltr">{stats.weekStart}</bdi>
      </p>
      <nav className="flex items-center gap-4">
        <Link href={`/coach?${selection}`}>{tr("back")}</Link>
        <PrintReport locale={locale} />
      </nav>
      {team.inviteCode === "DEMO0001" && <p>{coach("synthetic")}</p>}
      <p>{report.headline}</p>
      {!stats.attempts && <p>{coach("empty")}</p>}
      <dl className="grid gap-4 sm:grid-cols-4">
        {(["attempts", "solved", "solvedRate", "avgHintLevelAtSolve"] as const).map((key) => (
          <div key={key}>
            <dt>{coach(key)}</dt>
            <dd className="font-bold">
              {(key === "solvedRate" ? percent : number).format(stats[key])}
            </dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="topics">
        <h2 id="topics" className="text-xl font-semibold">
          {coach("topics")}
        </h2>
        <ul>
          {stats.topTags.map(({ tag, count }) => (
            <li key={tag}>
              <bdi dir="ltr">{tag}</bdi>: {number.format(count)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="bugs">
        <h2 id="bugs" className="text-xl font-semibold">
          {coach("bugs")}
        </h2>
        <ul>
          {stats.topBugClasses.map(({ bugClass, count }) => (
            <li key={bugClass}>
              <bdi dir="ltr">{bugClass}</bdi>: {number.format(count)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="attention">
        <h2 id="attention" className="text-xl font-semibold">
          {coach("attention")}
        </h2>
        {!report.attention.length && <p>{coach("attention_empty")}</p>}
        <ul className="space-y-2">
          {report.attention.map(({ handle, suggestion }) => (
            <li key={handle}>
              <bdi dir="ltr">{handle}</bdi>: {suggestion}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="recommended">
        <h2 id="recommended" className="text-xl font-semibold">
          {tr("recommended")}
        </h2>
        {!report.recommended.length && <p>{tr("empty")}</p>}
        {report.recommended.length > 0 && report.recommended.length < 5 && (
          <p>{tr("limited").replace("{count}", number.format(report.recommended.length))}</p>
        )}
        <ol className="list-decimal space-y-3 ps-6">
          {report.recommended.map(({ problem_id, why }) => {
            const p = byId.get(problem_id)!;
            return (
              <li key={p.id}>
                <a
                  className="underline"
                  href={`https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`}
                >
                  <bdi dir="ltr">
                    {p.id} · {p.name}
                  </bdi>
                </a>{" "}
                · {t("rating", locale)}: {number.format(p.rating)}
                <p>{why}</p>
              </li>
            );
          })}
        </ol>
      </section>
      <section aria-labelledby="session">
        <h2 id="session" className="text-xl font-semibold">
          {tr("session")}
        </h2>
        <ol className="list-decimal space-y-2 ps-6">
          {report.session_plan.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
