import { headers } from "next/headers";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { connect, getDb } from "@/src/db/client";
import { teams, users } from "@/src/db/schema";
import { DemoCoach } from "@/src/components/demo-coach";
import { bugClassLabel, localeAttrs, t } from "@/src/i18n";
import { getCurrentUser } from "@/src/services/current-user";
import { HttpError } from "@/src/services/http-error";
import { teamStats } from "@/src/services/teams";
import { uiLocale } from "@/src/services/ui-locale";

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string | string[]; week?: string | string[] }>;
}) {
  const locale = await uiLocale();
  const tr = (key: Parameters<typeof t<"coach">>[0]) => t(key, locale, "coach");
  const layout = "coach ms-auto me-auto max-w-6xl space-y-6 ps-6 pe-6 py-10";
  const message = (text: string, demoAvailable?: boolean) => (
    <main {...localeAttrs(locale)} className={layout}>
      <h1 className="text-3xl font-semibold">{tr("title")}</h1>
      <p role="status" className="state-panel state-empty">
        {text}
      </p>
      {demoAvailable !== undefined && <DemoCoach locale={locale} available={demoAvailable} />}
    </main>
  );
  const db = await connect(getDb());
  const user = await getCurrentUser(db, (await headers()).get("cookie"));
  if (user.role !== "coach" || user.isGuest) {
    const demo = await db
      .select({ id: teams.id })
      .from(teams)
      .innerJoin(users, eq(users.id, teams.coachId))
      .where(and(eq(users.handle, "coach_demo"), eq(teams.inviteCode, "DEMO0001")))
      .get();
    return message(tr("coach_only"), Boolean(demo));
  }
  const owned = await db
    .select()
    .from(teams)
    .where(eq(teams.coachId, user.id))
    .orderBy(teams.name, teams.id);
  if (!owned.length) return message(tr("no_teams"));
  const query = await searchParams;
  const team = query.team === undefined ? owned[0] : owned.find((item) => item.id === query.team);
  if (!team || (query.week !== undefined && typeof query.week !== "string"))
    return message(tr("invalid_selection"));
  let stats: Awaited<ReturnType<typeof teamStats>>["stats"];
  try {
    ({ stats } = await teamStats(db, user, team.id, query.week ?? null));
  } catch (error) {
    if (error instanceof HttpError) return message(tr("invalid_selection"));
    throw error;
  }
  const columns = ["attempts", "solved", "solvedRate", "avgHintLevelAtSolve", "ideaHelp"] as const;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const format = (key: (typeof columns)[number], value: number) => {
    return (key === "solvedRate" ? percent : number).format(value);
  };
  return (
    <main {...localeAttrs(locale)} className={layout}>
      <h1 className="text-3xl font-semibold">{tr("title")}</h1>
      <form action="/coach" method="get" className="flex flex-wrap items-end gap-4">
        <label htmlFor="team">
          {tr("team")}
          <select
            id="team"
            name="team"
            defaultValue={team.id}
            className="ms-2 rounded-lg border border-line bg-surface p-2"
          >
            {owned.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="week">
          {tr("week")}
          <input
            id="week"
            name="week"
            type="date"
            dir="ltr"
            min="1970-01-05"
            step={7}
            defaultValue={stats.weekStart}
            required
            className="ms-2 rounded-lg border border-line bg-surface p-2"
          />
        </label>
        <button type="submit" className="button button-secondary">
          {tr("show")}
        </button>
      </form>
      <p>
        {tr("invite")}:{" "}
        <code dir="ltr" className="bidi-isolate select-all rounded-md bg-surface ps-3 pe-3 py-2">
          {team.inviteCode}
        </code>
      </p>
      {team.inviteCode === "DEMO0001" && <p className="text-sm text-muted">{tr("synthetic")}</p>}
      <Link
        className="button button-primary"
        href={`/coach/report?${new URLSearchParams({ team: team.id, week: stats.weekStart })}`}
      >
        {t("title", locale, "report")}
      </Link>
      <dl className="stats-strip">
        {columns.map((key) => (
          <div key={key} className="p-4">
            <dt className="text-sm text-muted">{tr(key)}</dt>
            <dd className="text-3xl font-bold tabular-nums">{format(key, stats[key])}</dd>
          </div>
        ))}
      </dl>
      <div className="max-h-[32rem] overflow-auto border-y border-line">
        <table className="w-full text-start">
          <caption className="pb-3 text-start text-xl font-semibold">{tr("trainees")}</caption>
          <thead>
            <tr>
              {(["handle", ...columns] as const).map((key) => (
                <th
                  key={key}
                  scope="col"
                  className={`border-b border-line p-3 ${key === "handle" ? "text-start" : "text-end"}`}
                >
                  {tr(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.trainees.map((row) => (
              <tr key={row.userId}>
                <th scope="row" className="border-b border-line p-3 text-start">
                  <code dir="ltr" className="bidi-isolate">
                    {row.handle}
                  </code>
                </th>
                {columns.map((key) => (
                  <td key={key} className="border-b border-line p-3 text-end tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {key === "solvedRate" && (
                        <span
                          aria-hidden="true"
                          className="h-1 w-12 overflow-hidden rounded-sm bg-line"
                        >
                          <span
                            className="block h-full bg-muted"
                            style={{ width: `${row.solvedRate * 100}%` }}
                          />
                        </span>
                      )}
                      {format(key, row[key])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!stats.attempts && !stats.ideaHelp && (
          <p role="status" className="state-panel state-empty">
            {tr("empty")}
          </p>
        )}
      </div>
      <section aria-labelledby="attention" className="space-y-2">
        <h2 id="attention" className="text-xl font-semibold">
          {tr("attention")}
        </h2>
        <p>{tr("attention_rule")}</p>
        {!stats.attention.length && (
          <p className="state-panel state-empty">{tr("attention_empty")}</p>
        )}
        <ul>
          {stats.attention.map((row) => (
            <li
              key={row.userId}
              className="grid gap-2 border-b border-line py-4 sm:grid-cols-[10rem_1fr]"
            >
              <code dir="ltr" className="bidi-isolate">
                {row.handle}
              </code>
              <p>
                {row.unsolved >= 3
                  ? tr("reason_unsolved").replace("{count}", number.format(row.unsolved))
                  : tr("reason_hints").replace("{level}", number.format(row.avgHintLevelAtSolve))}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        {(
          [
            ["topics", stats.topTags.map(({ tag, count }) => [tag, count] as const)],
            ["bugs", stats.topBugClasses.map(({ bugClass, count }) => [bugClass, count] as const)],
          ] as const
        ).map(([key, items]) => (
          <section key={key} aria-labelledby={key}>
            <h2 id={key} className="text-xl font-semibold">
              {tr(key)}
            </h2>
            <ul className="space-y-4">
              {items.map(([label, count]) => (
                <li key={label} className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <bdi dir={key === "bugs" ? "auto" : "ltr"}>
                      {key === "bugs" ? bugClassLabel(label, locale) : label}
                    </bdi>
                    <span className="tabular-nums">{number.format(count)}</span>
                  </div>
                  <div aria-hidden="true" className="topic-bar h-1 bg-line">
                    <div
                      className="h-full bg-muted"
                      style={{
                        width: `${(count / Math.max(1, ...items.map(([, n]) => n))) * 100}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
