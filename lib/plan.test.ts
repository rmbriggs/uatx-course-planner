import { describe, expect, it } from "vitest";
import { plannedAsCourses, plannedAt, plannedCredits, projectFor, projectRecord } from "./plan";
import type { Plan, TakenCourse } from "./types";

const record: TakenCourse[] = [
  { code: "PHIL 120", credits: 3, status: "completed" },
  { code: "MATH 210", credits: 3, status: "in-progress" },
  { code: "HIST 110", credits: 3, status: "incomplete" },
  { code: "ECON 102", credits: 3, status: "failed" },
  { code: "LITR 210", credits: 3, status: "withdrawn" },
];

describe("projectRecord", () => {
  it("assumes what you are attempting now will pass", () => {
    const out = projectRecord(record);
    expect(out.find((c) => c.code === "MATH 210")?.status).toBe("completed");
  });

  it("leaves every other status alone", () => {
    const out = projectRecord(record);
    const status = (code: string) => out.find((c) => c.code === code)?.status;
    // An incomplete is unfinished work under an extension, not a course
    // being attempted now, so it is a different and less safe assumption.
    expect(status("HIST 110")).toBe("incomplete");
    expect(status("ECON 102")).toBe("failed");
    expect(status("LITR 210")).toBe("withdrawn");
    expect(status("PHIL 120")).toBe("completed");
  });

  it("does not mutate what it was given", () => {
    projectRecord(record);
    expect(record.find((c) => c.code === "MATH 210")?.status).toBe("in-progress");
  });
});

describe("the plan", () => {
  const plan: Plan = {
    "winter-2627:PHIL 220": "definitely",
    "winter-2627:MATH 220": "maybe",
    "dterm-2627:POLR 210": "definitely",
  };

  it("lists what is planned in one term", () => {
    expect(plannedAt(plan, "winter-2627").map((p) => p.code).sort()).toEqual(["MATH 220", "PHIL 220"]);
    expect(plannedAt(plan, "winter-2627", "definitely").map((p) => p.code)).toEqual(["PHIL 220"]);
  });

  it("totals a tier's credits for a term", () => {
    expect(plannedCredits(plan, "winter-2627", "definitely")).toBe(3);
    expect(plannedCredits(plan, "winter-2627", "maybe")).toBe(3);
    expect(plannedCredits(plan, "dterm-2627", "considering")).toBe(0);
  });

  it("drops a course the term no longer runs", () => {
    expect(plannedAt({ "winter-2627:ZZZZ 999": "definitely" }, "winter-2627")).toEqual([]);
  });

  it("turns only the definitelys into coursework, and only up to the term asked for", () => {
    const winter = plannedAsCourses(plan, "winter-2627");
    expect(winter.map((c) => c.code)).toEqual(["PHIL 220"]);
    expect(winter[0].status).toBe("in-progress");

    // Planning D-Term means Winter's definitelys are behind you.
    const dterm = plannedAsCourses(plan, "dterm-2627");
    expect(dterm.map((c) => c.code).sort()).toEqual(["PHIL 220", "POLR 210"]);
  });

  it("projects the record plus the plan up to that term", () => {
    const out = projectFor(record, plan, "winter-2627");
    const status = (code: string) => out.find((c) => c.code === code)?.status;
    expect(status("MATH 210")).toBe("completed");
    expect(status("PHIL 220")).toBe("in-progress");
    expect(out.find((c) => c.code === "MATH 220")).toBeUndefined();
  });
});
