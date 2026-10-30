import { z } from "zod";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";

export const SamplesSchema = z.array(z.object({ input: z.string(), output: z.string() }));
export const TagsSchema = z.array(z.string());

// Keep provenance outside model output; legacy rows are treated as live.
export const StoredDiagnosisSchema = z.union([
  z.strictObject({ value: DiagnosisSchema, recordedAt: z.iso.datetime().nullable() }),
  DiagnosisSchema.transform((value) => ({ value, recordedAt: null })),
]);
export const StoredLadderSchema = z.union([
  z.strictObject({ value: HintLadderSchema, recordedAt: z.iso.datetime().nullable() }),
  HintLadderSchema.shape.levels.transform((levels) => ({ value: { levels }, recordedAt: null })),
]);
