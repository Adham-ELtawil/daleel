import { attemptHandlers } from "@/src/services/runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return attemptHandlers().stuck(request, (await params).id);
}
