import { z } from "zod";

export const SnapSchema = z.strictObject({
  public_summary: z.string().min(1).max(240),
});
export type Snap = z.infer<typeof SnapSchema>;
