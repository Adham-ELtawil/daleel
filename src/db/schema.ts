import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

const locales = ["ar-EG", "en"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  handle: text("handle").notNull().unique(),
  role: text("role", { enum: ["student", "coach"] }).notNull(),
  locale: text("locale", { enum: locales }).notNull(),
  cfHandle: text("cf_handle"),
  isGuest: integer("is_guest").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  coachId: text("coach_id")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: integer("created_at").notNull(),
});

export const teamMembers = sqliteTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: integer("joined_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.userId] }),
    index("team_members_user_idx").on(table.userId),
  ],
);

export const problems = sqliteTable(
  "problems",
  {
    id: text("id").primaryKey(),
    judge: text("judge", { enum: ["codeforces", "atcoder", "custom"] }).notNull(),
    externalId: text("external_id").notNull(),
    url: text("url"),
    title: text("title").notNull(),
    statementMd: text("statement_md").notNull(),
    inputSpecMd: text("input_spec_md").notNull(),
    outputSpecMd: text("output_spec_md").notNull(),
    notesMd: text("notes_md"),
    samplesJson: text("samples_json").notNull(),
    timeLimitMs: integer("time_limit_ms").notNull(),
    memoryLimitMb: integer("memory_limit_mb").notNull(),
    rating: integer("rating"),
    tagsJson: text("tags_json").notNull(),
    contestId: text("contest_id"),
    contentHash: text("content_hash").notNull(),
    fetchedAt: integer("fetched_at").notNull(),
  },
  (table) => [unique("problems_judge_external_id_unique").on(table.judge, table.externalId)],
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    problemId: text("problem_id")
      .notNull()
      .references(() => problems.id),
    parentAttemptId: text("parent_attempt_id").references((): AnySQLiteColumn => attempts.id),
    language: text("language", { enum: ["cpp17", "python3"] }).notNull(),
    code: text("code").notNull(),
    codeHash: text("code_hash").notNull(),
    verdictReported: text("verdict_reported"),
    verdictTestNo: integer("verdict_test_no"),
    studentNote: text("student_note"),
    locale: text("locale", { enum: locales }).notNull(),
    status: text("status", {
      enum: ["new", "diagnosing", "diagnosed", "error", "solved", "stuck"],
    }).notNull(),
    maxHintLevel: integer("max_hint_level").notNull().default(0),
    solvedAt: integer("solved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("attempts_user_created_idx").on(table.userId, table.createdAt),
    index("attempts_problem_code_locale_idx").on(table.problemId, table.codeHash, table.locale),
  ],
);

export const diagnoses = sqliteTable("diagnoses", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .unique()
    .references(() => attempts.id),
  resultJson: text("result_json").notNull(),
  bugClass: text("bug_class").notNull(),
  topicsJson: text("topics_json").notNull(),
  confidence: real("confidence").notNull(),
  model: text("model").notNull(),
  reasoningEffort: text("reasoning_effort").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const stressRuns = sqliteTable("stress_runs", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .unique()
    .references(() => attempts.id),
  status: text("status", {
    enum: ["verified", "no_mismatch", "brute_untrusted", "compile_error", "skipped", "error"],
  }).notNull(),
  runner: text("runner").notNull(),
  bruteCode: text("brute_code"),
  testsJson: text("tests_json").notNull(),
  failingInput: text("failing_input"),
  expectedOutput: text("expected_output"),
  actualOutput: text("actual_output"),
  compileOutput: text("compile_output"),
  createdAt: integer("created_at").notNull(),
});

export const hintLadders = sqliteTable(
  "hint_ladders",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id),
    locale: text("locale", { enum: locales }).notNull(),
    levelsJson: text("levels_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [unique("hint_ladders_attempt_locale_unique").on(table.attemptId, table.locale)],
);

export const hintReveals = sqliteTable(
  "hint_reveals",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id),
    level: integer("level").notNull(),
    revealedAt: integer("revealed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.attemptId, table.level] })],
);

export const walkthroughs = sqliteTable(
  "walkthroughs",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id),
    locale: text("locale", { enum: locales }).notNull(),
    explanationJson: text("explanation_json").notNull(),
    traceJson: text("trace_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [unique("walkthroughs_attempt_locale_unique").on(table.attemptId, table.locale)],
);

export const weeklyReports = sqliteTable(
  "weekly_reports",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id),
    weekStart: text("week_start").notNull(),
    locale: text("locale", { enum: locales }).notNull(),
    statsJson: text("stats_json").notNull(),
    reportJson: text("report_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    unique("weekly_reports_team_week_locale_unique").on(
      table.teamId,
      table.weekStart,
      table.locale,
    ),
  ],
);

export const llmCalls = sqliteTable(
  "llm_calls",
  {
    id: text("id").primaryKey(),
    step: text("step", {
      enum: ["normalize", "diagnose", "stress", "ladder", "explain", "report", "asr"],
    }).notNull(),
    attemptId: text("attempt_id").references(() => attempts.id),
    model: text("model").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status", { enum: ["ok", "error", "replay"] }).notNull(),
    httpStatus: integer("http_status"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cachedTokens: integer("cached_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    error: text("error"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("llm_calls_created_idx").on(table.createdAt)],
);
