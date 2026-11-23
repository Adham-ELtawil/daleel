// Times a live diagnose stream. Server `at` is milliseconds since the handler
// accepted the attempt; `client` is milliseconds since this process sent the POST.
// A large client-at gap means the bytes were buffered after the server wrote them.
//
// On the server, with the same env as `next start` (no need to print the key):
//   pnpm exec tsx scripts/sse-timing.ts --base http://127.0.0.1:3000 --problem-id <id> --code student.cpp
// Or create the attempt from a Codeforces URL already stored in this database:
//   pnpm exec tsx scripts/sse-timing.ts --base http://127.0.0.1:3000 --external 189A --code student.cpp
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function flag(name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const base = (flag("--base") ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const codePath = flag("--code");
const problemId = flag("--problem-id");
const external = flag("--external");
if (!codePath || (!problemId && !external)) {
  console.error(
    "Usage: pnpm exec tsx scripts/sse-timing.ts --base http://127.0.0.1:3000 (--problem-id ID | --external 189A) --code student.cpp",
  );
  process.exit(2);
}

async function json(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text) as { attemptId?: string; problem?: { id: string } };
}

let id = problemId;
if (!id && external) {
  const judge = external.startsWith("abc") ? "atcoder" : "codeforces";
  const url =
    judge === "codeforces"
      ? `https://codeforces.com/problemset/problem/${external.slice(0, -1)}/${external.slice(-1)}`
      : external;
  const created = await json("/api/problems/resolve", { url });
  id = created.problem?.id;
}
if (!id) throw new Error("problem id missing");
const attempt = await json("/api/attempts", {
  problemId: id,
  language: "cpp17",
  code: readFileSync(codePath, "utf8"),
});
if (!attempt.attemptId) throw new Error("attempt was not created");

const started = Date.now();
const response = await fetch(`${base}/api/attempts/${attempt.attemptId}/diagnose`, {
  method: "POST",
  headers: { accept: "text/event-stream", "content-type": "application/json" },
  body: "{}",
});
const headersAt = Date.now() - started;
console.log(
  `headers ${headersAt}ms status=${response.status} encoding=${response.headers.get("content-encoding") ?? "identity"} cache=${response.headers.get("cache-control") ?? ""} accel=${response.headers.get("x-accel-buffering") ?? ""}`,
);
if (!response.body) throw new Error("no body");
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let serverAt: number | null = null;
for (;;) {
  const { value, done } = await reader.read();
  buffer += decoder.decode(value, { stream: !done });
  let end: number;
  while ((end = buffer.indexOf("\n\n")) >= 0) {
    const frame = buffer.slice(0, end);
    buffer = buffer.slice(end + 2);
    const client = Date.now() - started;
    for (const line of frame.split("\n")) {
      if (line.startsWith(": at=")) serverAt = Number(line.slice(5));
    }
    const event = frame
      .split("\n")
      .find((line) => line.startsWith("event:"))
      ?.slice(7);
    if (!event) {
      console.log(`client ${client}ms comment ${frame.length}b`);
      continue;
    }
    const lag = serverAt === null ? "" : ` lag=${client - serverAt}ms`;
    console.log(`client ${client}ms server ${serverAt ?? "?"}ms${lag} ${event}`);
    serverAt = null;
  }
  if (done) break;
}
