import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanView } from "./PlanView";
import { auditDegree, suggestNextCourses } from "@/lib/audit";
import { offeredCatalogCodes } from "@/lib/offerings";
import { heldCodes } from "@/lib/prereq";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// An empty record: planning before a transcript is uploaded is a real case.
const audit = auditDegree([]);
const markup = renderToStaticMarkup(
  <PlanView
    termId="winter-2627"
    plan={{}}
    held={heldCodes([])}
    next={suggestNextCourses(audit, {}, 10, offeredCatalogCodes("winter-2627"))}
    aiming={false}
    onPlan={noop}
  />,
);

describe("PlanView", () => {
  it("lays out the plan, the search, suggestions and browse, in that order", () => {
    const out = text(markup);
    const at = (s: string) => out.indexOf(s);
    expect(at("Your plan for Winter 26/27")).toBeGreaterThan(-1);
    expect(at("Find a course for Winter 26/27")).toBeGreaterThan(at("Your plan for Winter 26/27"));
    expect(at("Suggested for Winter 26/27")).toBeGreaterThan(at("Find a course for Winter 26/27"));
    expect(at("Browse all")).toBeGreaterThan(at("Suggested for Winter 26/27"));
  });

  it("puts plan buttons on every suggestion", () => {
    expect(markup).toContain("tier-buttons");
    expect(text(markup)).toContain("Plan it");
  });

  it("leaves out everything that belongs to where you stand", () => {
    expect(markup).not.toContain('id="progress"');
    expect(markup).not.toContain('id="concentrations"');
    expect(markup).not.toContain("jump-bar");
  });
});
