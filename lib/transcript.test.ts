import { describe, expect, it } from "vitest";
import { parseTranscript, parseCodeList } from "./transcript";
import { SAMPLE_TRANSCRIPT } from "./__fixtures__/sample-transcript";

describe("parseTranscript", () => {
  const parsed = parseTranscript(SAMPLE_TRANSCRIPT);
  const byCode = (code: string) => parsed.rows.find((r) => r.code === code);

  it("finds every course row", () => {
    expect(parsed.rows.map((r) => r.code).sort()).toEqual(
      ["ALT 1010", "ALT 4500", "INF 1210", "INF 1320", "MATH 210", "POL 1110", "STM 2102", "STM 3910C"].sort(),
    );
  });

  it("stitches a course code whose number wrapped to the next line", () => {
    expect(byCode("STM 3910C")?.title).toBe("Special Topics: Accelerated Introduction to Programming");
    expect(byCode("STM 2102")?.title).toBe("Statistics");
  });

  it("keeps the descriptive title used to tell reused codes apart", () => {
    expect(byCode("ALT 4500")?.title).toContain("Political Theology");
  });

  it("treats IP rows as in progress and does not credit them", () => {
    expect(byCode("INF 1320")?.status).toBe("in-progress");
    expect(byCode("ALT 1010")?.status).toBe("completed");
    const earned = parsed.rows
      .filter((r) => r.status === "completed")
      .reduce((n, r) => n + (r.credits ?? 0), 0);
    expect(earned).toBe(18);
  });

  it("reconciles against the total the document reports", () => {
    expect(parsed.reportedEarnedCredits).toBe(18);
    expect(parsed.warnings.filter((w) => w.includes("but the transcript reports"))).toHaveLength(0);
  });

  it("records the terms in order", () => {
    expect(parsed.terms).toEqual(["Fall 2025", "Winter 2026", "Fall 2026"]);
  });

  it("recognizes every code against the catalog", () => {
    expect(parsed.rows.filter((r) => !r.recognized)).toHaveLength(0);
  });
});

describe("parseCodeList", () => {
  it("reads separators loosely and drops unknown codes", () => {
    const out = parseCodeList("INF 1100, ALT 1010; stm2102\nMATH 210  ZZZ 999");
    expect(out.map((c) => c.code)).toEqual(["INF 1100", "ALT 1010", "STM 2102", "MATH 210"]);
  });

  it("does not repeat a course", () => {
    expect(parseCodeList("MATH 210 MATH 210")).toHaveLength(1);
  });
});
