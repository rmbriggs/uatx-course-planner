import { describe, expect, it } from "vitest";
import { auditDegree, pacing, suggestNextCourses } from "./audit";
import { normalizeRecord } from "./equivalency";
import { decodeState, emptyState, encodeState } from "./storage";
import { parseTranscript } from "./transcript";
import { SAMPLE_TRANSCRIPT } from "./__fixtures__/sample-transcript";
import type { TakenCourse } from "./types";

const done = (code: string, title?: string, credits?: number): TakenCourse => ({
  code,
  title,
  credits,
  status: "completed",
});

const satisfiesOf = (taken: TakenCourse[], code: string) =>
  normalizeRecord(taken).holdings.find((h) => h.code === code)?.satisfies ?? [];

describe("equivalency mapping", () => {
  it("credits a current-catalog course as itself", () => {
    expect(satisfiesOf([done("MATH 210")], "MATH 210")).toEqual(["MATH 210"]);
  });

  it("applies a stated one-to-one equivalence", () => {
    expect(satisfiesOf([done("ALT 1010")], "ALT 1010")).toEqual(["HIST 115"]);
  });

  it("awards both courses when one legacy course maps to two", () => {
    expect(satisfiesOf([done("STM 2102")], "STM 2102").sort()).toEqual(["MATH 230", "MATH 231"]);
  });

  it("requires both halves before granting a combined equivalence", () => {
    expect(satisfiesOf([done("ALT 1100")], "ALT 1100")).toEqual(["ALT 1100"]);
    const both = normalizeRecord([done("ALT 1100"), done("ALT 1120")]);
    expect(both.holdings.every((h) => h.satisfies.includes("PHIL 130"))).toBe(true);
  });

  it("uses the transcript title to tell reused codes apart", () => {
    // ALT 4500 covers three different courses in the equivalency tables.
    expect(satisfiesOf([done("ALT 4500", "Political Theology")], "ALT 4500")).toContain("AMCV 380");
    expect(satisfiesOf([done("ALT 4500", "Socrates")], "ALT 4500")).toEqual(["PHIL 380"]);
  });

  it("adds the named course where the table only gave a Special Topic slot", () => {
    // The table sends ALT 4500 Political Theology to AMCV 380 Special Topic in
    // American Civilization, which no concentration names. The new catalog
    // lists AMCV 360 Political Theology by name, in the very list this course
    // should count toward.
    const on = normalizeRecord([done("ALT 4500", "Political Theology")], { useInferred: true });
    expect(on.holdings[0].satisfies.sort()).toEqual(["AMCV 360", "AMCV 380"]);
    expect(on.holdings[0].via).toBe("inferred");
  });

  it("keeps the official mapping when proposals are switched off", () => {
    const off = normalizeRecord([done("ALT 4500", "Political Theology")], { useInferred: false });
    expect(off.holdings[0].satisfies).toEqual(["AMCV 380"]);
    expect(off.holdings[0].via).toBe("equivalency");
  });

  it("closes the American Civilization requirement the named course sits in", () => {
    const a = auditDegree([done("ALT 4500", "Political Theology")]);
    const upper = a.concentrations
      .find((c) => c.id === "american-civilization")!
      .groups.find((g) => g.id === "amcv-upper")!;
    expect(upper.held).toContain("AMCV 360");
    expect(upper.completed).toBe(1);
  });

  it("leaves a special topic alone when no named course matches it", () => {
    // Data-based Weather Forecasting has no counterpart in the new catalog, so
    // the Special Topic placeholder is the right answer and must stay.
    const h = normalizeRecord([done("STM 3900", "Data-Based Weather Forecasting Using Machine Learning")])
      .holdings[0];
    expect(h.satisfies).toEqual(["CSAI 379"]);
    expect(h.via).toBe("equivalency");
  });

  it("keeps proposed mappings out when they are switched off", () => {
    const on = normalizeRecord([done("INF 2121")], { useInferred: true });
    const off = normalizeRecord([done("INF 2121")], { useInferred: false });
    expect(on.holdings[0].satisfies).toEqual(["HIST 131"]);
    expect(on.holdings[0].via).toBe("inferred");
    expect(off.holdings[0].satisfies).toEqual(["INF 2121"]);
  });

  it("does not read a prerequisite line as an equivalence", () => {
    // "Prerequisite: AMCV 200 or INF 2121" names acceptable background, not an
    // equivalent: INF 2121 is Machiavelli and the Reformation, not the Founding.
    const r = normalizeRecord([done("INF 2121")]);
    expect(r.holdings[0].satisfies).not.toContain("AMCV 200");
  });

  it("lets one old seminar fill two Foundations slots without double-counting", () => {
    const a = auditDegree([done("INF 1100")]);
    const humanities = a.intellectualFoundations.groups.find((g) => g.id === "if-humanities")!;
    expect(humanities.slots!.find((s) => s.label === "Epic and Tragedy")!.filled).toBe(true);
    expect(humanities.slots!.find((s) => s.label === "The Bible")!.filled).toBe(true);
    // 4.5 credits earned once, not 9.
    expect(a.intellectualFoundations.creditsEarned).toBe(4.5);
    expect(a.totals.earned).toBe(4.5);
  });

  it("fills a slot once when two old courses both map to it", () => {
    // INF 1200 and INF 1110 both map to PHIL 120. One fills the requirement;
    // the other is not wasted, it counts toward the major.
    const a = auditDegree([done("INF 1200"), done("INF 1110")]);
    const plato = a.intellectualFoundations.groups
      .find((g) => g.id === "if-humanities")!
      .slots!.find((s) => s.label === "Plato and Aristotle")!;
    expect(plato.filled).toBe(true);
    expect(plato.filledBy).toHaveLength(1);
    expect(a.intellectualFoundations.creditsEarned).toBe(4.5);
    expect(a.major.creditsEarned).toBe(4.5);
    expect(a.totals.earned).toBe(9);
  });

  it("reads one big old seminar as covering two of the new courses", () => {
    // INF 1102 "counts as an equivalent towards completion of INF 1100", so the
    // newer courses were carved out of it.
    const r = normalizeRecord([done("INF 1100")]);
    expect(r.holdings[0].satisfies.sort()).toEqual(["LITR 102", "LITR 103"]);
  });

  it("still counts a legacy course with no equivalent at all", () => {
    // INF 2210 Mortality and Meaning in Art and Music has no counterpart in the
    // new curriculum, so it earns elective credit and fills nothing.
    const r = normalizeRecord([done("INF 2210")]);
    expect(r.unmapped.map((u) => u.code)).toEqual(["INF 2210"]);
    expect(auditDegree([done("INF 2210")]).noEquivalent.map((h) => h.code)).toEqual(["INF 2210"]);
  });
});

