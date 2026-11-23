import { z } from "zod";
import { runVerdicts } from "@/src/domain/run-verdict";

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
  // Null unless the student's program was run. "wa" means it finished with the wrong output.
  student_status: z.enum(runVerdicts).nullable(),
});
export type StressPublic = z.infer<typeof StressPublicSchema>;
