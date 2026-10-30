import { z } from "zod";

export const HintLadderSchema = z.strictObject({
  levels: z
    .array(
      z.strictObject({
        level: z.number().multipleOf(1).min(1).max(4),
        kind: z.enum(["nudge", "concept", "precise", "full"]),
        title: z.string().max(80),
        body_md: z.string().max(1500),
        question_back: z.string().max(200).nullable(),
      }),
    )
    .length(4),
});
export type HintLadder = z.infer<typeof HintLadderSchema>;
