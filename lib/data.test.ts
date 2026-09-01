import { describe, expect, it } from "vitest";
import {
  allCourses,
  currentCourses,
  equivalencies,
  getCourse,
  getRequirements,
  grading,
  legacyCourses,
  levelOf,
  PROGRAMS,
  requirements,
} from "./catalog";
import { auditDegree } from "./audit";

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
          g.type === "pick" || g.type === "credits"
            ? g.pool
            : g.type === "oneOf"
              ? g.pools.flatMap((p) => p.pool)
              : g.slots.flatMap((s) => s.options.flat());
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

describe("both programs", () => {
  it("audits without missing anything the page reads", () => {
    for (const program of ["2026-2027", "2024-2025"] as const) {
      const req = getRequirements(program);
      expect(req.program, program).toBe(program);
      expect(req.pillars.reduce((n, p) => n + p.credits, 0), program).toBe(180);
      expect(req.concentrations.length, program).toBeGreaterThan(0);
      expect(req.polaris.buildCourses.length, program).toBeGreaterThan(0);

      const audit = auditDegree([{ code: "INF 1100", status: "completed" }], { program });
      expect(audit.program).toBe(program);
      expect(audit.pillars).toHaveLength(3);
      // Pillar names come from the program, not hard-coded.
      expect(audit.pillars.map((p) => p.name)).toEqual(req.pillars.map((p) => p.name));
      for (const c of audit.concentrations) {
        expect(c.groups.every((g) => g.unit === "courses" || g.unit === "credits"), c.name).toBe(true);
      }
    }
  });

  it("keeps grading policy available whichever program is chosen", () => {
    expect(grading.passingScore).toBe(60);
    expect(grading.minimumCsa).toBe(73);
    expect(grading.retake.length).toBeGreaterThan(10);
  });

  it("measures the 2024-2025 program in its own course codes", () => {
    // No old-to-new translation: STM 2102 is a Center Core course as it stands.
    const a = auditDegree([{ code: "STM 2102", status: "completed" }], { program: "2024-2025" });
    const stem = a.centers.find((b) => b.name.startsWith("Science"))!;
    expect(stem.groups.find((g) => g.name.startsWith("Center Core"))!.completed).toBe(1);
    expect(a.normalization.holdings[0].satisfies).toEqual(["STM 2102"]);
  });

  it("splits the catalog's 81 credits into a 54-credit Center and a 27-credit concentration", () => {
    // The Center's Foundations and Core are required on their own, so they are
    // scored on their own; the concentration carries only its own work.
    const req = getRequirements("2024-2025");
    for (const c of req.concentrations) {
      const centre = req.centers!.find((b) => b.id === c.centerId)!;
      expect(c.credits, c.name).toBe(27);
      expect(centre.credits + c.credits, c.name).toBe(c.declaredWithCenter);
    }
  });

  it("keeps Center requirements off the concentration that sits in it", () => {
    const req = getRequirements("2024-2025");
    for (const c of req.concentrations) {
      expect(c.groups.some((g) => g.name.startsWith("Center ")), c.name).toBe(false);
    }
  });
});

describe("target ids", () => {
  it("gives Centers and concentrations one key space with no collisions", () => {
    // A saved plan keys both by id in a single map, so a shared id would make
    // targeting one silently target the other.
    const ids = [
      ...PROGRAMS.flatMap((p) => getRequirements(p.id).concentrations.map((c) => c.id)),
      ...PROGRAMS.flatMap((p) => getRequirements(p.id).centers?.map((b) => b.id) ?? []),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });
});
