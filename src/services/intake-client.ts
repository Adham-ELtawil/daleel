import type { Problem } from "@/src/db/repo/problems";
import type { t } from "@/src/i18n";
import { HttpError } from "./http-error";

async function read<T>(response: Response): Promise<T> {
  const data: T & { error?: { code: Parameters<typeof t>[0] } } = await response.json();
  if (!response.ok) throw new HttpError(response.status, data.error?.code ?? "internal_error");
  return data;
}
export async function post<T>(path: string, body: unknown): Promise<T> {
  return read(
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
export async function preloadProblem(id: string) {
  return (await read<{ problem: Problem }>(await fetch(`/api/problems/${encodeURIComponent(id)}`)))
    .problem;
}
export async function startIdeaAttempt(problemId: string, push: (path: string) => void) {
  const { attemptId } = await post<{ attemptId: string }>("/api/attempts", {
    problemId,
    mode: "idea",
  });
  push(`/attempt/${attemptId}`);
}
