import { describe, expect, it } from "vitest";
import { auditDegree } from "./audit";

/**
 * Slot names are shown beside a separate column of course codes. A name that
 * spells out its own code needs that code removed; every other name must
 * survive untouched, including the ordinary words in it.
 */
describe("requirement names", () => {
  const audit = auditDegree([]);
  const ifNames = audit.intellectualFoundations.groups.flatMap((g) => g.slots!.map((s) => s.label));

  it("leaves ordinary names alone", () => {
    expect(ifNames).toContain("Epic and Tragedy");
    expect(ifNames).toContain("Plato and Aristotle");
    expect(ifNames).toContain("Writing and the English Language");
    expect(ifNames).toContain("Life Sciences, Ethics, and Policy");
  });

  it("gives concentration slots a name from the course itself", () => {
    const csai = audit.concentrations.find((c) => c.id === "csai")!;
    const core = csai.groups.find((g) => g.id === "csai-core")!;
    // These slots carry no label of their own; the UI falls back to the title.
    expect(core.slots!.every((s) => s.label === null)).toBe(true);
    expect(core.slots!.map((s) => s.options[0][0])).toContain("MATH 220");
  });
});
