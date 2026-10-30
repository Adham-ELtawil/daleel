import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateLadder } from "@/src/domain/ladder-validator";
import { buildLadderMessages, ladderStepConfig } from "@/src/llm/prompts/ladder";
import { HintLadderSchema } from "@/src/llm/schemas/ladder";
import { runSmokeDiagnose } from "./smoke-diagnose";

export function runSmokeLadder(
  id: string,
  env: Record<string, string | undefined>,
  deps: { fetch?: typeof fetch; print?: (line: string) => void } = {},
): Promise<number> {
  return runSmokeDiagnose(id, env, {
    ...deps,
    onDiagnosed: async (diagnosis, input, client, print) => {
      const ladder = await client.callStructured(
        ladderStepConfig(env),
        buildLadderMessages({
          problem: input.problem,
          diagnosis,
          runnerResult: null,
          code: input.attempt.code,
          locale: input.locale,
        }),
        { zod: HintLadderSchema, cacheKey: `problem:${id}` },
      );
      const checked = validateLadder(ladder, {
        fixInternal: diagnosis.fix_internal,
        failingInput: null,
      });
      print(`validator: ${JSON.stringify(checked)}`);
      for (const level of ladder.levels) print(`${level.level}. ${level.title}\n${level.body_md}`);
      if (!checked.ok) throw new Error("invalid_ladder");
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  runSmokeLadder(process.argv[2] ?? "4A", process.env).then((code) => process.exit(code));
}
