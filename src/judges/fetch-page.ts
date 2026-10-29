export class FetchFailed extends Error {
  constructor(public readonly status: number | null = null) {
    super("Problem page fetch failed");
    this.name = "FetchFailed";
  }
}

export async function fetchProblemHtml(
  url: string,
  deps: { fetch?: typeof fetch; userAgent: string; timeoutMs?: number },
): Promise<string> {
  try {
    const response = await (deps.fetch ?? fetch)(url, {
      headers: { "User-Agent": deps.userAgent },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
    });
    if (!response.ok) throw new FetchFailed(response.status);
    return await response.text();
  } catch (error) {
    if (error instanceof FetchFailed) throw error;
    throw new FetchFailed();
  }
}