describe("credit accounting", () => {
  it("counts the credits actually earned, not the credits of the mapped course", () => {
    // STM 2102 is 4.5 credits and maps to MATH 230 + MATH 231, which are 1.5 each.
    const a = auditDegree([done("STM 2102")]);
    expect(a.totals.earned).toBe(4.5);
  });

  it("never counts a course toward more than one pillar", () => {
    const parsed = parseTranscript(SAMPLE_TRANSCRIPT);
    const a = auditDegree(parsed.rows);
    const fromRecord = parsed.rows
      .filter((r) => r.status === "completed")
      .reduce((n, r) => n + (r.credits ?? 0), 0);
    expect(a.totals.earned).toBe(fromRecord);
    expect(a.pillars.reduce((n, p) => n + p.creditsEarned, 0)).toBe(fromRecord);
  });

  it("leaves in-progress work out of earned credit", () => {
    const a = auditDegree([done("MATH 210"), { code: "MATH 220", status: "in-progress" }]);
    expect(a.totals.earned).toBe(3);
    expect(a.totals.inProgress).toBe(3);
  });

  it("counts level floors by the level of the mapped course", () => {
    // STM 3910C is a 3000-level legacy code but maps to CSAI 110, a 100-level course.
    const a = auditDegree([done("STM 3910C", "Accelerated Introduction to Programming")]);
    const upper = a.major.rules.find((r) => r.id === "major-300plus")!;
    expect(upper.earned).toBe(0);
  });
});

