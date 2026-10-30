import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

const StepSchema = z.enum(["normalize", "diagnose", "stress", "ladder", "explain", "report"]);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const TokensSchema = z.number().int().nonnegative();
const RecordingSchema = z.strictObject({
  provenance: z.strictObject({
    recordedAt: z.iso.datetime(),
    model: z.string().min(1),
    reasoningEffort: z.enum(["minimal", "low", "medium", "high", "xhigh"]),
    step: StepSchema,
    requestHash: HashSchema,
    usage: z.strictObject({
      input: TokensSchema,
      output: TokensSchema,
      cached: TokensSchema,
      reasoning: TokensSchema,
    }),
    costUsd: z.number().nonnegative(),
    latencyMs: z.number().nonnegative(),
    tool: z.literal("pnpm record:demo"),
  }),
  response: z.unknown(),
});
export type Recording = z.infer<typeof RecordingSchema>;
export class ReplayMiss extends Error {
  constructor(
    readonly step: Recording["provenance"]["step"],
    readonly requestHash: string,
  ) {
    super(`No recording for ${step}/${requestHash}`);
    this.name = "ReplayMiss";
  }
}
export type ReplayStore = ReturnType<typeof createReplayStore>;
export function createReplayStore(root = "recordings") {
  const path = (step: string, hash: string) =>
    join(root, StepSchema.parse(step), `${HashSchema.parse(hash)}.json`);
  return {
    async read(step: Recording["provenance"]["step"], hash: string): Promise<Recording | null> {
      let text: string;
      try {
        text = await readFile(path(step, hash), "utf8");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
      const recording = RecordingSchema.parse(JSON.parse(text));
      if (recording.provenance.step !== step || recording.provenance.requestHash !== hash)
        throw new Error("recording_provenance_mismatch");
      return recording;
    },
    async write(value: Recording): Promise<void> {
      const recording = RecordingSchema.parse(value);
      const { step, requestHash } = recording.provenance;
      const file = path(step, requestHash);
      const temp = `${file}.${randomUUID()}.tmp`;
      await mkdir(join(root, step), { recursive: true });
      try {
        await writeFile(temp, JSON.stringify(recording, null, 2) + "\n", { flag: "wx" });
        await rename(temp, file);
      } finally {
        await rm(temp, { force: true });
      }
    },
  };
}
