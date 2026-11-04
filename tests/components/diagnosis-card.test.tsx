import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiagnosisCard } from "@/src/components/diagnosis-card";
import { StressResult } from "@/src/components/stress-result";
import type { StressPublic } from "@/src/domain/stress-public";
import { DiagnosisSchema, toPublic } from "@/src/llm/schemas/diagnosis";
import type { attemptDetail } from "@/src/services/attempt-service";
import fixture from "@/tests/fixtures/llm/diagnosis-a.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => vi.unstubAllGlobals());

const verified: StressPublic = {
  status: "verified",
  failing_input: "2\n",
  expected_output: "NO\n",
  actual_output: "YES\n",
  compile_output: null,
  source: "test",
  contradiction: false,
};
function render(
  stress?: StressPublic,
  locale: "en" | "ar-EG" = "en",
  status: "new" | "diagnosing" | "diagnosed" | "error" = "diagnosed",
  confidence = fixture.confidence,
) {
  const detail: Awaited<ReturnType<typeof attemptDetail>> = {
    attempt: {
      mode: "code",
      id: "pr16b2-attempt",
      problemId: "cf-4A",
      parentAttemptId: null,
      language: "cpp17",
      code: "int main() {}",
      verdictReported: "WA",
      verdictTestNo: null,
      studentNote: null,
      locale,
      status,
      maxHintLevel: 0,
      solvedAt: null,
      createdAt: 0,
    },
    problem: undefined,
    diagnosis:
      status === "diagnosed"
        ? {
            ...toPublic(DiagnosisSchema.parse(fixture)),
            confidence,
            replay: false,
            recordedAt: null,
          }
        : undefined,
    stress,
    revealedHints: [],
    canExplain: false,
    replay: false,
    recordedAt: null,
  };
  return renderToStaticMarkup(React.createElement(DiagnosisCard, { detail, locale }));
}
it.each([
  [0, "neutral"],
  [0.499, "neutral"],
  [0.5, "warning"],
  [0.799, "warning"],
  [0.8, "neutral"],
  [1, "neutral"],
] as const)("colors confidence %s with the %s badge", (confidence, tone) => {
  for (const locale of ["en", "ar-EG"] as const) {
    const html = render(undefined, locale, "diagnosed", confidence);
    const label = locale === "en" ? "Confidence" : "درجة الثقة";
    expect(html).toMatch(new RegExp(`<span[^>]*class="[^"]*badge-${tone}[^"]*">${label}:`));
    expect(html).toContain(new Intl.NumberFormat(locale, { style: "percent" }).format(confidence));
  }
});
it("renders code before the rail and marks persisted diagnosis and stress complete", () => {
  const html = render(verified);
  const steps = html.match(/<ol[^>]*aria-label="Attempt progress"[\s\S]*?<\/ol>/)?.[0] ?? "";
  expect(steps.match(/data-state="complete"/g)).toHaveLength(2);
  expect(steps).toMatch(/aria-current="step"[^>]*>[\s\S]*?Hints/);
  expect(html.indexOf(steps)).toBeGreaterThan(html.indexOf('id="attempt-code-label"'));
});
it.each(["en", "ar-EG"] as const)("uses a friendly bug label and retry action in %s", (locale) => {
  expect(render(undefined, locale)).toContain(
    locale === "en" ? "Missed edge case" : "حالة خاصة فاتتك",
  );
  expect(render(undefined, locale)).not.toContain("edge_case");
  for (const status of ["diagnosed", "error"] as const)
    expect(render(undefined, locale, status)).toContain(
      locale === "en" ? "Diagnose again" : "شخّص تاني",
    );
  expect(render(undefined, locale, "new")).not.toContain(
    locale === "en" ? "Diagnose again" : "شخّص تاني",
  );
});
it("shows an accessible skeleton on a diagnosing reload and a card on an error reload", () => {
  expect(render(undefined, "en", "diagnosing")).toMatch(/role="status"[^>]*aria-busy="true"/);
  expect(render(undefined, "en", "error")).toMatch(/role="alert"[^>]*class="[^"]*state-panel/);
});
it.each(["en", "ar-EG"] as const)(
  "renders the persisted verified counterexample in %s with three LTR blocks",
  (locale) => {
    const html = render(verified, locale);
    expect(html).toContain(
      locale === "en" ? "Verified counterexample" : "مثال counterexample متأكدين منه",
    );
    for (const text of locale === "en"
      ? ["Input", "Expected", "Your output"]
      : ["الـ input", "الـ output المتوقع", "الـ output بتاعك"])
      expect(html).toContain(text);
    expect(
      [...html.matchAll(/<pre\b[^>]*dir="ltr"[^>]*>([\s\S]*?)<\/pre>/g)].map((match) => match[1]),
    ).toEqual(["2\n", "NO\n", "YES\n"]);
    expect(html).toContain(
      locale === "en" ? "Verified by running your code" : "اتأكدنا بتشغيل الكود بتاعك",
    );
    expect(html).toContain(locale === "en" ? "Wrong answer" : "إجابة غلط");
    if (locale === "ar-EG") expect(html).not.toContain("Wrong answer");
    expect(html).not.toContain(locale === "en" ? "Not verified" : "لسه مش متأكدين بالتشغيل");
    expect(html).not.toContain("badge-success");
  },
);
it.each([
  ["no_mismatch", "No mismatch found in the tests."],
  ["skipped", "Your code was not run. Treat this diagnosis as a suggestion and test it yourself."],
  ["brute_untrusted", "The reference code failed the sample checks."],
  ["error", "Execution verification could not finish."],
  ["compile_error", "Your code did not compile."],
  [undefined, "No execution result is available."],
] as const)("shows a small not-verified badge and a reason for %s", (status, reason) => {
  const html = render(status ? { ...verified, status } : undefined);
  expect(html).toMatch(/<span\b[^>]*class="[^"]*text-xs[^>]*>Not verified<\/span>/);
  expect(html).toContain(reason);
  expect(html).not.toContain("Verified counterexample");
});
it("caps compiler output at 30 lines, keeps it LTR and escapes HTML", () => {
  const lines = Array.from({ length: 32 }, (_, index) => `compiler line ${index + 1}`);
  lines[0] = "<script>compiler</script>";
  const html = render({ ...verified, status: "compile_error", compile_output: lines.join("\r\n") });
  expect(html).toMatch(/<pre\b[^>]*dir="ltr"/);
  expect(html).toContain("&lt;script&gt;compiler&lt;/script&gt;");
  expect(html).toContain("compiler line 30");
  expect(html).not.toContain("compiler line 31");
  expect(html).not.toContain("compiler line 32");
});
it.each(["en", "ar-EG"] as const)(
  "localizes the contradiction note in %s only when flagged",
  (locale) => {
    const note =
      locale === "en"
        ? "The diagnosis may be off; check the counterexample."
        : "ممكن التشخيص يكون مش دقيق؛ راجع الـ counterexample.";
    expect(render({ ...verified, contradiction: true }, locale)).toContain(note);
    expect(render(verified, locale)).not.toContain(note);
  },
);
it("never renders private reference code or hidden diagnosis fields", () => {
  const privateResult = { ...verified, brute_code: "PRIVATE_REFERENCE_PROGRAM" };
  const html = render(privateResult);
  expect(html).not.toContain("PRIVATE_REFERENCE_PROGRAM");
  expect(html).not.toContain(fixture.fix_internal);
  expect(html).not.toContain(fixture.root_cause_internal);
});
it.each(["en", "ar-EG"] as const)(
  "shows the waiting stress stage in %s until a result arrives",
  (locale) => {
    const pending = renderToStaticMarkup(
      React.createElement(StressResult, { pending: true, locale }),
    );
    expect(pending).toContain(
      locale === "en" ? "Trying to break your code" : "بنجرّب نلاقي input يوقع الكود بتاعك",
    );
    expect(pending).not.toContain(locale === "en" ? "Not verified" : "لسه مش متأكدين بالتشغيل");
    const complete = renderToStaticMarkup(
      React.createElement(StressResult, { result: verified, pending: true, locale }),
    );
    expect(complete).not.toContain(
      locale === "en" ? "Trying to break your code" : "بنجرّب نلاقي input يوقع الكود بتاعك",
    );
  },
);
