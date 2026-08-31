import { describe, expect, it } from "vitest";
import { auditDegree } from "./audit";
import { requirements } from "./catalog";
import { mappedGrants } from "./equivalency";
import { classifyGrade, parseTranscript } from "./transcript";
import { SAMPLE_TRANSCRIPT_WITH_FAILURES } from "./__fixtures__/sample-transcript";
import { earnsCredit, needsRetake } from "./types";

describe("classifyGrade", () => {
  it("fails a score below 60 and passes 60", () => {
    // Catalog p. 38: a score below 60 is failing and a required course must be retaken.
    expect(classifyGrade("59", 0, 3)).toBe("failed");
    expect(classifyGrade("60", 3, 3)).toBe("completed");
  });

  it("treats a D as passing, poor though it is", () => {
    // 60-72 is "Poor, fails to meet basic standards" but still earns credit.
    expect(classifyGrade("65", 3, 3)).toBe("completed");
  });

  it("reads the special notations", () => {
    expect(classifyGrade("IP", 0, 3)).toBe("in-progress");
    expect(classifyGrade("W", 0, 3)).toBe("withdrawn");
    expect(classifyGrade("I", 0, 3)).toBe("incomplete");
    expect(classifyGrade("AU", 0, 3)).toBe("audit");
    expect(classifyGrade("U", 0, 3)).toBe("failed");
    expect(classifyGrade("F", 0, 3)).toBe("failed");
    expect(classifyGrade("P", 3, 3)).toBe("completed");
    expect(classifyGrade("S", 3, 3)).toBe("completed");
  });

  it("falls back to whether credit was granted", () => {
    expect(classifyGrade("", 3, 3)).toBe("completed");
    expect(classifyGrade(undefined, 0, 3)).toBe("in-progress");
  });
});

describe("a transcript with failures", () => {
  const parsed = parseTranscript(SAMPLE_TRANSCRIPT_WITH_FAILURES);
  const row = (code: string) => parsed.rows.find((r) => r.code === code)!;

  it("does not mistake a failed course for one in progress", () => {
    // Both show 0.00 earned credits, so the grade is what separates them.
    expect(row("MATH 210").status).toBe("failed");
    expect(row("HIST 110").status).toBe("withdrawn");
    expect(row("PHIL 120").status).toBe("incomplete");
    expect(row("CSAI 110").status).toBe("audit");
    expect(row("LITR 210").status).toBe("completed");
  });

  it("counts only the passed course", () => {
    const earned = parsed.rows.filter((r) => earnsCredit(r.status)).reduce((n, r) => n + (r.credits ?? 0), 0);
    expect(earned).toBe(3);
    expect(parsed.reportedEarnedCredits).toBe(3);
  });

  it("says plainly that a course must be retaken", () => {
    expect(parsed.warnings.join(" ")).toMatch(/MATH 210/);
    expect(parsed.warnings.join(" ")).toMatch(/retaken/i);
  });

  it("reads the cumulative CSA", () => {
    expect(parsed.cumulativeCsa).toBe(71);
    expect(parsed.cumulativeCsa!).toBeLessThan(requirements.grading.minimumCsa);
  });
});

describe("failed work in the audit", () => {
  const audit = auditDegree(parseTranscript(SAMPLE_TRANSCRIPT_WITH_FAILURES).rows);

  it("earns no credit for it", () => {
    expect(audit.totals.earned).toBe(3);
    expect(audit.totals.inProgress).toBe(3); // the incomplete only
  });

  it("does not let it satisfy a requirement", () => {
    const humanities = audit.intellectualFoundations.groups.find((g) => g.id === "if-humanities")!;
    // Ancient Greece was withdrawn, so its slot stays open.
    expect(humanities.slots!.find((s) => s.label === "Ancient Greece")!.filled).toBe(false);
    // Plato and Aristotle is incomplete: pending, not done.
    const plato = humanities.slots!.find((s) => s.label === "Plato and Aristotle")!;
    expect(plato.filled).toBe(true);
    expect(plato.pendingOnly).toBe(true);
  });

  it("keeps a failed course out of the concentrations", () => {
    const math = audit.concentrations.find((c) => c.id === "mathematics")!;
    const core = math.groups.find((g) => g.id === "math-core")!;
    expect(core.completed).toBe(0);
  });

  it("lists what needs retaking and what cannot count", () => {
    expect(audit.retakeNeeded.map((h) => h.code)).toEqual(["MATH 210"]);
    expect(audit.excluded.map((h) => h.code).sort()).toEqual(["CSAI 110", "HIST 110", "MATH 210"]);
  });

  it("does not claim a withdrawn course was counted as anything", () => {
    const withdrawn = auditDegree([{ code: "ALT 1010", status: "withdrawn" }]);
    expect(mappedGrants(withdrawn.normalization)).toHaveLength(0);
    const passed = auditDegree([{ code: "ALT 1010", status: "completed" }]);
    expect(mappedGrants(passed.normalization).map((m) => m.from)).toEqual(["ALT 1010"]);
  });

  it("records which course filled each requirement", () => {
    const audit2 = auditDegree([{ code: "ALT 1010", status: "completed" }]);
    const rome = audit2.intellectualFoundations.groups
      .find((g) => g.id === "if-humanities")!
      .slots!.find((s) => s.label === "Ancient Rome")!;
    expect(rome.filledBy).toEqual([
      { requirement: "HIST 115", source: "ALT 1010", via: "equivalency", status: "completed" },
    ]);
  });
});
