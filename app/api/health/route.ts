import { NextResponse } from "next/server";
import { MetaEnvSchema } from "@/src/env";
import { runnerHealth } from "@/src/runner/factory";

// Runner health checks installed binaries; Meta is never called by this route.
export type HealthStatus = {
  db: "ok" | "down" | "unknown";
  meta: "ok" | "down" | "unknown";
  runner: "ok" | "off" | "down";
  replay: boolean;
};

export const dynamic = "force-dynamic";

export function GET() {
  const replay = MetaEnvSchema.pick({ DEMO_REPLAY: true }).parse(process.env).DEMO_REPLAY === "1";
  const body: HealthStatus = {
    db: "unknown",
    meta: "unknown",
    runner: runnerHealth(process.env),
    replay,
  };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
