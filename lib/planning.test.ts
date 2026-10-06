import { describe, expect, it } from "vitest";
import { auditDegree, suggestNextCourses } from "./audit";
import { offeredCatalogCodes, offeringKey, offeringsFor } from "./offerings";
import { planImpact, plannedCredits, projectFor, projectRecord, termCoverage } from "./plan";
import { checkPrerequisite, heldCodes } from "./prereq";
import { decodeState, emptyState, encodeState } from "./storage";
import type { Plan, TakenCourse } from "./types";

/** A first-year part way through a term, the way the page would hold it. */
const record: TakenCourse[] = [
  { code: "WRIT 120", credits: 3, status: "completed" },
  { code: "MATH 101", credits: 3, status: "completed" },
  { code: "PHIL 110", credits: 3, status: "in-progress" },
  { code: "HIST 110", credits: 3, status: "in-progress" },
];

describe("planning a term end to end", () => {
  it("only ever suggests courses the term actually runs", () => {
    const audit = auditDegree(projectRecord(record));
    const offered = offeredCatalogCodes("winter-2627");
    const next = suggestNextCourses(audit, {}, 10, offered);

    expect(next.length).toBeGreaterThan(0);
    for (const s of next) expect(offered.has(s.code), `${s.code} is not offered in Winter`).toBe(true);
  });

  it("suggests things it would not have without the filter", () => {
    const audit = auditDegree(projectRecord(record));
    const unfiltered = suggestNextCourses(audit, {}, 10).map((s) => s.code);
    const filtered = suggestNextCourses(audit, {}, 10, offeredCatalogCodes("winter-2627")).map((s) => s.code);
    // The point of the feature: the two lists are not the same.
    expect(filtered).not.toEqual(unfiltered);
  });

  it("stops suggesting a course once it is marked Definitely", () => {
    const offered = offeredCatalogCodes("winter-2627");
    const first = suggestNextCourses(auditDegree(projectRecord(record)), {}, 10, offered)[0];
    expect(first).toBeDefined();

    // The plan is keyed by the code the term prints, which for a special
    // topic is the lettered one.
    const printed =
      offeringsFor("winter-2627").find((o) => o.catalogCode === first.code)?.code ?? first.code;
    const plan: Plan = { [offeringKey("winter-2627", printed)]: "definitely" };

    const after = suggestNextCourses(
      auditDegree(projectFor(record, plan, "winter-2627")),
      {},
      10,
      offered,
    ).map((s) => s.code);
    expect(after).not.toContain(first.code);
  });

  it("does not let a Maybe close anything", () => {
    const offered = offeredCatalogCodes("winter-2627");
    const first = suggestNextCourses(auditDegree(projectRecord(record)), {}, 10, offered)[0];
    const printed =
      offeringsFor("winter-2627").find((o) => o.catalogCode === first.code)?.code ?? first.code;
    const plan: Plan = { [offeringKey("winter-2627", printed)]: "maybe" };

    const after = suggestNextCourses(
      auditDegree(projectFor(record, plan, "winter-2627")),
      {},
      10,
      offered,
    ).map((s) => s.code);
    expect(after).toContain(first.code);
  });

  it("counts a Winter Definitely toward a D-Term prerequisite", () => {
    // MATH 320 Intermediate Linear Algebra wants MATH 210, which Winter runs.
    expect(checkPrerequisite("MATH 320", heldCodes(projectRecord(record))).state).toBe("unmet");

    const plan: Plan = { [offeringKey("winter-2627", "MATH 210")]: "definitely" };
    const held = heldCodes(projectFor(record, plan, "dterm-2627"));
    expect(checkPrerequisite("MATH 320", held).state).toBe("met");
  });

  it("keeps a Maybe out of the prerequisite chain", () => {
    const plan: Plan = { [offeringKey("winter-2627", "MATH 210")]: "maybe" };
    const held = heldCodes(projectFor(record, plan, "dterm-2627"));
    expect(checkPrerequisite("MATH 320", held).state).toBe("unmet");
  });

  it("totals each term's planned credits separately", () => {
    const plan: Plan = {
      [offeringKey("winter-2627", "MATH 210")]: "definitely",
      [offeringKey("winter-2627", "PHIL 220")]: "definitely",
      [offeringKey("dterm-2627", "POLR 210")]: "definitely",
    };
    expect(plannedCredits(plan, "winter-2627", "definitely")).toBe(6);
    expect(plannedCredits(plan, "dterm-2627", "definitely")).toBe(3);
  });

  it("carries a whole plan through a shared link", () => {
    const plan: Plan = {
      [offeringKey("winter-2627", "MATH 210")]: "definitely",
      [offeringKey("winter-2627", "PHIL 220")]: "maybe",
      [offeringKey("dterm-2627", "POLR 210")]: "considering",
    };
    const back = decodeState(encodeState({ ...emptyState, taken: record, plan }))!;
    expect(back.plan).toEqual(plan);
    // and the receiver projects from their own standing, not the sender's
    expect(back.planningTerm).toBeNull();
  });

  it("leaves the real record alone while projecting", () => {
    const before = JSON.stringify(record);
    auditDegree(projectFor(record, { [offeringKey("winter-2627", "MATH 210")]: "definitely" }, "winter-2627"));
    expect(JSON.stringify(record)).toBe(before);
  });
});

