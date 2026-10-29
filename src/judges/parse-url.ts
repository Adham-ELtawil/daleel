type ProblemUrl = {
  judge: "codeforces" | "atcoder";
  contestId: string;
  // Codeforces problem index, or the full AtCoder task slug.
  index: string;
  externalId: string;
};

/** A null result lets the resolver return unsupported_url without throwing. */
export function parseProblemUrl(url: string): ProblemUrl | null {
  const input = url.trim();
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  if (!/^https?:\/\/[^/]/i.test(candidate)) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password || parsed.port) return null;

  if (/^(?:(?:www|m1|m2|mirror)\.)?codeforces\.com$/.test(parsed.hostname)) {
    const match =
      /^\/problemset\/problem\/(\d+)\/([A-Za-z][A-Za-z\d]*)\/?$/.exec(parsed.pathname) ??
      /^\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z][A-Za-z\d]*)\/?$/.exec(parsed.pathname);
    if (!match) return null;
    const contestId = match[1];
    const index = match[2].toUpperCase();
    return { judge: "codeforces", contestId, index, externalId: `${contestId}${index}` };
  }

  if (parsed.hostname === "atcoder.jp") {
    const match = /^\/contests\/([a-z\d_-]+)\/tasks\/([a-z\d_-]+)\/?$/.exec(parsed.pathname);
    if (!match) return null;
    return { judge: "atcoder", contestId: match[1], index: match[2], externalId: match[2] };
  }
  return null;
}
