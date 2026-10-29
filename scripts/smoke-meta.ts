// `pnpm smoke:meta`: one tiny live structured call to the Meta Model API.
// Live check only; never part of `pnpm test`. Prints model, latency and usage; never prints the key.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { createMetaClient, jsonSchemaFor, type LlmCallRecord } from "@/src/llm/meta-client";

const SmokeSchema = z.object({ ok: z.boolean(), model_says: z.string() });

type Env = Record<string, string | undefined>;
type Deps = { fetch?: typeof fetch; print?: (line: string) => void };

export async function runSmoke(env: Env, deps: Deps = {}): Promise<number> {
  const print = deps.print ?? console.log;
  const apiKey = env.MODEL_API_KEY ?? "";
  const redact = (text: string) => (apiKey ? text.split(apiKey).join("***") : text);

  if (!apiKey) {
    print(
      "smoke:meta skipped: MODEL_API_KEY is not set. Add it to .env.local (see .env.example), then re-run.",
    );
    return 2;
  }

  const model = env.MODEL_NORMALIZE || "muse-spark-1.3";
  const records: LlmCallRecord[] = [];
  const client = createMetaClient({
    apiKey,
    baseURL: env.MODEL_API_BASE_URL || "https://api.meta.ai/v1",
    fetch: deps.fetch,
    dailyBudgetUsd: Number(env.DAILY_BUDGET_USD || 10),
    getSpentTodayUsd: async () => 0, // no DB in the smoke script; a single tiny call
    logCall: (rec) => {
      records.push(rec);
    },
  });

  try {
    const result = await client.callStructured(
      {
        step: "normalize",
        model,
        reasoningEffort: "low",
        // Muse Spark always reasons; small budgets end with finish_reason "length" and null content.
        maxCompletionTokens: 4000,
        stream: false,
        schemaName: "SmokeCheck",
        schema: jsonSchemaFor(SmokeSchema),
      },
      [
        { role: "developer", content: "Reply with JSON only. Set ok to true." },
        { role: "user", content: "Say hello in five words or fewer." },
      ],
      { zod: SmokeSchema },
    );
    const last = records.at(-1);
    print(`model: ${model}`);
    print(`result: ${JSON.stringify(result)}`);
    if (last) {
      print(`latency: ${last.latencyMs} ms, calls: ${records.length}`);
      print(
        `usage: prompt_tokens=${last.inputTokens} completion_tokens=${last.outputTokens} ` +
          `cached_tokens=${last.cachedTokens} reasoning_tokens=${last.reasoningTokens} ` +
          `cost_usd=${last.costUsd.toFixed(6)}`,
      );
    }
    return 0;
  } catch (err) {
    const status = err instanceof Error && "status" in err ? String(err.status) : "n/a";
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    print(redact(`smoke:meta failed (HTTP ${status}): ${message}`));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmoke(process.env).then((code) => process.exit(code));
}
