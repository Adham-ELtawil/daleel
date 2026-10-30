import { attemptHandlers } from "@/src/services/runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return attemptHandlers().solved(request, (await params).id);
}
