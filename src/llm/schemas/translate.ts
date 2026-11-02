import { z } from "zod";
import { DiagnosisSchema } from "./diagnosis";

export function diagnosisTranslationSchema(inputCount?: number) {
  const fields = DiagnosisSchema.shape;
  const inputs = z.array(fields.suspect_inputs.element.pick({ why: true })).max(5);
  return z.strictObject({
    public_summary: fields.public_summary,
    approach: fields.approach.pick({ student_idea_public: true, correct_idea_family: true }),
    suspect_inputs: inputCount === undefined ? inputs : inputs.length(inputCount),
  });
}
export type DiagnosisTranslation = z.infer<ReturnType<typeof diagnosisTranslationSchema>>;
