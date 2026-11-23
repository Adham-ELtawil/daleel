import { z } from "zod";
import { DiagnosisSchema } from "@/src/llm/schemas/diagnosis";
import { StressPublicSchema } from "@/src/domain/stress-public";

const EventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("stage"),
    data: z.object({
      name: z.enum(["reading", "thinking", "validating", "checking_samples", "samples_clear"]),
    }),
  }),
  z.object({
    event: z.literal("preview"),
    data: z.object({ public_summary: z.string().min(1).max(240) }),
  }),
  z.object({
    event: z.literal("diagnosis"),
    data: z.object({
      replay: z.boolean(),
      recordedAt: z.iso.datetime().nullable(),
      public: DiagnosisSchema.omit({
        root_cause_internal: true,
        fix_internal: true,
        checked_internal: true,
      }),
    }),
  }),
  z.object({ event: z.literal("stress"), data: z.object({ result: StressPublicSchema }) }),
  z.object({ event: z.literal("ladder_ready"), data: z.object({ levels: z.literal(4) }) }),
  z.object({ event: z.literal("done"), data: z.object({}) }),
  z.object({
    event: z.literal("error"),
    data: z.object({
      code: z.enum(["budget_reached", "schema_error", "truncated", "llm_error"]),
      message: z.string(),
    }),
  }),
]);
export type DiagnoseEvent = z.infer<typeof EventSchema>;
export type StageName = Extract<DiagnoseEvent, { event: "stage" }>["data"]["name"];
export function serializeSse(event: DiagnoseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
export async function readSse(
  stream: ReadableStream<Uint8Array>,
  emit: (event: DiagnoseEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const lines = buffer
          .slice(0, end)
          .split("\n")
          .filter((line) => line.length > 0 && !line.startsWith(":"));
        buffer = buffer.slice(end + 2);
        const event = lines.find((line) => line.startsWith("event:"));
        const data = lines.find((line) => line.startsWith("data:"));
        // Comment-only frames are padding or heartbeats for proxies that buffer small writes.
        if (!event || !data) continue;
        const parsed = EventSchema.parse({
          event: event.slice(7),
          data: JSON.parse(data.slice(6)),
        });
        emit(parsed);
        terminal = parsed.event === "done" || parsed.event === "error";
      }
      if (done) break;
    }
    if (!terminal || buffer) throw new Error("Incomplete diagnosis stream");
  } finally {
    reader.releaseLock();
  }
}
