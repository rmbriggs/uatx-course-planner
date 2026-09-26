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

  it("lets a narrow screen scroll the suggestions rather than the whole page", () => {
    expect(markup).toMatch(/<div class="table-scroll"><table class="next-table">/);
  });

  it("leaves out everything that belongs to where you stand", () => {
    expect(markup).not.toContain('id="progress"');
    expect(markup).not.toContain('id="concentrations"');
    expect(markup).not.toContain("jump-bar");
  });
});

describe("a suggestion the term runs under more than one letter", () => {
  it("files it where the page always has, so an existing plan still shows as pressed", () => {
    // Winter runs HIST 385 as both 385A and 385B; the page has always keyed a
    // "HIST 385" suggestion to the last of them.
    const suggestion = { code: "HIST 385", title: "Special Topics", credits: 3, forWhat: ["History"], tier: "open" };
    const out = renderToStaticMarkup(
      <PlanView
        termId="winter-2627"
        plan={{ "winter-2627:HIST 385B": "definitely" }}
        held={heldCodes([])}
        next={[suggestion] as unknown as Parameters<typeof PlanView>[0]["next"]}
        aiming={false}
        onPlan={noop}
      />,
    );
    const suggested = out.slice(out.indexOf("Suggested for"), out.indexOf("Browse all"));
    expect(suggested).toMatch(/HIST 385[\s\S]*?data-tier="definitely" aria-pressed="true"/);
  });
});