describe("what a term does for a concentration", () => {
  const csai: TakenCourse[] = ["MATH 210", "MATH 220", "MATH 230", "CSAI 220", "CSAI 230", "CSAI 235", "CSAI 300"].map(
    (code) => ({ code, credits: 3, status: "completed" as const }),
  );
  const offered = offeredCatalogCodes("winter-2627");

  it("lists each open requirement with what the term runs for it", () => {
    const [c] = termCoverage(auditDegree(csai), { csai: "committed" }, offered);
    expect(c.id).toBe("csai");
    expect(c.interest).toBe("committed");
    const gap = (name: string) => c.gaps.find((g) => g.group.startsWith(name))!;
    expect(gap("Lower Division").offered).toEqual([{ code: "CSAI 210" }]);
    expect(gap("Upper Division - complete both").offered).toEqual([]);
    expect(gap("Upper Division - complete 4").offered).toEqual([{ code: "CSAI 380", pool: "Machine Learning" }]);
  });

  it("drops a requirement a Definitely already covers", () => {
    const plan: Plan = { [offeringKey("winter-2627", "CSAI 210")]: "definitely" };
    const [c] = termCoverage(auditDegree(projectFor(csai, plan, "winter-2627")), { csai: "committed" }, offered);
    expect(c.gaps.some((g) => g.group.startsWith("Lower Division"))).toBe(false);
  });

  it("puts committed ahead of exploring, and falls back to the closest when nothing is marked", () => {
    const audit = auditDegree(csai);
    const both = termCoverage(audit, { economics: "considering", csai: "committed" }, offered);
    expect(both.map((c) => c.id)).toEqual(["csai", "economics"]);
    expect(termCoverage(audit, {}, offered).map((c) => c.id)).toEqual(["csai"]);
  });
});

describe("what a plan does to every concentration", () => {
  const audit = (r: TakenCourse[]) => auditDegree(r);

  it("shows a course moving every concentration it counts in, not only the one it was picked for", () => {
    // MATH 220 sits in both the CSAI and the Economics lower division.
    const plan: Plan = { [offeringKey("winter-2627", "MATH 220")]: "definitely" };
    const rows = planImpact(record, plan, "winter-2627", { csai: "committed" }, audit);
    for (const id of ["csai", "economics"]) {
      const row = rows.find((r) => r.id === id)!;
      expect(row.courses).toEqual([{ code: "MATH 220", tier: "definitely" }]);
      expect(row.definitely).toBeGreaterThan(row.before);
    }
    expect(rows.find((r) => r.id === "csai")!.interest).toBe("committed");
    // The concentrations it moves come first.
    expect(rows[0].courses.length).toBeGreaterThan(0);
  });

  it("keeps a Maybe out of the Definitely column", () => {
    const plan: Plan = { [offeringKey("winter-2627", "MATH 220")]: "maybe" };
    const csai = planImpact(record, plan, "winter-2627", {}, audit).find((r) => r.id === "csai")!;
    expect(csai.definitely).toBe(csai.before);
    expect(csai.withMaybes).toBeGreaterThan(csai.definitely);
    expect(csai.courses).toEqual([{ code: "MATH 220", tier: "maybe" }]);
  });

  it("counts an earlier term's Definitely as already done when planning a later one", () => {
    const plan: Plan = { [offeringKey("winter-2627", "MATH 220")]: "definitely" };
    const csai = planImpact(record, plan, "dterm-2627", {}, audit).find((r) => r.id === "csai")!;
    expect(csai.courses).toEqual([]);
    expect(csai.definitely).toBe(csai.before);
  });
});
