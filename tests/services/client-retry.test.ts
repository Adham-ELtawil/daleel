import { expect, it, vi } from "vitest";
import { isDroppedConnection, withConnectionRetry } from "@/src/services/client-retry";

it("retries a dropped fetch and returns the later success", async () => {
  const sleep = vi.fn(async () => {});
  let calls = 0;
  const result = await withConnectionRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return { explanation: true };
    },
    { sleep, attempts: 3 },
  );
  expect(result).toEqual({ explanation: true });
  expect(calls).toBe(2);
  expect(sleep).toHaveBeenCalledOnce();
});

it("does not retry an HTTP error from the server", async () => {
  let calls = 0;
  const error = Object.assign(new Error("budget"), { name: "HttpError" });
  await expect(
    withConnectionRetry(
      async () => {
        calls += 1;
        throw error;
      },
      { sleep: async () => {}, attempts: 3 },
    ),
  ).rejects.toBe(error);
  expect(calls).toBe(1);
  expect(isDroppedConnection(new TypeError("Failed to fetch"))).toBe(true);
  expect(isDroppedConnection(error)).toBe(false);
});

it("stops after the bounded number of dropped attempts", async () => {
  let calls = 0;
  await expect(
    withConnectionRetry(
      async () => {
        calls += 1;
        throw new TypeError("Failed to fetch");
      },
      { sleep: async () => {}, attempts: 3 },
    ),
  ).rejects.toThrow("Failed to fetch");
  expect(calls).toBe(3);
});
