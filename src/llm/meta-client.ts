// The only module allowed to talk to the Meta Model API (AGENTS.md "LLM rules").
// Behaviour spec: docs/03-ARCHITECTURE.md §5.3.
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z, type ZodType } from "zod";
import { costUsd } from "./pricing";
import { ReplayMiss, type ReplayStore } from "./replay/store";

export type LlmStep = "normalize" | "diagnose" | "stress" | "ladder" | "explain" | "report";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface LlmStepConfig {
  step: LlmStep;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxCompletionTokens: number;
  stream: boolean;
  schemaName: string;
  schema: object;
}

export type ChatMessage = { role: "developer" | "user" | "assistant"; content: string };

export type LlmCallRecord = {
  step: LlmStep;
  attemptId: string | null;
  model: string;
  requestHash: string;
  status: "ok" | "error" | "replay";
  httpStatus: number | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number;
  error: string | null;
};

export type MetaClientDeps = {
  apiKey: string;
  baseURL: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
  promptCacheRetention?: "in_memory" | "24h";
  dailyBudgetUsd: number;
  getSpentTodayUsd: () => Promise<number>;
  logCall: (rec: LlmCallRecord) => Promise<void> | void;
  replay?: { mode: "off" | "replay" | "record"; store: ReplayStore };
};

export type CallOptions<T> = {
  onReplay?: (recordedAt: string) => void;
  signal?: AbortSignal;
  attemptId?: string;
  userId?: string;
  cacheKey?: string;
  zod: ZodType<T>;
};

export class BudgetReached extends Error {
  constructor(spent: number, limit: number) {
    super(`Daily LLM budget reached ($${spent.toFixed(4)} of $${limit})`);
    this.name = "BudgetReached";
  }
}

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

export class OutputTruncated extends Error {
  constructor(maxCompletionTokens: number) {
    super(
      `Model output hit finish_reason "length" even with max_completion_tokens=${maxCompletionTokens}`,
    );
    this.name = "OutputTruncated";
  }
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 3;

/** zod → JSON Schema for `response_format`, without the `$schema` key. */
export function jsonSchemaFor(schema: ZodType): object {
  const json: Record<string, unknown> = {
    ...z.toJSONSchema(schema, {
      override: ({ jsonSchema: node }) => {
        // Equivalent encodings required by docs/04-PROMPTS.md §1.2.
        if (node.type === "number" && node.multipleOf === 1) {
          node.type = "integer";
          delete node.multipleOf;
        }
        const branches = node.anyOf;
        if (
          branches?.length === 2 &&
          branches[1].type === "null" &&
          typeof branches[0].type === "string" &&
          !branches[0].enum &&
          !Object.hasOwn(branches[0], "const") &&
          !branches[0].$ref
        ) {
          Object.assign(node, branches[0], { type: [branches[0].type, "null"] });
          delete node.anyOf;
        }
      },
    }),
  };
  delete json.$schema;
  return json;
}

type Completion = {
  content: string | null;
  finishReason: string | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    cachedTokens: number;
    reasoningTokens: number;
  };
};

type RawUsage = OpenAI.CompletionUsage | null | undefined;

