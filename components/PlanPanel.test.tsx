import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrowseOfferings, PlanPanel, TierButtons } from "./PlanPanel";
import { offeringKey } from "@/lib/offerings";
import { heldCodes } from "@/lib/prereq";
import type { Plan, TakenCourse } from "@/lib/types";

const record: TakenCourse[] = [
  { code: "WRIT 120", credits: 3, status: "completed" },
  { code: "MATH 101", credits: 3, status: "completed" },
];
const held = heldCodes(record);
const noop = () => {};

/** Text as a reader sees it, with React's SSR comment markers removed. */
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("PlanPanel", () => {
  it("says so when nothing is planned", () => {
    const out = text(
      renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={{}} held={held} onChange={noop} />),
    );
    expect(out).toContain("Your plan for Winter 26/27");
    expect(out).toContain("Nothing planned yet");
    expect(out).toContain("0 credits marked Definitely");
  });

  it("groups courses by tier with each tier's credits", () => {
    const plan: Plan = {
      [offeringKey("winter-2627", "MATH 210")]: "definitely",
      [offeringKey("winter-2627", "PHIL 220")]: "definitely",
      [offeringKey("winter-2627", "MATH 220")]: "maybe",
    };
    const out = text(
      renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={plan} held={held} onChange={noop} />),
    );
    expect(out).toContain("6 credits marked Definitely");
    expect(out).toContain("Linear Algebra");
    expect(out).toContain("Early Modern Philosophy");
    expect(out).toContain("Maybe");
    expect(out).toContain("Probability");
  });

  it("names the faculty the term lists", () => {
    const plan: Plan = { [offeringKey("winter-2627", "MATH 210")]: "definitely" };
    const out = text(
      renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={plan} held={held} onChange={noop} />),
    );
    expect(out).toMatch(/Linear Algebra\s*·/);
  });

  it("warns about a prerequisite the plan does not cover", () => {
    // MATH 320 wants MATH 210, which is neither held nor planned.
    const plan: Plan = { [offeringKey("winter-2627", "MATH 320")]: "definitely" };
    const out = text(
      renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={plan} held={held} onChange={noop} />),
    );
    expect(out).toContain("Wants MATH 210");
    expect(out).toContain("not on your record and not in this plan");
  });

  it("drops the warning once the prerequisite is held", () => {
    const plan: Plan = { [offeringKey("winter-2627", "MATH 320")]: "definitely" };
    const out = text(
      renderToStaticMarkup(
        <PlanPanel
          termId="winter-2627"
          plan={plan}
          held={new Set([...held, "MATH 210"])}
          onChange={noop}
        />,
      ),
    );
    expect(out).not.toContain("Wants MATH 210");
  });

  it("shows the restriction a course carries", () => {
    // AMCV 365 is closed to anyone who took INF 1320 with Professor Scheall.
    const plan: Plan = { [offeringKey("winter-2627", "AMCV 365")]: "considering" };
    const out = text(
      renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={plan} held={held} onChange={noop} />),
    );
    expect(out).toContain("Not available to students who have taken INF 1320");
  });
});

describe("BrowseOfferings", () => {
  it("lists every course the term runs, by department", () => {
    const out = text(renderToStaticMarkup(<BrowseOfferings termId="winter-2627" plan={{}} onChange={noop} />));
    expect(out).toContain("Browse all 58 courses Winter 26/27 runs");
    expect(out).toContain("American Civilization");
    expect(out).toContain("Philosophy");
    expect(out).toContain("The American Founding");
  });

  it("says when a course fills no requirement", () => {
    const out = text(renderToStaticMarkup(<BrowseOfferings termId="dterm-2627" plan={{}} onChange={noop} />));
    expect(out).toContain("Browse all 5 courses D-Term 26/27 runs");
    expect(out).toContain("Not in the catalog, so it fills no named requirement");
  });
});

describe("TierButtons", () => {
  it("offers all three tiers and presses the one in force", () => {
    const markup = renderToStaticMarkup(<TierButtons value="maybe" onChange={noop} />);
    expect(text(markup)).toContain("Definitely");
    expect(text(markup)).toContain("Maybe");
    expect(text(markup)).toContain("Considering");
    expect(markup).toContain('data-tier="maybe" aria-pressed="true"');
    expect(markup).toContain('data-tier="definitely" aria-pressed="false"');
  });
});
