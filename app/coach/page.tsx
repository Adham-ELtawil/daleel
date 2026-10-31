import { headers } from "next/headers";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { connect, getDb } from "@/src/db/client";
import { teams } from "@/src/db/schema";
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
  const layout = "ms-auto me-auto max-w-5xl space-y-6 ps-6 pe-6 py-10";
  const message = (text: string) => (
    <main {...localeAttrs(locale)} className={layout}>
      <h1 className="text-2xl font-bold">{tr("title")}</h1>
      <p role="status" className="rounded border p-4">
        {text}
      </p>
    </main>
  );
  const db = await connect(getDb());
  const user = await getCurrentUser(db, (await headers()).get("cookie"));
  if (user.role !== "coach" || user.isGuest) return message(tr("coach_only"));
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
  const columns = ["attempts", "solved", "solvedRate", "avgHintLevelAtSolve"] as const;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const format = (key: (typeof columns)[number], value: number) => {
    return (key === "solvedRate" ? percent : number).format(value);
  };
  return (
    <main {...localeAttrs(locale)} className={layout}>
      <h1 className="text-2xl font-bold">{tr("title")}</h1>
      <form action="/coach" method="get" className="flex flex-wrap items-end gap-4">
        <label htmlFor="team">
          {tr("team")}
          <select id="team" name="team" defaultValue={team.id} className="ms-2 rounded border p-2">
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
            className="ms-2 rounded border p-2"
          />
        </label>
        <button type="submit" className="rounded border p-2">
          {tr("show")}
        </button>
      </form>
      <p>
        {tr("invite")}: <bdi dir="ltr">{team.inviteCode}</bdi>
      </p>
      {team.inviteCode === "DEMO0001" && <p>{tr("synthetic")}</p>}
      <Link
        className="inline-block underline"
        href={`/coach/report?${new URLSearchParams({ team: team.id, week: stats.weekStart })}`}
      >
        {t("title", locale, "report")}
      </Link>
      <dl className="grid gap-4 sm:grid-cols-4">
        {columns.map((key) => (
          <div key={key} className="rounded border p-3">
            <dt>{tr(key)}</dt>
            <dd className="text-xl font-bold">{format(key, stats[key])}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto">
        <table className="w-full text-start">
          <caption className="pb-3 text-start text-xl font-semibold">{tr("trainees")}</caption>
          <thead>
            <tr>
              {(["handle", ...columns] as const).map((key) => (
                <th key={key} scope="col" className="border-b p-2 text-start">
                  {tr(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.trainees.map((row) => (
              <tr key={row.userId}>
                <th scope="row" className="border-b p-2 text-start">
                  <bdi dir="ltr">{row.handle}</bdi>
                </th>
                {columns.map((key) => (
                  <td key={key} className="border-b p-2">
                    {format(key, row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!stats.attempts && (
          <p role="status" className="rounded border p-4">
            {tr("empty")}
          </p>
        )}
      </div>
      <section aria-labelledby="attention" className="space-y-2">
        <h2 id="attention" className="text-xl font-semibold">
          {tr("attention")}
        </h2>
        <p>{tr("attention_rule")}</p>
        {!stats.attention.length && <p>{tr("attention_empty")}</p>}
        <ul className="space-y-2">
          {stats.attention.map((row) => (
            <li key={row.userId}>
              <bdi dir="ltr">{row.handle}</bdi> · {tr("unsolved")}: {number.format(row.unsolved)} ·{" "}
              {tr("avgHintLevelAtSolve")}: {number.format(row.avgHintLevelAtSolve)}
            </li>
          ))}
        </ul>
      </section>
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
          <ul>
            {items.map(([label, count]) => (
              <li key={label}>
                <bdi dir={key === "bugs" ? "auto" : "ltr"}>
                  {key === "bugs" ? bugClassLabel(label, locale) : label}
                </bdi>
                : {number.format(count)}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
