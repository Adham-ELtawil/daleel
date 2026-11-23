import { connect, getDb } from "@/src/db/client";
import { createHandlers } from "@/src/services/handlers";

export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  createHandlers({ db: () => connect(getDb()) }).adminStats(request);
