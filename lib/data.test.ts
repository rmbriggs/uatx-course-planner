import { describe, expect, it } from "vitest";
import { allCourses, currentCourses, equivalencies, getCourse, legacyCourses, levelOf, requirements } from "./catalog";

describe("extracted catalog", () => {
  it("has both catalogs", () => {
    expect(currentCourses.length).toBeGreaterThan(450);
    expect(legacyCourses.length).toBeGreaterThan(150);
  });

  it("gives every course a code, a sane title, and credits", () => {
    for (const c of allCourses) {
      expect(c.code, c.code).toMatch(/^[A-Z]{3,4} \d{3,4}[A-Z]?$/);
      expect(c.title.length, c.code).toBeGreaterThan(2);
      // Orientation carries no credit, so zero is legitimate.
      expect(c.credits, c.code).toBeGreaterThanOrEqual(0);
      expect(c.credits, c.code).toBeLessThanOrEqual(18);
    }
  });

  it("keeps OCR bleed out of course titles", () => {
    // A title holding another course code or a stray credit value means two
    // catalog columns were merged into one row.
    for (const c of allCourses) {
      expect(c.title, `${c.code}: ${c.title}`).not.toMatch(/[A-Z]{3,4}\s?\d{3,4}/);
      expect(c.title, `${c.code}: ${c.title}`).not.toMatch(/\b\d+\.\d+\b/);
      expect(c.title.split(" ").length, `${c.code}: ${c.title}`).toBeLessThan(14);
    }
  });

  it("has no duplicate codes", () => {
    const codes = allCourses.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("equivalency rules", () => {
  it("only ever grants courses that exist", () => {
    for (const r of equivalencies.rules) {
      for (const alt of r.grants) {
        for (const code of alt) expect(getCourse(code), `${r.from} -> ${code}`).toBeDefined();
      }
    }
  });

  it("labels every inferred rule with a reason", () => {
    for (const r of equivalencies.rules.filter((x) => x.inferred)) {
      expect(r.reason, r.from.join("+")).toBeTruthy();
    }
  });

  it("gives an elective rule a level instead of a course", () => {
    for (const r of equivalencies.rules.filter((x) => x.electiveGrant)) {
      expect(r.grants).toHaveLength(0);
      expect([100, 200, 300, 400]).toContain(r.electiveGrant!.level);
    }
  });
});

describe("requirements", () => {
  it("splits the degree into 180 credits", () => {
    expect(requirements.pillars.reduce((n, p) => n + p.credits, 0)).toBe(requirements.totalCredits);
  });

  it("makes every concentration 36 credits, 18 lower and 18 upper", () => {
    expect(requirements.concentrations).toHaveLength(8);
    for (const c of requirements.concentrations) {
      expect(c.credits, c.name).toBe(36);
      expect(c.lowerCredits + c.upperCredits, c.name).toBe(36);
    }
  });

  it("names only courses that exist, at the level the group implies", () => {
    for (const c of requirements.concentrations) {
      for (const g of c.groups) {
        const codes =
          g.type === "pick" ? g.pool : g.type === "oneOf" ? g.pools.flatMap((p) => p.pool) : g.slots.flatMap((s) => s.options.flat());
        for (const code of codes) expect(getCourse(code), `${c.name}: ${code}`).toBeDefined();
        if (g.id.includes("upper")) {
          for (const code of codes) expect(levelOf(code), `${c.name}: ${code}`).toBeGreaterThanOrEqual(300);
        }
      }
    }
  });

  it("adds the Intellectual Foundations groups up to 57 credits", () => {
    let total = 0;
    for (const g of requirements.intellectualFoundations.groups) {
      if (g.type !== "slots") continue;
      const values = g.slots
        .map((s) => s.options[0].reduce((n, c) => n + (getCourse(c)?.credits ?? 0), 0))
        .sort((a, b) => a - b);
      total += (g.choose ? values.slice(0, g.choose) : values).reduce((n, v) => n + v, 0);
    }
    expect(total).toBe(requirements.intellectualFoundations.credits);
  });
});
