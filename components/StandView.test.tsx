import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StandView } from "./StandView";
import { auditDegree, suggestNextCourses } from "@/lib/audit";
import type { TakenCourse } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const render = (record: TakenCourse[]) => {
  const audit = auditDegree(record);
  return renderToStaticMarkup(
    <StandView
      audit={audit}
      program="2026-2027"
      targets={{}}
      onTarget={noop}
      onClearTargets={noop}
      next={suggestNextCourses(audit, {}, 10)}
      csa={undefined}
    />,
  );
};

const clean = render([{ code: "WRIT 120", credits: 3, status: "completed" }]);

describe("StandView", () => {
  it("lays out Progress, Concentrations and Take next, in that order", () => {
    const at = (id: string) => clean.indexOf(`id="${id}"`);
    expect(at("progress")).toBeGreaterThan(-1);
    expect(at("concentrations")).toBeGreaterThan(at("progress"));
    expect(at("next")).toBeGreaterThan(at("concentrations"));
  });

  it("links to each section from the jump bar", () => {
    expect(clean).toContain('href="#progress"');
    expect(clean).toContain('href="#concentrations"');
    expect(clean).toContain('href="#next"');
  });

  it("leaves out Record details when there is nothing to show", () => {
    expect(clean).not.toContain('href="#record-details"');
    expect(clean).not.toContain('id="record-details"');
  });

  it("shows Record details when a course is not counting", () => {
    const markup = render([
      { code: "WRIT 120", credits: 3, status: "completed" },
      { code: "MATH 101", credits: 3, status: "failed", grade: "40" },
    ]);
    expect(markup).toContain('href="#record-details"');
    expect(text(markup)).toContain("Not counting toward your degree");
  });

  it("offers Committed and Exploring, and no plan buttons", () => {
    expect(text(clean)).toContain("Exploring");
    expect(text(clean)).not.toContain("Considering");
    expect(clean).not.toContain("tier-buttons");
  });

  it("points Polaris Build at the log in the record", () => {
    expect(clean).toContain('href="#build-log"');
    expect(clean).not.toContain("build-add");
  });
});
