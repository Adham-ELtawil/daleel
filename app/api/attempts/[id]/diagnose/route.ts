import { connect, getDb } from "@/src/db/client";
import { diagnoseStepConfig } from "@/src/llm/prompts/diagnose";
import { ladderStepConfig } from "@/src/llm/prompts/ladder";
import { createDiagnoseHandler } from "@/src/services/diagnose-handler";
import { callModel, stressDeps } from "@/src/services/runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return createDiagnoseHandler({
    db: () => connect(getDb()),
    now: Date.now,
    config: diagnoseStepConfig(process.env),
    llm: callModel,
    ladder: { config: ladderStepConfig(process.env), llm: callModel },
    stress: stressDeps(process.env),
    parallelStress: process.env.DEMO_REPLAY !== "1" && process.env.DEMO_RECORD !== "1",
  })(request, (await params).id);
}
