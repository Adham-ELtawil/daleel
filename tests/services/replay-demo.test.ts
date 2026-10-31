import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ZodType } from "zod";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { connect, createDb } from "@/src/db/client";
import { recordLlmCall } from "@/src/db/repo/llm-calls";
import { getProblemByExternalId } from "@/src/db/repo/problems";
import { seed } from "@/src/db/seed";
import { createMetaClient, type ChatMessage, type LlmStepConfig } from "@/src/llm/meta-client";
import { buildDiagnoseMessages, diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { buildLadderMessages, ladderStepConfig } from "@/src/llm/prompts/ladder";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { createReplayStore } from "@/src/llm/replay/store";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";
import { createHandlers } from "@/src/services/handlers";
import { readSse, type DiagnoseEvent } from "@/src/services/sse";
import { tempDb } from "@/tests/db/helpers";
import { chatCompletion, createFakeFetch, noNetworkFetch } from "@/tests/llm/fake-fetch";
import problems from "@/src/db/seed-fixtures/problems.json";

const hashFor = (config: LlmStepConfig, messages: ChatMessage[]) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        config.model,
        config.reasoningEffort,
        config.schemaName,
        config.schema,
        messages,
      ]),
    )
    .digest("hex");
async function findRecording<T>(
  config: LlmStepConfig,
  messages: ChatMessage[],
  schema: ZodType<T>,
  root = "recordings",
) {
  const hash = hashFor(config, messages);
  const replay = createReplayStore(root);
  for (const file of await readdir(join(root, config.step))) {
    if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
    const recording = await replay.read(config.step, file.slice(0, -5));
    if (
      recording?.provenance.requestHash === hash &&
      recording.provenance.model === config.model &&
      recording.provenance.reasoningEffort === config.reasoningEffort
    ) {
      return { ...recording, response: schema.parse(recording.response) };
    }
  }
  throw new Error(`Missing matching 4A ${config.step} recording`);
}
const code = readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8");
const problem = { ...problems[0], judge: "codeforces" as const };
const student = {
  code,
  language: "cpp17" as const,
  verdictReported: null,
  verdictTestNo: null,
  studentNote: null,
};
const diagnosisConfig = diagnoseStepConfig({});
const diagnosisMessages = buildDiagnoseMessages({ problem, attempt: student, locale: "en" });
const diagnosis = await findRecording(diagnosisConfig, diagnosisMessages, DiagnosisSchema);
const ladder = await findRecording(
  ladderStepConfig({}),
  buildLadderMessages({
    problem,
    code,
    diagnosis: validateDiagnosis(diagnosis.response, code),
    runnerResult: null,
    locale: "en",
  }),
  HintLadderSchema,
);