function readUsage(u: RawUsage): Completion["usage"] {
  return {
    promptTokens: u?.prompt_tokens ?? 0,
    completionTokens: u?.completion_tokens ?? 0,
    cachedTokens: u?.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: u?.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function createMetaClient(deps: MetaClientDeps) {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const now = deps.now ?? Date.now;
  let sdk: OpenAI | undefined;

  function client(): OpenAI {
    if (!deps.apiKey) {
      throw new Error("MODEL_API_KEY is not set. Put it in .env.local (see .env.example).");
    }
    sdk ??= new OpenAI({
      apiKey: deps.apiKey,
      baseURL: deps.baseURL,
      fetch: deps.fetch,
      maxRetries: 0, // retries are ours (backoff + Retry-After + logging)
    });
    return sdk;
  }

  async function request(
    body: Record<string, unknown>,
    stream: boolean,
    signal?: AbortSignal,
  ): Promise<Completion> {
    const api = client();
    if (!stream) {
      const res = await api.chat.completions.create(
        {
          ...body,
          stream: false,
        } as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
        { signal },
      );
      const choice = res.choices[0];
      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? null,
        usage: readUsage(res.usage),
      };
    }
    const chunks = await api.chat.completions.create(
      {
        ...body,
        stream: true,
        stream_options: { include_usage: true },
      } as unknown as OpenAI.ChatCompletionCreateParamsStreaming,
      { signal },
    );
    let content = "";
    let finishReason: string | null = null;
    let usage: RawUsage;
    for await (const chunk of chunks) {
      const choice = chunk.choices[0];
      if (choice?.delta?.content) content += choice.delta.content;
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    return { content: content || null, finishReason, usage: readUsage(usage) };
  }

  function backoffMs(retry: number, err: unknown): number {
    const base = 500 * 2 ** retry + Math.floor(random() * 250);
    const header = err instanceof OpenAI.APIError ? err.headers?.get("retry-after") : null;
    const retryAfter = header ? Number(header) * 1000 : 0;
    return Math.max(base, Number.isFinite(retryAfter) ? retryAfter : 0);
  }

  async function callStructured<T>(
    cfg: LlmStepConfig,
    messages: ChatMessage[],
    opts: CallOptions<T>,
  ): Promise<T> {
    const requestHash = sha256(
      JSON.stringify([cfg.model, cfg.reasoningEffort, cfg.schemaName, cfg.schema, messages]),
    );
    const base = {
      model: cfg.model,
      reasoning_effort: cfg.reasoningEffort,
      response_format: {
        type: "json_schema",
        json_schema: { name: cfg.schemaName, schema: cfg.schema, strict: true },
      },
      prompt_cache_retention: deps.promptCacheRetention ?? "24h",
      ...(opts.cacheKey ? { prompt_cache_key: opts.cacheKey } : {}),
      ...(opts.userId ? { safety_identifier: sha256(opts.userId).slice(0, 64) } : {}),
    };

    const log = (rec: Partial<LlmCallRecord> & Pick<LlmCallRecord, "status" | "latencyMs">) =>
      deps.logCall({
        step: cfg.step,
        attemptId: opts.attemptId ?? null,
        model: cfg.model,
        requestHash,
        httpStatus: null,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        reasoningTokens: 0,
        costUsd: 0,
        error: null,
        ...rec,
      });

    if (deps.replay?.mode === "replay") {
      const started = now();
      const recording = await deps.replay.store.read(cfg.step, requestHash);
      if (!recording) throw new ReplayMiss(cfg.step, requestHash);
      const checked = opts.zod.safeParse(recording.response);
      if (!checked.success) throw new SchemaError("invalid_replay_response");
      await log({ status: "replay", latencyMs: now() - started });
      opts.onReplay?.(recording.provenance.recordedAt);
      return checked.data;
    }
    client(); // Live mode fails fast on a missing key.
    const spent = await deps.getSpentTodayUsd();
    if (spent >= deps.dailyBudgetUsd) throw new BudgetReached(spent, deps.dailyBudgetUsd);

    let msgs = messages;
    let maxTokens = cfg.maxCompletionTokens;
    let truncationRetried = false;
    let repairRetried = false;
    let recordedUsage: Completion["usage"] | undefined;
    let recordedCost = 0;
    let recordedLatency = 0;

    for (;;) {
      const body = { ...base, messages: msgs, max_completion_tokens: maxTokens };
      let completion: Completion | undefined;
      for (let retry = 0; !completion; retry++) {
        if (deps.replay?.mode === "record") {
          // Reserve uncached input (one token per UTF-8 byte plus envelope overhead)
          // and the full completion allowance, including reasoning, before every retry.
          const remaining = await deps.getSpentTodayUsd();
          const ceiling = costUsd(cfg.model, {
            promptTokens: Buffer.byteLength(JSON.stringify(body), "utf8") + 1024,
            completionTokens: maxTokens,
            cachedTokens: 0,
          });
          if (remaining + ceiling > deps.dailyBudgetUsd)
            throw new BudgetReached(remaining, deps.dailyBudgetUsd);
        }
        const started = now();
        try {
          completion = await request(body, cfg.stream, opts.signal);
        } catch (err) {
          const status = err instanceof OpenAI.APIError ? (err.status ?? null) : null;
          const message = err instanceof Error ? err.message : String(err);
          await log({
            status: "error",
            httpStatus: status,
            latencyMs: now() - started,
            error: message,
          });
          const retryable =
            status === null ? err instanceof OpenAI.APIConnectionError : RETRYABLE.has(status);
          if (!retryable || retry >= MAX_RETRIES) throw new MetaApiError(message, status);
          await sleep(backoffMs(retry, err));
          continue;
        }
        const u = completion.usage;
        recordedUsage = u;
        recordedCost = costUsd(cfg.model, u);
        recordedLatency = now() - started;
        const truncated = completion.finishReason === "length";
        await log({
          status: truncated ? "error" : "ok",
          httpStatus: 200,
          inputTokens: u.promptTokens,
          outputTokens: u.completionTokens,
          cachedTokens: u.cachedTokens,
          reasoningTokens: u.reasoningTokens,
          costUsd: recordedCost,
          latencyMs: recordedLatency,
          error: truncated ? 'finish_reason "length" (output budget too small)' : null,
        });
      }

      if (completion.finishReason === "length") {
        if (truncationRetried) throw new OutputTruncated(maxTokens);
        truncationRetried = true;
        maxTokens *= 2; // Muse Spark always reasons; reasoning tokens count against this budget
        continue;
      }

      const checked = validate(completion.content, opts.zod);
      if (checked.ok) {
        if (deps.replay?.mode === "record" && recordedUsage) {
          const recording = {
            provenance: {
              recordedAt: new Date(now()).toISOString(),
              model: cfg.model,
              reasoningEffort: cfg.reasoningEffort,
              step: cfg.step,
              requestHash,
              usage: {
                input: recordedUsage.promptTokens,
                output: recordedUsage.completionTokens,
                cached: recordedUsage.cachedTokens,
                reasoning: recordedUsage.reasoningTokens,
              },
              costUsd: recordedCost,
              latencyMs: recordedLatency,
              tool: "pnpm record:demo" as const,
            },
            response: checked.value,
          };
          if (JSON.stringify(recording).includes(deps.apiKey))
            throw new SchemaError("recording_contains_secret");
          await deps.replay.store.write(recording);
        }
        return checked.value;
      }
      if (repairRetried) throw new SchemaError(checked.error);
      repairRetried = true;
      msgs = [
        ...messages,
        {
          role: "developer",
          content: `Your previous output did not match the schema: ${checked.error}. Return only valid JSON.`,
        },
      ];
    }
  }

  return { callStructured };
}

function validate<T>(
  content: string | null,
  schema: ZodType<T>,
): { ok: true; value: T } | { ok: false; error: string } {
  if (!content) return { ok: false, error: "empty content" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "output is not valid JSON" };
  }
  const result = schema.safeParse(parsed);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: z.prettifyError(result.error) };
}
