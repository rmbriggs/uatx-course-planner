import { describe, expect, it } from "vitest";
import { checkPrerequisite, heldCodes, parsePrerequisite } from "./prereq";
import type { TakenCourse } from "./types";

describe("parsePrerequisite", () => {
  it("reads alternatives", () => {
    expect(parsePrerequisite("AMCV 200 or INF 2121")).toEqual([["AMCV 200"], ["INF 2121"]]);
  });

  it("reads a single course", () => {
    expect(parsePrerequisite("AMCV 310")).toEqual([["AMCV 310"]]);
  });

  it("reads two codes with no connector as both being needed", () => {
    // PHYS 310's catalog text is exactly "PHYS 220 MATH 240".
    expect(parsePrerequisite("PHYS 220 MATH 240")).toEqual([["PHYS 220", "MATH 240"]]);
  });

  it("reads an explicit and", () => {
    expect(parsePrerequisite("MATH 101 and MATH 200")).toEqual([["MATH 101", "MATH 200"]]);
  });

  it("refuses to guess at prose", () => {
    expect(parsePrerequisite("Latin I or equivalent proficiency")).toBeNull();
    expect(parsePrerequisite("Permission of the instructor")).toBeNull();
    expect(parsePrerequisite("")).toBeNull();
  });
});

describe("checkPrerequisite", () => {
  const held = new Set(["MATH 210", "AMCV 200"]);

  it("says nothing about a course with no prerequisite", () => {
    expect(checkPrerequisite("MATH 101", held).state).toBe("none");
  });

  it("passes when one alternative is held", () => {
    // AMCV 210 :: "AMCV 200 or INF 2121"
    expect(checkPrerequisite("AMCV 210", held).state).toBe("met");
  });

  it("fails when none is", () => {
    // AMCV 310 :: "AMCV 210"
    const out = checkPrerequisite("AMCV 310", held);
    expect(out.state).toBe("unmet");
    expect(out.options).toEqual([["AMCV 210"]]);
  });

  it("holds a clean code expression to account", () => {
    // LANG 321's catalog prerequisite is the code LANG 320, not the prose
    // "Latin I or equivalent proficiency" the term's description carries.
    const out = checkPrerequisite("LANG 321", held);
    expect(out.state).toBe("unmet");
    expect(out.options).toEqual([["LANG 320"]]);
  });

  it("reports a prerequisite it cannot read rather than judging it", () => {
    // EPH 3130's is truncated by the OCR mid-code — "EPH 1110, EPH 1120,
    // EPH 1210, EPH 1220, EPH 1310, EPH" — and is the only one in either
    // catalog the parser refuses. Refusing is the point: a half-read list
    // must not become a warning that a course is off-limits.
    const out = checkPrerequisite("EPH 3130", held);
    expect(out.state).toBe("unknown");
    expect(out.text).toContain("EPH 1110");
    expect(out.options).toBeUndefined();
  });
});

describe("heldCodes", () => {
  it("counts completed, in-progress and waived work, but not failed", () => {
    const record: TakenCourse[] = [
      { code: "MATH 210", status: "completed" },
      { code: "PHIL 220", status: "in-progress" },
      { code: "HIST 110", status: "waived" },
      { code: "ECON 102", status: "failed" },
      { code: "LITR 210", status: "withdrawn" },
    ];
    const held = heldCodes(record);
    expect(held.has("MATH 210")).toBe(true);
    expect(held.has("PHIL 220")).toBe(true);
    expect(held.has("HIST 110")).toBe(true);
    expect(held.has("ECON 102")).toBe(false);
    expect(held.has("LITR 210")).toBe(false);
  });
});
