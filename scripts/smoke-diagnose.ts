import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import problems from "@/src/db/seed-fixtures/problems.json";
import { validateDiagnosis } from "@/src/domain/diagnosis-validate";
import { createMetaClient, type LlmCallRecord } from "@/src/llm/meta-client";
import { buildDiagnoseMessages, diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { DiagnosisSchema, toPublic, type Diagnosis } from "@/src/llm/schemas/diagnosis";

export async function runSmokeDiagnose(
  id: string,
  env: Record<string, string | undefined>,
  deps: {
    fetch?: typeof fetch;
    print?: (line: string) => void;
    onDiagnosed?: (
      diagnosis: Diagnosis,
      input: Parameters<typeof buildDiagnoseMessages>[0],
      client: ReturnType<typeof createMetaClient>,
      print: (line: string) => void,
    ) => Promise<void>;
  } = {},
): Promise<number> {
  const kind = deps.onDiagnosed ? "ladder" : "diagnose";
  const apiKey = env.MODEL_API_KEY ?? "";
  const print = (line: string) =>
    (deps.print ?? console.log)(apiKey ? line.split(apiKey).join("***") : line);
  if (!apiKey) {
    print(
      `smoke:${kind} skipped: MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then re-run.`,
    );
    return 2;
  }
  if (id !== "4A" && id !== "1A") {
    print(`Usage: pnpm smoke:${kind} 4A | 1A`);
    return 2;
  }
  try {
    const seed = problems.find((p) => p.externalId === id);
    if (!seed) throw new Error("Seed problem is missing");
    const slug = id === "4A" ? "watermelon" : "theatre-square";
    const code = readFileSync(`docs/examples/cf-${id}-${slug}/student.cpp`, "utf8");
    const records: LlmCallRecord[] = [];
    const client = createMetaClient({
      apiKey,
      baseURL: env.MODEL_API_BASE_URL || "https://api.meta.ai/v1",
      fetch: deps.fetch,
      dailyBudgetUsd: Number(env.DAILY_BUDGET_USD || 10),
      getSpentTodayUsd: async () => 0,
      logCall: (record) => {
        records.push(record);
      },
    });
    const input: Parameters<typeof buildDiagnoseMessages>[0] = {
      problem: { ...seed, judge: "codeforces" },
      attempt: {
        code,
        language: "cpp17",
        verdictReported: "WA",
        verdictTestNo: id === "4A" ? 5 : 9,
        studentNote:
          id === "4A" ? "even means split in two even halves" : "عملت ceil بالقسمة وبعدين ضربت",
      },
      locale: id === "4A" ? "en" : "ar-EG",
    };
    const diagnosis = validateDiagnosis(
      await client.callStructured(diagnoseStepConfig(env), buildDiagnoseMessages(input), {
        zod: DiagnosisSchema,
        cacheKey: `problem:${id}`,
      }),
      code,
    );
    await deps.onDiagnosed?.(diagnosis, input, client, print);
    const result = toPublic(diagnosis);
    for (const field of ["bug_class", "confidence", "lines", "public_summary"] as const) {
      const value = result[field];
      print(`${field}: ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
    const last = records.at(-1);
    if (last) {
      const total = (
        field: "inputTokens" | "outputTokens" | "cachedTokens" | "reasoningTokens" | "costUsd",
      ) => records.reduce((sum, r) => sum + r[field], 0);
      print(
        `latency: ${records.reduce((sum, r) => sum + r.latencyMs, 0)} ms, calls: ${records.length}`,
      );
      print(
        `usage: prompt_tokens=${total("inputTokens")} completion_tokens=${total("outputTokens")} ` +
          `cached_tokens=${total("cachedTokens")} reasoning_tokens=${total("reasoningTokens")} ` +
          `cost_usd=${(Math.round(total("costUsd") * 1e6) / 1e6).toFixed(6)}`,
      );
    }
    return 0;
  } catch (error) {
    // API/schema errors may echo secrets or internal diagnosis fields. Print only the error class.
    print(
      `smoke:${kind} failed (${error instanceof Error ? error.name : "UnknownError"}). Check the model configuration and API availability.`,
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeDiagnose(process.argv[2] ?? "4A", process.env).then((code) => process.exit(code));
}
