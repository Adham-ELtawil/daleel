import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import * as env from "@/src/env";

const example = readFileSync(".env.example", "utf8");
const entries = new Map(
  example
    .split(/\r?\n/)
    .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
const code = ["src", "app", "scripts"].flatMap(sources).map((p) => readFileSync(p, "utf8")).join("\n");

it("documents every variable declared in src/env.ts", () => {
  const declared = new Set<string>();
  for (const schema of Object.values(env)) {
    const shape = (schema as { shape?: Record<string, unknown>; def?: { in?: { shape?: object } } })
      .shape ?? (schema as { def?: { schema?: { shape?: object } } }).def?.schema?.shape;
    for (const key of Object.keys(shape ?? {})) if (key !== "NODE_ENV") declared.add(key);
  }
  expect(declared.size).toBeGreaterThan(15);
  for (const key of declared) expect(entries.has(key), `${key} missing from .env.example`).toBe(true);
  for (const key of ["SESSION_SECRET", "DATABASE_URL", "DATABASE_AUTH_TOKEN", "RUNNER_PROVIDER"])
    expect(entries.has(key), `${key} missing`).toBe(true);
});

it("lists only variables the code actually reads", () => {
  for (const key of entries.keys()) expect(code, `${key} is not read anywhere`).toContain(key);
});

it("ships no secrets and safe zero-key defaults", () => {
  for (const key of ["MODEL_API_KEY", "SESSION_SECRET", "DATABASE_AUTH_TOKEN"])
    expect(entries.get(key)).toBe("");
  expect(entries.get("RUNNER_PROVIDER")).toBe("none");
  expect(entries.get("EFFORT_EXPLAIN")).toBe("medium");
});
