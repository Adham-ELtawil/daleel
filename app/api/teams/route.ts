import { connect, getDb } from "@/src/db/client";
import { createHandlers } from "@/src/services/handlers";

export const POST = (request: Request) =>
  createHandlers({ db: () => connect(getDb()) }).createTeam(request);
