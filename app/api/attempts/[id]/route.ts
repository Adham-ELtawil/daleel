import { attemptHandlers } from "@/src/services/runtime";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return attemptHandlers().getAttempt(request, (await params).id);
}
