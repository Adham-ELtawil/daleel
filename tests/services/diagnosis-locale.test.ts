import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seed } from "@/src/db/seed";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { attempts, diagnoses, diagnosisTranslations } from "@/src/db/schema";
import { BudgetReached, createMetaClient, MetaApiError, SchemaError } from "@/src/llm/meta-client";
import { createReplayStore, ReplayMiss } from "@/src/llm/replay/store";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import { attemptDetail } from "@/src/services/attempt-service";
import type { DiagnosisLocaleDeps } from "@/src/services/diagnosis-locale";
import { createHandlers } from "@/src/services/handlers";
import { tempDb } from "@/tests/db/helpers";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";
import fixtureB from "@/tests/fixtures/llm/diagnosis-b.json";
import arabic from "@/tests/fixtures/llm/diagnosis-translation-a-ar.json";
import english from "@/tests/fixtures/llm/diagnosis-translation-b-en.json";

let store: Awaited<ReturnType<typeof tempDb>>;
let id: string;
const original = toPublic(DiagnosisSchema.parse(fixture));
const now = () => 1000;
const cached = () => store.db.select().from(diagnosisTranslations);
async function setup() {
  expect(
    existsSync("src/services/diagnosis-locale.ts"),
    "Localized diagnosis service is missing",
  ).toBe(true);
  const { localizedDiagnosis } = await import("@/src/services/diagnosis-locale");
  const { translateStepConfig } = await import("@/src/llm/prompts/translate");
  const llm = vi.fn<DiagnosisLocaleDeps["llm"]>(async () => arabic);
  const deps = { db: store.db, now, llm, config: translateStepConfig({}) };
  return { deps, llm, localizedDiagnosis };
}
beforeEach(async () => {
  store = await tempDb();
  await seed(store.db, now());
  const problem = (await getProblemByExternalId(store.db, "codeforces", "4A"))!;
  const response = await createHandlers({ db: async () => store.db, now }).attempt(
    new Request("http://localhost/api/attempts", {
      method: "POST",
      body: JSON.stringify({ problemId: problem.id, language: "cpp17", code: "int main(){}" }),
    }),
  );
  expect(response.status).toBe(200);
  ({ attemptId: id } = await response.json());
  await store.db.insert(diagnoses).values({
    id: "diagnosis",
    attemptId: id,
    resultJson: JSON.stringify(fixture),
    bugClass: fixture.bug_class,
    topicsJson: JSON.stringify(fixture.topics),
    confidence: fixture.confidence,
    model: "fixture-model",
    reasoningEffort: "low",
    createdAt: now(),
  });
});
afterEach(() => store.cleanup());