describe("requirement evaluation", () => {
  it("fills an Intellectual Foundations slot through an equivalency", () => {
    const a = auditDegree([done("ALT 1010")]);
    const humanities = a.intellectualFoundations.groups.find((g) => g.id === "if-humanities")!;
    const rome = humanities.slots!.find((s) => s.label === "Ancient Rome")!;
    expect(rome.filled).toBe(true);
  });

  it("accepts either side of an either/or Intellectual Foundations slot", () => {
    for (const code of ["WRIT 120", "INF 1210"]) {
      const a = auditDegree([done(code)]);
      const g = a.intellectualFoundations.groups.find((x) => x.id === "if-humanities")!;
      expect(g.slots!.find((s) => s.label === "Writing and the English Language")!.filled).toBe(true);
    }
  });

  it("needs both halves of a two-course option", () => {
    const one = auditDegree([done("INF 1103")]);
    const both = auditDegree([done("INF 1103"), done("INF 1104")]);
    const bible = (a: typeof one) =>
      a.intellectualFoundations.groups
        .find((g) => g.id === "if-humanities")!
        .slots!.find((s) => s.label === "The Bible")!.filled;
    expect(bible(one)).toBe(false);
    expect(bible(both)).toBe(true);
  });

  it("caps a choose-three group at three", () => {
    const a = auditDegree([done("SCIM 101"), done("SCIM 102"), done("SCIM 110"), done("SCIM 210")]);
    const g = a.intellectualFoundations.groups.find((x) => x.id === "if-science")!;
    expect(g.required).toBe(3);
    expect(g.completed).toBe(3);
    expect(g.satisfied).toBe(true);
  });

  it("lets one legacy course fill two concentration slots when it maps to both", () => {
    const a = auditDegree([done("STM 2102")]);
    const math = a.concentrations.find((c) => c.id === "mathematics")!;
    const core = math.groups.find((g) => g.id === "math-core")!;
    expect(core.completed).toBe(2);
  });

  it("scores an upper-division pick group", () => {
    const a = auditDegree([done("PHIL 310"), done("PHIL 315"), done("PHIL 320")]);
    const g = a.concentrations.find((c) => c.id === "philosophy")!.groups.find((x) => x.id === "phil-upper")!;
    expect(g.required).toBe(6);
    expect(g.completed).toBe(3);
    expect(g.satisfied).toBe(false);
  });

  it("picks the stronger subtopic for a one-of group", () => {
    const a = auditDegree([done("CSAI 360"), done("CSAI 370")]);
    const g = a.concentrations.find((c) => c.id === "csai")!.groups.find((x) => x.id === "csai-subtopic")!;
    expect(g.chosenPool).toBe("Machine Learning");
    expect(g.completed).toBe(2);
  });

  it("completes a concentration when every group is met", () => {
    const taken = [
      "PHIL 210", "PHIL 215", "PHIL 220", "PHIL 225", "PHIL 230", "LITR 220",
      "PHIL 310", "PHIL 315", "PHIL 320", "PHIL 325", "PHIL 330", "PHIL 335",
    ].map((c) => done(c));
    const phil = auditDegree(taken).concentrations.find((c) => c.id === "philosophy")!;
    expect(phil.satisfied).toBe(true);
    expect(phil.creditsEarned).toBe(36);
    expect(phil.percent).toBe(100);
  });
});

