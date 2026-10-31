import { z } from "zod";

export const StressPublicSchema = z.strictObject({
  status: z.enum([
    "verified",
    "no_mismatch",
    "brute_untrusted",
    "compile_error",
    "skipped",
    "error",
  ]),
  failing_input: z.string().nullable(),
  expected_output: z.string().nullable(),
  actual_output: z.string().nullable(),
  compile_output: z.string().nullable(),
  source: z.enum(["sample", "test"]).nullable(),
  contradiction: z.boolean(),
});
export type StressPublic = z.infer<typeof StressPublicSchema>;
