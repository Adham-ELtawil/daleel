import { NextResponse } from "next/server";

// Health shape from docs/03-ARCHITECTURE.md §4. PR-01 has no db, Meta client or runner yet,
// so every probe reports its "not wired" state. Later PRs replace these with real checks.
export type HealthStatus = {
  db: "ok" | "down" | "unknown";
  meta: "ok" | "down" | "unknown";
  runner: "ok" | "off" | "down";
  replay: boolean;
};

export const dynamic = "force-dynamic";

export function GET() {
  const body: HealthStatus = { db: "unknown", meta: "unknown", runner: "off", replay: false };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