describe("polaris", () => {
  it("maps legacy Polaris courses and counts Build credit", () => {
    const a = auditDegree([done("POL 2110"), done("POL 1110"), done("POL 4150")]);
    expect(a.polaris.required.every((s) => s.filled)).toBe(true);
    expect(a.polaris.buildCreditsEarned).toBe(3);
  });

  it("caps Build equivalents at six credits", () => {
    const a = auditDegree([done("POLR 210"), done("POLR 211"), done("POLR 212")]);
    expect(a.polaris.equivalentCreditsUsed).toBeLessThanOrEqual(a.polaris.equivalentCap);
  });
});

describe("planning helpers", () => {
  it("ranks courses that close the most open requirements", () => {
    const a = auditDegree([]);
    const next = suggestNextCourses(a, ["philosophy"], 5);
    expect(next.length).toBe(5);
    expect(next[0].count).toBeGreaterThanOrEqual(next[4].count);
  });

  it("spreads the remaining credits over the terms left", () => {
    const a = auditDegree([done("MATH 210")]);
    const p = pacing(a, 8);
    expect(p.creditsRemaining).toBe(177);
    expect(p.creditsPerTerm).toBeCloseTo(177 / 8);
  });

  it("reports an empty record as nothing earned", () => {
    const a = auditDegree([]);
    expect(a.totals.earned).toBe(0);
    expect(a.totals.remaining).toBe(180);
    expect(a.concentrations.every((c) => c.percent === 0)).toBe(true);
  });
});

