import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PillarBlock } from "./Requirements";
import { auditDegree } from "@/lib/audit";
import type { TakenCourse } from "@/lib/types";

/** A real audit, so the groups below are the ones the app actually renders. */
const record: TakenCourse[] = [{ code: "WRIT 120", credits: 3, status: "completed" }];
const audit = auditDegree(record);
const pillar = audit.intellectualFoundations;

const markup = renderToStaticMarkup(
  <PillarBlock
    name="Intellectual Foundations"
    creditsEarned={pillar.creditsEarned}
    creditsRequired={pillar.creditsRequired}
    creditsInProgress={pillar.creditsInProgress}
    groups={pillar.groups}
  />,
);

describe("offered labels in the requirements panel", () => {
  it("marks options the coming terms actually run", () => {
    expect(markup).toContain("offered-chip");
  });

  it("names the term on the chip", () => {
    expect(markup).toMatch(/class="offered-chip"[^>]*>(Winter|D-Term)/);
  });

  it("spells the full term out in the tooltip", () => {
    expect(markup).toContain('title="Offered Winter 26/27"');
  });

  it("does not mark a course no coming term runs", () => {
    // Every chip sits on a course one of the two terms on file offers.
    const chips = [...markup.matchAll(/title="Offered ([^"]+)"/g)].map((m) => m[1]);
    expect(chips.length).toBeGreaterThan(0);
    for (const c of chips) expect(c).toMatch(/Winter 26\/27|D-Term 26\/27/);
  });
});
