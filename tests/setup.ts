import { vi } from "vitest";
import { noNetworkFetch } from "@/tests/llm/fake-fetch";

// Default HTTP boundary: recorded contest data only; every other endpoint stays offline.
vi.stubGlobal("fetch", noNetworkFetch);