describe("waived requirements", () => {
  const waive = (code: string): TakenCourse => ({ code, status: "waived" });

  it("closes the requirement it stands for", () => {
    const a = auditDegree([waive("LITR 102")]);
    const humanities = a.intellectualFoundations.groups.find((g) => g.id === "if-humanities")!;
    const epic = humanities.slots!.find((s) => s.label === "Epic and Tragedy")!;
    expect(epic.filled).toBe(true);
    expect(epic.waived).toBe(true);
    expect(humanities.completed).toBe(1);
  });

  it("stops the course being listed as still required", () => {
    const before = auditDegree([]);
    const after = auditDegree([waive("LITR 102")]);
    const optionsOf = (a: typeof before) =>
      a.intellectualFoundations.groups.find((g) => g.id === "if-humanities")!.options ?? [];
    expect(optionsOf(before)).toContain("LITR 102");
    expect(optionsOf(after)).not.toContain("LITR 102");
  });

  it("brings no credit to the pillar it closes", () => {
    const waived = auditDegree([waive("LITR 102")]);
    const taken = auditDegree([done("LITR 102")]);
    expect(taken.intellectualFoundations.creditsEarned).toBe(3);
    expect(waived.intellectualFoundations.creditsEarned).toBe(0);
    expect(waived.intellectualFoundations.creditsInProgress).toBe(0);
  });

  it("leaves the 180-credit total untouched", () => {
    const a = auditDegree([waive("LITR 102"), waive("PHIL 210")]);
    expect(a.totals.earned).toBe(0);
    expect(a.totals.inProgress).toBe(0);
    expect(a.totals.remaining).toBe(180);
  });

  it("lists every waiver, and reports the credits that moved", () => {
    // PHIL 210 belongs to a concentration, which already sits inside the major,
    // so waiving it moves no credit between pillars. LITR 102 does.
    const a = auditDegree([waive("LITR 102"), waive("PHIL 210")]);
    expect(a.waived.courses.map((h) => h.code).sort()).toEqual(["LITR 102", "PHIL 210"]);
    expect(a.waived.creditsToReplace).toBe(3);
  });

  it("stops asking the pillar for credits it waived", () => {
    // 22.5/57 can never close once a requirement is waived out of the 57.
    const a = auditDegree([waive("LITR 102")]);
    expect(a.intellectualFoundations.creditsRequired).toBe(54);
    expect(a.intellectualFoundations.creditsWaived).toBe(3);
  });

  it("makes the credits up in the major, leaving the degree at 180", () => {
    const a = auditDegree([waive("LITR 102")]);
    expect(a.major.creditsRequired).toBe(99);
    expect(a.major.creditsAdded).toBe(3);
    expect(a.pillars.reduce((n, p) => n + p.creditsRequired, 0)).toBe(a.totals.required);
  });

  it("takes off both requirements when one waiver closes two", () => {
    // INF 1100 stands for LITR 102 and LITR 103, worth 3 credits each, so the
    // pillar drops by the two slots rather than by the one course.
    const a = auditDegree([waive("INF 1100")]);
    expect(a.intellectualFoundations.creditsWaived).toBe(6);
    expect(a.intellectualFoundations.creditsRequired).toBe(51);
    expect(a.major.creditsRequired).toBe(102);
    expect(a.pillars.reduce((n, p) => n + p.creditsRequired, 0)).toBe(180);
  });

  it("comes off Polaris the same way", () => {
    const a = auditDegree([waive("POLR 110")]);
    expect(a.polaris.creditsRequired).toBe(24);
    expect(a.major.creditsRequired).toBe(99);
    expect(a.pillars.reduce((n, p) => n + p.creditsRequired, 0)).toBe(180);
  });

  it("cannot be used against a bare credit total", () => {
    // Polaris Build asks for 21 credits, not for named courses, so a waiver has
    // nothing to close there and must not quietly count toward it.
    const a = auditDegree([waive("POLR 210")]);
    expect(a.polaris.buildCreditsEarned).toBe(0);
    expect(a.polaris.creditsRequired).toBe(27);
  });

  it("stops a concentration asking for what it waived", () => {
    const conc = (a: ReturnType<typeof auditDegree>) => a.concentrations.find((c) => c.id === "philosophy")!;
    expect(conc(auditDegree([])).creditsRequired).toBe(36);
    const waived = conc(auditDegree([waive("PHIL 210")]));
    expect(waived.creditsRequired).toBe(33);
    expect(waived.creditsWaived).toBe(3);
  });

  it("reads as complete when every requirement is waived", () => {
    const codes = auditDegree([]).intellectualFoundations.groups.flatMap((g) =>
      (g.slots ?? []).map((s) => s.options[0][0]),
    );
    const a = auditDegree(codes.map(waive));
    expect(a.intellectualFoundations.satisfied).toBe(true);
    expect(a.intellectualFoundations.creditsRequired).toBe(0);
    expect(a.intellectualFoundations.creditsEarned).toBe(0);
  });

  it("is not filed with work that failed to count", () => {
    const a = auditDegree([waive("LITR 102"), { code: "MATH 210", status: "failed" }]);
    expect(a.excluded.map((h) => h.code)).toEqual(["MATH 210"]);
    expect(a.retakeNeeded.map((h) => h.code)).toEqual(["MATH 210"]);
  });

  it("satisfies a concentration slot without paying for it", () => {
    const phil = (a: ReturnType<typeof auditDegree>) => a.concentrations.find((c) => c.id === "philosophy")!;
    const waived = phil(auditDegree([waive("PHIL 210")]));
    const taken = phil(auditDegree([done("PHIL 210")]));
    const coreOf = (c: typeof waived) => c.groups.find((g) => g.id === "phil-core")!;
    expect(coreOf(waived).completed).toBe(coreOf(taken).completed);
    expect(taken.creditsEarned).toBe(3);
    expect(waived.creditsEarned).toBe(0);
  });

  it("satisfies a choose-one group without paying for it", () => {
    const phil = (a: ReturnType<typeof auditDegree>) => a.concentrations.find((c) => c.id === "philosophy")!;
    const waived = phil(auditDegree([waive("LITR 220")]));
    const group = waived.groups.find((g) => g.id === "phil-lower-choice")!;
    expect(group.satisfied).toBe(true);
    expect(group.held).toContain("LITR 220");
    expect(group.options).not.toContain("LITR 220");
    expect(waived.creditsEarned).toBe(0);
  });

  it("is never suggested as a course still to take", () => {
    const a = auditDegree([waive("LITR 102")]);
    expect(suggestNextCourses(a, [], 40).map((n) => n.code)).not.toContain("LITR 102");
  });

  it("carries no credits of its own", () => {
    // The zero is the invariant every credit total leans on: a waiver that kept
    // its catalog credits would quietly inflate whichever sum forgot to ask.
    const h = normalizeRecord([waive("LITR 102")]).holdings[0];
    expect(h.credits).toBe(0);
    expect(h.nominalCredits).toBe(3);
  });

  it("does not leak credit into the major when it fills nothing else", () => {
    // PHIL 310 sits outside Foundations and Polaris, so an unclaimed waiver
    // would otherwise fall through to the major's credit count.
    const a = auditDegree([waive("PHIL 310")]);
    expect(a.major.creditsEarned).toBe(0);
    expect(a.major.countedCourses.map((h) => h.code)).not.toContain("PHIL 310");
  });

  it("survives a round trip through a shared link", () => {
    const encoded = encodeState({ ...emptyState, taken: [waive("LITR 102"), done("MATH 210")] });
    const back = decodeState(encoded)!;
    expect(back.taken.map((t) => t.status)).toEqual(["waived", "completed"]);
    expect(auditDegree(back.taken).waived.creditsToReplace).toBe(3);
  });

  it("prefers real coursework over a waiver for the same requirement", () => {
    const a = auditDegree([waive("LITR 102"), done("LITR 102")]);
    const epic = a.intellectualFoundations.groups
      .find((g) => g.id === "if-humanities")!
      .slots!.find((s) => s.label === "Epic and Tragedy")!;
    expect(epic.waived).toBe(false);
    expect(a.intellectualFoundations.creditsEarned).toBe(3);
  });
});

