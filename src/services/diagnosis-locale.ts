import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";
import type { Db } from "@/src/db/client";
import { diagnosisTranslations } from "@/src/db/schema";
import {
  jsonSchemaFor,
  type CallOptions,
  type ChatMessage,
  type LlmStepConfig,
} from "@/src/llm/meta-client";
import { buildTranslateMessages } from "@/src/llm/prompts/translate";
import { DiagnosisPublicSchema, type DiagnosisPublic } from "@/src/llm/schemas/diagnosis";
import { diagnosisTranslationSchema, type DiagnosisTranslation } from "@/src/llm/schemas/translate";

export type DiagnosisLocaleDeps = {
  db: Db;
  now: () => number;
  config: LlmStepConfig;
  userId?: string;
  llm: (
    config: LlmStepConfig,
    messages: ChatMessage[],
    options: CallOptions<DiagnosisTranslation>,
  ) => Promise<DiagnosisTranslation>;
};
export async function localizedDiagnosis(
  deps: DiagnosisLocaleDeps,
  attemptId: string,
  viewerLocale: "en" | "ar-EG",
  publicDiagnosis: DiagnosisPublic,
  attemptLocale: "en" | "ar-EG",
): Promise<DiagnosisPublic> {
  if (viewerLocale === attemptLocale) return publicDiagnosis;
  const key = and(
    eq(diagnosisTranslations.attemptId, attemptId),
    eq(diagnosisTranslations.locale, viewerLocale),
  );
  const read = () => deps.db.select().from(diagnosisTranslations).where(key).get();
  try {
    const cached = await read();
    if (cached) return DiagnosisPublicSchema.parse(JSON.parse(cached.publicJson));
    const schema = diagnosisTranslationSchema(publicDiagnosis.suspect_inputs.length);
    const translated = schema.parse(
      await deps.llm(
        { ...deps.config, schema: jsonSchemaFor(schema) },
        buildTranslateMessages({ diagnosis: publicDiagnosis, locale: viewerLocale }),
        { zod: schema, attemptId, userId: deps.userId },
      ),
    );
    const merged = DiagnosisPublicSchema.parse({
      ...publicDiagnosis,
      public_summary: translated.public_summary,
      approach: { ...publicDiagnosis.approach, ...translated.approach },
      suspect_inputs: publicDiagnosis.suspect_inputs.map((input, i) => ({
        ...input,
        why: translated.suspect_inputs[i].why,
      })),
    });
    await deps.db
      .insert(diagnosisTranslations)
      .values({
        id: ulid(deps.now()),
        attemptId,
        locale: viewerLocale,
        publicJson: JSON.stringify(merged),
        createdAt: deps.now(),
      })
      .onConflictDoNothing();
    const saved = await read();
    return saved ? DiagnosisPublicSchema.parse(JSON.parse(saved.publicJson)) : publicDiagnosis;
  } catch {
    // Translation is optional: replay misses, budget/API errors and invalid output must not break reads.
    return publicDiagnosis;
  }
}
