import { execFile } from "node:child_process";

export class FetchFailed extends Error {
  constructor(public readonly status: number | null = null) {
    super("Problem page fetch failed");
    this.name = "FetchFailed";
  }
}

/** Fetches `url` with the system curl and returns the final HTTP status and body. */
export type CurlRunner = (
  url: string,
  userAgent: string,
) => Promise<{ status: number; body: string }>;

const CURL_HOSTS = new Set(["codeforces.com", "www.codeforces.com", "atcoder.jp"]);
const MAX_BYTES = 5 * 1024 * 1024;
const STATUS_MARKER = "\n__DALEEL_HTTP_STATUS__:";

/**
 * Cloudflare on codeforces.com rejects Node's fetch (undici) by TLS fingerprint
 * with 403 regardless of headers, while curl gets the real page. Runs curl
 * directly (no shell); on Windows 10+ this resolves to the bundled curl.exe.
 */
export const runCurl: CurlRunner = (url, userAgent) =>
  new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS",
        "-L",
        "--proto",
        "=https",
        "--proto-redir",
        "=https",
        "--max-redirs",
        "5",
        "--compressed",
        "--max-time",
        "15",
        "--max-filesize",
        String(MAX_BYTES),
        "-A",
        userAgent,
        "-w",
        `${STATUS_MARKER}%{http_code}`,
        "--",
        url,
      ],
      { maxBuffer: MAX_BYTES + 1024, timeout: 20_000, windowsHide: true },
      (error, stdout) => {
        if (error) return reject(error);
        const at = stdout.lastIndexOf(STATUS_MARKER);
        if (at < 0) return reject(new Error("curl output missing status"));
        resolve({
          status: Number(stdout.slice(at + STATUS_MARKER.length).trim()),
          body: stdout.slice(0, at),
        });
      },
    );
  });

function curlAllowed(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && CURL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Real Codeforces pages also embed /cdn-cgi/challenge-platform/ beacons, so match the interstitial title only. */
function isChallengePage(html: string) {
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html);
}

async function viaCurl(url: string, userAgent: string, curl: CurlRunner) {
  try {
    const result = await curl(url, userAgent);
    if (result.status === 200 && !isChallengePage(result.body)) return result.body;
  } catch {
    /* curl missing (ENOENT), timed out, or failed: report the original failure. */
  }
  return null;
}

export async function fetchProblemHtml(
  url: string,
  deps: { fetch?: typeof fetch; userAgent: string; timeoutMs?: number; curl?: CurlRunner },
): Promise<string> {
  let failure: FetchFailed;
  let cloudflareBlocked = false;
  try {
    const response = await (deps.fetch ?? fetch)(url, {
      headers: { "User-Agent": deps.userAgent },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 8000),
    });
    if (!response.ok) throw new FetchFailed(response.status);
    const html = await response.text();
    if (!isChallengePage(html)) return html;
    failure = new FetchFailed(response.status);
    cloudflareBlocked = true;
  } catch (error) {
    failure = error instanceof FetchFailed ? error : new FetchFailed();
    cloudflareBlocked = failure.status === 403 || failure.status === 503;
  }
  if (cloudflareBlocked && curlAllowed(url)) {
    const html = await viaCurl(url, deps.userAgent, deps.curl ?? runCurl);
    if (html !== null) return html;
  }
  throw failure;
}