describe("2024-2025 Centers", () => {
  const old = (taken: TakenCourse[] = []) => auditDegree(taken, { program: "2024-2025" });

  it("scores a Center on its Foundations and Core alone", () => {
    // The catalog: "Students must complete the Center Foundations and Center
    // Core in any one Academic Center in order to graduate." The concentration
    // inside it is optional, so the Center has to stand on its own.
    const stem = old().centers.find((b) => b.name.startsWith("Science"))!;
    expect(stem.creditsRequired).toBe(54);
    expect(stem.groups.map((g) => g.name)).toEqual(["Center Foundations (18 credits)", "Center Core (36 credits)"]);
  });

  it("gives every Center the same 54 credits", () => {
    expect(old().centers.map((b) => b.creditsRequired)).toEqual([54, 54, 54, 54]);
  });

  it("counts Core coursework toward the Center without electing a concentration", () => {
    const a = old([done("STM 2102"), done("STM 2103"), done("STM 2501")]);
    const stem = a.centers.find((b) => b.name.startsWith("Science"))!;
    const core = stem.groups.find((g) => g.name.startsWith("Center Core"))!;
    expect(core.completed).toBe(3);
    expect(core.required).toBe(8);
    expect(stem.creditsEarned).toBeGreaterThan(0);
  });

  it("keeps concentration requirements out of the Center", () => {
    const stem = old().centers.find((b) => b.name.startsWith("Science"))!;
    const codes = stem.groups.flatMap((g) => (g.slots ?? []).flatMap((s) => s.options.flat()));
    // STM 3301 is Computing and Data Science concentration work, not Center Core.
    expect(codes).not.toContain("STM 3301");
    expect(codes).toContain("STM 2102");
  });

  it("keeps both of the listings the catalog prints for Arts and Letters", () => {
    // The Center's Foundations and Core are printed under each Area of
    // Concentration, and for Arts and Letters the two printings disagree.
    const al = old().centers.filter((b) => b.name === "Arts and Letters");
    expect(al.length).toBe(2);
    expect(al.every((b) => b.creditsRequired === 54)).toBe(true);
    expect(new Set(al.map((b) => b.id)).size).toBe(2);
  });

  it("has no Centers in the 2026-2027 program", () => {
    expect(auditDegree([], { program: "2026-2027" }).centers).toEqual([]);
  });
});