let store: Awaited<ReturnType<typeof tempDb>>;
const now = () => Date.UTC(2026, 9, 30, 13);
const request = (body: unknown = {}) =>
  new Request("http://localhost/api", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  vi.stubGlobal("fetch", noNetworkFetch);
  store = await tempDb();
  await seed(store.db, now());
});
afterEach(() => {
  store.cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup(mode: "replay" | "off", fetch = vi.fn(noNetworkFetch), db = store.db) {
  const client = createMetaClient({
    apiKey: mode === "replay" ? "" : "fake-key",
    baseURL: "https://meta.test/v1",
    fetch,
    dailyBudgetUsd: 10,
    getSpentTodayUsd: async () => 0,
    logCall: (log) => recordLlmCall(db, log, now()),
    replay: { mode, store: createReplayStore("recordings") },
  });
  const ladderDeps = { llm: client.callStructured, config: ladderStepConfig({}) };
  return {
    fetch,
    handlers: createHandlers({ db: async () => db, now, ladder: ladderDeps }),
    diagnose: createDiagnoseHandler({
      db: async () => db,
      now,
      llm: client.callStructured,
      config: diagnoseStepConfig({}),
      ladder: ladderDeps,
    }),
  };
}
async function attempt(handlers: ReturnType<typeof setup>["handlers"]) {
  const problem = (await getProblemByExternalId(store.db, "codeforces", "4A"))!;
  const response = await handlers.attempt(
    request({
      problemId: problem.id,
      language: "cpp17",
      code: readFileSync("docs/examples/cf-4A-watermelon/student.cpp", "utf8"),
    }),
  );
  expect(response.status).toBe(200);
  const { attemptId }: { attemptId: string } = await response.json();
  return attemptId;
}
async function diagnose(flow: ReturnType<typeof setup>, id: string) {
  const response = await flow.diagnose(request(), id);
  expect(response.status).toBe(200);
  const events: DiagnoseEvent[] = [];
  await readSse(response.body!, (event) => events.push(event));
  expect(events.map((e) => e.event)).toEqual([
    "stage",
    "stage",
    "stage",
    "diagnosis",
    "ladder_ready",
    "done",
  ]);
  return events[3];
}
it("replays the committed 4A diagnosis and ladder with no key or network calls", async () => {
  const flow = setup("replay");
  expect(await diagnose(flow, await attempt(flow.handlers))).toMatchObject({
    event: "diagnosis",
    data: { replay: true, recordedAt: diagnosis.provenance.recordedAt },
  });
  expect(flow.fetch).not.toHaveBeenCalled();
});
it("finds re-recorded 4A content using its current provenance rather than an old filename", async () => {
  const root = mkdtempSync(join(tmpdir(), "pr16-replay-"));
  try {
    const messages = buildDiagnoseMessages({
      problem,
      attempt: { ...student, studentNote: "Check the minimum weight" },
      locale: "en",
    });
    const updated = {
      ...diagnosis,
      provenance: { ...diagnosis.provenance, requestHash: hashFor(diagnosisConfig, messages) },
    };
    const replay = createReplayStore(root);
    await replay.write(diagnosis);
    await replay.write(updated);
    expect(await findRecording(diagnosisConfig, messages, DiagnosisSchema, root)).toEqual(updated);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it("reports replay:false for a live transport fake even when DEMO_REPLAY is set", async () => {
  vi.stubEnv("DEMO_REPLAY", "1");
  const fake = createFakeFetch([
    {
      status: 200,
      sse: `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: JSON.stringify(diagnosis.response) }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
    },
    { status: 200, json: chatCompletion(JSON.stringify(ladder.response)) },
  ]);
  const flow = setup("off", vi.fn(fake.fetch));
  const id = await attempt(flow.handlers);
  expect(await diagnose(flow, id)).toMatchObject({ data: { replay: false, recordedAt: null } });
  expect(await (await flow.handlers.nextHint(request(), id)).json()).toMatchObject({
    replay: false,
    recordedAt: null,
  });
  expect(
    await (await flow.handlers.getAttempt(new Request("http://localhost/api"), id)).json(),
  ).toMatchObject({
    replay: false,
    recordedAt: null,
    diagnosis: { replay: false, recordedAt: null },
  });
  expect(fake.requests).toHaveLength(2);
});
it("preserves diagnosis and ladder provenance across reloads, reveals and diagnosis cache copies", async () => {
  const flow = setup("replay");
  const id = await attempt(flow.handlers);
  await diagnose(flow, id);
  const other = createDb({ url: store.url });
  try {
    await connect(other.db);
    const reload = setup("off", vi.fn(noNetworkFetch), other.db);
    const metadata = { replay: true, recordedAt: ladder.provenance.recordedAt };
    expect(
      await (await reload.handlers.getAttempt(new Request("http://localhost/api"), id)).json(),
    ).toMatchObject({
      ...metadata,
      diagnosis: { replay: true, recordedAt: diagnosis.provenance.recordedAt },
      revealedHints: [],
    });
    expect(await (await reload.handlers.nextHint(request(), id)).json()).toMatchObject({
      ...metadata,
      hint: { level: 1 },
      remaining: 3,
    });
    expect(
      await (await reload.handlers.getAttempt(new Request("http://localhost/api"), id)).json(),
    ).toMatchObject({
      ...metadata,
      revealedHints: [{ level: 1 }],
    });
    expect(reload.fetch).not.toHaveBeenCalled();
    const copy = await attempt(flow.handlers);
    expect(await diagnose(flow, copy)).toMatchObject({
      data: { replay: true, recordedAt: diagnosis.provenance.recordedAt },
    });
    expect(flow.fetch).not.toHaveBeenCalled();
  } finally {
    other.close();
  }
});
