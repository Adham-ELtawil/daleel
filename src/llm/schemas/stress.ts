import { z } from "zod";

export const StressPlanSchema = z.strictObject({
  brute_cpp: z.string().max(12000),
  tests: z
    .array(z.strictObject({ input: z.string().max(4000), purpose: z.string().max(120) }))
    .min(1)
    .max(12),
  checker: z.enum(["exact_tokens", "float_1e6", "any_valid"]),
  brute_complexity: z.string().max(60),
});

export type StressPlan = z.infer<typeof StressPlanSchema>;
