import { expect, it } from "vitest";
import { readSse, serializeSse, type DiagnoseEvent } from "@/src/services/sse";

it("serializes SSE with a JSON data line and a blank line terminator", () => {
  expect(serializeSse({ event: "stage", data: { name: "reading" } })).toBe(
    'event: stage\ndata: {"name":"reading"}\n\n',
  );
  expect(
    serializeSse({ event: "error", data: { code: "llm_error", message: "First\nSecond" } }),
  ).toBe('event: error\ndata: {"code":"llm_error","message":"First\\nSecond"}\n\n');
});

it("reads ladder_ready with exactly four levels before done", async () => {
  const events: DiagnoseEvent[] = [];
  await readSse(
    new Response('event: ladder_ready\ndata: {"levels":4}\n\nevent: done\ndata: {}\n\n').body!,
    (event) => events.push(event),
  );
  expect(events).toEqual([
    { event: "ladder_ready", data: { levels: 4 } },
    { event: "done", data: {} },
  ]);
  await expect(
    readSse(new Response('event: ladder_ready\ndata: {"levels":3}\n\n').body!, () => {}),
  ).rejects.toThrow();
});
it("reads fragmented UTF-8 events and detects premature EOF", async () => {
  const events: DiagnoseEvent[] = [
    { event: "error", data: { code: "llm_error", message: "حصلت مشكلة" } },
  ];
  const bytes = new TextEncoder().encode(events.map(serializeSse).join(""));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  const received: DiagnoseEvent[] = [];
  await readSse(stream, (event) => received.push(event));
  expect(received).toEqual(events);
  await expect(
    readSse(
      new Response(serializeSse({ event: "stage", data: { name: "thinking" } })).body!,
      () => {},
    ),
  ).rejects.toThrow();
});
