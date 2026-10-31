import { z } from "zod";

const integer = z.number().multipleOf(1);
const VariableSchema = z.strictObject({
  name: z.string().max(20),
  value: z.string().max(40),
  changed: z.boolean(),
});
const TraceArraySchema = z.strictObject({
  name: z.string().max(20),
  values: z.array(z.string().max(12)).max(16),
  highlight: z.array(integer.min(0)).max(16),
  pointers: z.array(z.strictObject({ name: z.string().max(8), index: integer.min(0) })).max(4),
});
const FrameSchema = z.strictObject({
  code_line: integer.nullable(),
  caption: z.string().max(240),
  arrays: z.array(TraceArraySchema).max(3),
  vars: z.array(VariableSchema).max(8),
});
export const TraceSchema = z.strictObject({
  input: z.string().max(500),
  expected_output: z.string().max(300),
  student_output: z.string().max(300),
  frames: z.array(FrameSchema).min(1).max(40),
});
export const ExplanationPublicSchema = z.strictObject({
  explanation_md: z.string().max(3000),
  fix: z
    .array(
      z.strictObject({ line: integer.min(1), old: z.string().max(300), new: z.string().max(300) }),
    )
    .max(10),
  complexity_note: z.string().max(300).nullable(),
});
export const ExplanationSchema = ExplanationPublicSchema.extend({ trace: TraceSchema });
export type Explanation = z.infer<typeof ExplanationSchema>;
