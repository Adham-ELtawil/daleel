import { connect, getDb } from "@/src/db/client";
import { createHandlers } from "@/src/services/handlers";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return createHandlers({ db: () => connect(getDb()) }).teamStats(request, (await params).id);
}
