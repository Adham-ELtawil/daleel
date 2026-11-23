export const CONNECTION_ATTEMPTS = 3;

export function isDroppedConnection(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return error instanceof Error && error.message === "Incomplete diagnosis stream";
}

export async function withConnectionRetry<T>(
  job: () => Promise<T>,
  opts?: { attempts?: number; sleep?: (ms: number) => Promise<void> },
): Promise<T> {
  const attempts = opts?.attempts ?? CONNECTION_ATTEMPTS;
  const sleep =
    opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await job();
    } catch (error) {
      last = error;
      if (!isDroppedConnection(error) || attempt === attempts - 1) throw error;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw last;
}
