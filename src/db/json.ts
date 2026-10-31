import { z } from "zod";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { StressPlanSchema } from "@/src/llm/schemas/stress";
import { StressPublicSchema } from "@/src/domain/stress-public";

export const SamplesSchema = z.array(z.object({ input: z.string(), output: z.string() }));
export const TagsSchema = z.array(z.string());
// A skipped/error run can have no tests; model plans still require at least one.
export const StressTestsSchema = z.array(StressPlanSchema.shape.tests.element).max(12);
export const StoredStressTestsSchema = z.union([
  z.strictObject({
    tests: StressTestsSchema,
    ...StressPublicSchema.pick({ source: true, contradiction: true }).shape,
  }),
  StressTestsSchema.transform((tests) => ({ tests, source: null, contradiction: false })),
]);

// Keep provenance outside model output; legacy rows are treated as live.
export const StoredDiagnosisSchema = z.union([
  z.strictObject({ value: DiagnosisSchema, recordedAt: z.iso.datetime().nullable() }),
  DiagnosisSchema.transform((value) => ({ value, recordedAt: null })),
]);
export const StoredLadderSchema = z.union([
  z.strictObject({ value: HintLadderSchema, recordedAt: z.iso.datetime().nullable() }),
  HintLadderSchema.shape.levels.transform((levels) => ({ value: { levels }, recordedAt: null })),
]);
