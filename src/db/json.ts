import { z } from "zod";

export const SamplesSchema = z.array(z.object({ input: z.string(), output: z.string() }));
export const TagsSchema = z.array(z.string());