it.each([
  ["en", "ar-EG", fixture, arabic],
  ["ar-EG", "en", fixtureB, english],
] as const)(
  "translates %s to %s once and caches only the public diagnosis",
  async (sourceLocale, viewerLocale, fixture, translated) => {
    const { deps, llm, localizedDiagnosis } = await setup();
    llm.mockResolvedValue(translated);
    const source = toPublic(DiagnosisSchema.parse(fixture));
    const expected = {
      ...source,
      public_summary: translated.public_summary,
      approach: { ...source.approach, ...translated.approach },
      suspect_inputs: source.suspect_inputs.map((input, i) => ({
        ...input,
        why: translated.suspect_inputs[i].why,
      })),
    };
    expect(await localizedDiagnosis(deps, id, viewerLocale, source, sourceLocale)).toEqual(
      expected,
    );
    expect(await localizedDiagnosis(deps, id, viewerLocale, source, sourceLocale)).toEqual(
      expected,
    );
    expect(llm).toHaveBeenCalledOnce();
    expect(llm.mock.calls[0][0]).toMatchObject({
      step: "translate",
      reasoningEffort: "minimal",
      stream: false,
    });
    const rows = await cached();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ attemptId: id, locale: viewerLocale, createdAt: now() });
    expect(JSON.parse(rows[0].publicJson)).toEqual(expected);
    expect(rows[0].publicJson).not.toMatch(/_internal|brute/);
    const sent = JSON.stringify(llm.mock.calls[0][1]);
    expect(sent).not.toContain(fixture.root_cause_internal);
    expect(sent).not.toContain(fixture.fix_internal);
    expect(sent).not.toMatch(/"bug_class"|"complexity"|"expected_output"/);
  },
);
it.each(["en", "ar-EG"] as const)(
  "returns the original in %s without any model call or cache write",
  async (locale) => {
    const { deps, llm, localizedDiagnosis } = await setup();
    expect(await localizedDiagnosis(deps, id, locale, original, locale)).toBe(original);
    expect(llm).not.toHaveBeenCalled();
    expect(await cached()).toEqual([]);
  },
);
it.each([
  new ReplayMiss("translate", "a".repeat(64)),
  new BudgetReached(1, 1),
  new MetaApiError("private model detail", 500),
  new SchemaError("invalid translation"),
])("falls back without caching on $name, and allows a later retry", async (error) => {
  const { deps, llm, localizedDiagnosis } = await setup();
  llm.mockRejectedValueOnce(error);
  expect(await localizedDiagnosis(deps, id, "ar-EG", original, "en")).toBe(original);
  expect(await cached()).toEqual([]);
  expect((await localizedDiagnosis(deps, id, "ar-EG", original, "en")).public_summary).toBe(
    arabic.public_summary,
  );
  expect(llm).toHaveBeenCalledTimes(2);
});
it.each([0, 2, 4])(
  "rejects a translation with %s suspect explanations instead of 3",
  async (count) => {
    const { deps, llm, localizedDiagnosis } = await setup();
    llm.mockResolvedValue({
      ...arabic,
      suspect_inputs: Array.from({ length: count }, () => ({ why: "fixture" })),
    });
    expect(await localizedDiagnosis(deps, id, "ar-EG", original, "en")).toBe(original);
    expect(await cached()).toEqual([]);
  },
);
it("returns the persisted winner of concurrent translations", async () => {
  const { deps, llm, localizedDiagnosis } = await setup();
  let calls = 0;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  llm.mockImplementation(async () => {
    const call = ++calls;
    if (calls === 2) release();
    await ready;
    return { ...arabic, public_summary: `ترجمة ${call}` };
  });
  const results = await Promise.all([
    localizedDiagnosis(deps, id, "ar-EG", original, "en"),
    localizedDiagnosis(deps, id, "ar-EG", original, "en"),
  ]);
  const rows = await cached();
  expect(rows).toHaveLength(1);
  expect(results).toEqual([JSON.parse(rows[0].publicJson), JSON.parse(rows[0].publicJson)]);
});
it("handles a real replay miss without fetching or caching", async () => {
  const { deps, localizedDiagnosis } = await setup();
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error("Unexpected network");
  });
  const client = createMetaClient({
    apiKey: "",
    baseURL: "https://meta.test/v1",
    fetch,
    dailyBudgetUsd: 1,
    getSpentTodayUsd: async () => {
      throw new Error("Replay must not read the budget");
    },
    logCall: vi.fn(),
    replay: { mode: "replay", store: createReplayStore(join(tmpdir(), `pr29-absent-${id}`)) },
  });
  expect(
    await localizedDiagnosis({ ...deps, llm: client.callStructured }, id, "ar-EG", original, "en"),
  ).toBe(original);
  expect(fetch).not.toHaveBeenCalled();
  expect(await cached()).toEqual([]);
});
it("attemptDetail returns translated public text for the viewer and preserves diagnosis provenance", async () => {
  const { deps, llm } = await setup();
  await store.db.update(diagnoses).set({
    resultJson: JSON.stringify({ value: fixture, recordedAt: "2026-10-30T00:00:00.000Z" }),
  });
  const detail = await attemptDetail({ db: store.db, now, translate: deps }, id, "ar-EG");
  expect(detail.diagnosis).toMatchObject({
    public_summary: arabic.public_summary,
    approach: arabic.approach,
    suspect_inputs: arabic.suspect_inputs,
    replay: true,
    recordedAt: "2026-10-30T00:00:00.000Z",
  });
  expect(detail.attempt.locale).toBe("en");
  expect(llm).toHaveBeenCalledOnce();
});
it.each([
  ["?locale=ar-EG", "daleel_locale=en", "en"],
  ["", "daleel_locale=ar-EG", "en"],
  ["", "", "ar-EG,ar;q=0.9"],
])("GET attempt respects viewer preferences %s %s %s", async (query, cookie, language) => {
  const { deps, llm } = await setup();
  const handlers = createHandlers({ db: async () => store.db, now, translate: deps });
  const response = await handlers.getAttempt(
    new Request(`http://localhost/api/attempts/${id}${query}`, {
      headers: { cookie, "accept-language": language },
    }),
    id,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    diagnosis: { public_summary: arabic.public_summary },
  });
  expect(llm).toHaveBeenCalledOnce();
});
it("GET attempt keeps serving the original when translation is unavailable", async () => {
  const { deps, llm } = await setup();
  llm.mockRejectedValue(new ReplayMiss("translate", "a".repeat(64)));
  const handlers = createHandlers({ db: async () => store.db, now, translate: deps });
  const response = await handlers.getAttempt(
    new Request(`http://localhost/api/attempts/${id}?locale=ar-EG`),
    id,
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ diagnosis: original });
  expect(await cached()).toEqual([]);
  expect((await store.db.select().from(attempts).where(eq(attempts.id, id)).get())?.locale).toBe(
    "en",
  );
});
