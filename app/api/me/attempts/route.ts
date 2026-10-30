import { attemptHandlers } from "@/src/services/runtime";

export const GET = (request: Request) => attemptHandlers().history(request);
