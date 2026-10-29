import { describe, expect, it } from "vitest";
import { parseProblemUrl } from "@/src/judges/parse-url";

describe("parseProblemUrl", () => {
  it.each([
    ["https://codeforces.com/problemset/problem/4/A", "4", "A", "4A"],
    ["http://codeforces.com/problemset/problem/4/A", "4", "A", "4A"],
    ["https://codeforces.com/contest/1/problem/A", "1", "A", "1A"],
    ["http://codeforces.com/contest/1352/problem/c", "1352", "C", "1352C"],
    ["https://codeforces.com/gym/100001/problem/A", "100001", "A", "100001A"],
    ["http://codeforces.com/gym/100001/problem/b", "100001", "B", "100001B"],
    ["https://www.codeforces.com/problemset/problem/4/A", "4", "A", "4A"],
    ["http://www.codeforces.com/contest/4/problem/A", "4", "A", "4A"],
    ["https://m1.codeforces.com/contest/4/problem/A", "4", "A", "4A"],
    ["http://m2.codeforces.com/problemset/problem/4/a", "4", "A", "4A"],
    ["https://mirror.codeforces.com/gym/100001/problem/A", "100001", "A", "100001A"],
    ["https://codeforces.com/problemset/problem/4/A/", "4", "A", "4A"],
    ["https://codeforces.com/contest/4/problem/a/?locale=en#statement", "4", "A", "4A"],
    ["https://codeforces.com/problemset/problem/4/A#sample", "4", "A", "4A"],
    ["https://codeforces.com/problemset/problem/1791/g2", "1791", "G2", "1791G2"],
    ["codeforces.com/problemset/problem/4/A", "4", "A", "4A"],
    ["  https://CODEFORCES.COM/contest/4/problem/A  ", "4", "A", "4A"],
  ])("parses Codeforces URL %s", (url, contestId, index, externalId) => {
    expect(parseProblemUrl(url)).toEqual({ judge: "codeforces", contestId, index, externalId });
  });

  it.each([
    ["https://atcoder.jp/contests/abc300/tasks/abc300_a", "abc300", "abc300_a"],
    ["http://atcoder.jp/contests/abc300/tasks/abc300_b", "abc300", "abc300_b"],
    ["https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=en", "abc300", "abc300_a"],
    [
      "https://atcoder.jp/contests/abc300/tasks/abc300_a/?lang=en#task-statement",
      "abc300",
      "abc300_a",
    ],
    ["atcoder.jp/contests/abc300/tasks/abc300_a", "abc300", "abc300_a"],
    [
      "https://atcoder.jp/contests/tessoku-book/tasks/tessoku_book_a",
      "tessoku-book",
      "tessoku_book_a",
    ],
    ["https://atcoder.jp/contests/abc042/tasks/arc058_a", "abc042", "arc058_a"],
    ["https://atcoder.jp/contests/abc001/tasks/abc001_1", "abc001", "abc001_1"],
  ])("preserves the full AtCoder task slug for %s", (url, contestId, taskId) => {
    expect(parseProblemUrl(url)).toEqual({
      judge: "atcoder",
      contestId,
      index: taskId,
      externalId: taskId,
    });
  });

  it.each([
    "",
    "not a url",
    "https://",
    "https:/codeforces.com/problemset/problem/4/A",
    "https://example.com/problemset/problem/4/A",
    "https://codeforces.com.example.com/problemset/problem/4/A",
    "https://example.com/codeforces.com/problemset/problem/4/A",
    "https://unknown.codeforces.com/problemset/problem/4/A",
    "https://atcoder.jp.example.com/contests/abc300/tasks/abc300_a",
    "https://codeforces.com/",
    "https://codeforces.com/problemset/problem/4",
    "https://codeforces.com/problemset/problem/4/",
    "https://codeforces.com/problemset/problem/nope/A",
    "https://codeforces.com/problemset/problem/4/1",
    "https://codeforces.com/problemset/problem/4/A-1",
    "https://codeforces.com/problemset/problem/4/A/extra",
    "https://codeforces.com/problemset/problem/4/problem/A",
    "https://codeforces.com/contest/4/A",
    "https://codeforces.com/contest/4/problem/",
    "https://codeforces.com/gym/100001/problem/",
    "https://atcoder.jp/contests/abc300/tasks/",
    "https://atcoder.jp/contests/abc300/",
    "https://atcoder.jp/contests/abc300/tasks/abc300_a/editorial",
    "https://atcoder.jp/contests/abc300/tasks/abc300%20a",
    "https://atcoder.jp/contests//tasks/abc300_a",
    "javascript:alert(1)",
    "javascript://codeforces.com/problemset/problem/4/A",
    "ftp://codeforces.com/problemset/problem/4/A",
    "https://guest@codeforces.com/problemset/problem/4/A",
    "https://codeforces.com:8443/problemset/problem/4/A",
  ])("returns null for unsupported URL %s", (url) => {
    expect(parseProblemUrl(url)).toBeNull();
  });
});
