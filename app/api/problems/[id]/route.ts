import { connect, getDb } from "@/src/db/client";
import { createHandlers } from "@/src/services/handlers";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return createHandlers({ db: () => connect(getDb()) }).problem(request, (await context.params).id);
}
