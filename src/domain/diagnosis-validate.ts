import type { Diagnosis } from "@/src/llm/schemas/diagnosis";
import { codeLines } from "./code-lines";

const knownTags = new Set([
  "math",
  "implementation",
  "greedy",
  "brute force",
  "number theory",
  "binary search",
  "dp",
  "graphs",
  "strings",
  "sortings",
  "constructive algorithms",
  "two pointers",
  "data structures",
  "dfs and similar",
  "dsu",
  "trees",
  "bitmasks",
  "combinatorics",
  "geometry",
  "shortest paths",
  "probabilities",
  "divide and conquer",
]);

/** Unknown tags retain their text under an idempotent custom: prefix (§1.2). */
export function validateDiagnosis(diagnosis: Diagnosis, code: string): Diagnosis {
  const count = codeLines(code).length;
  return {
    ...diagnosis,
    lines: diagnosis.lines.filter(({ start, end }) => end >= start && end <= count),
    topics: diagnosis.topics.map((topic) => {
      const tag = topic.trim().toLowerCase();
      return knownTags.has(tag) || tag.startsWith("custom:") ? tag : `custom:${tag}`;
    }),
  };
}
