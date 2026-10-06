import { describe, expect, it } from "vitest";
import offeringsFile from "@/data/offerings.json";
import { getCourse } from "./catalog";

const file = offeringsFile as {
  source: string;
  terms: { id: string; name: string; order: number }[];
  offerings: {
    term: string; code: string; catalogCode: string | null; title: string;
    credits: number; faculty: string[]; department: string;
    note: string | null; sections: unknown[];
  }[];
};

describe("term offerings", () => {
  it("has both terms, in order", () => {
    expect(file.terms.map((t) => t.id)).toEqual(["winter-2627", "dterm-2627"]);
    expect(file.terms.map((t) => t.name)).toEqual(["Winter 26/27", "D-Term 26/27"]);
  });

  it("carries every course the descriptions list", () => {
    expect(file.offerings.length).toBe(68);
    const byTerm = (id: string) => file.offerings.filter((o) => o.term === id).length;
    expect(byTerm("winter-2627")).toBe(63);
    expect(byTerm("dterm-2627")).toBe(5);
  });

  it("gives every offering a term, a department, a title and credits", () => {
    for (const o of file.offerings) {
      expect(file.terms.some((t) => t.id === o.term), o.code).toBe(true);
      expect(o.department.length, o.code).toBeGreaterThan(2);
      expect(o.title.length, o.code).toBeGreaterThan(2);
      expect(o.credits, o.code).toBeGreaterThan(0);
      expect(o.credits, o.code).toBeLessThanOrEqual(18);
      expect(Array.isArray(o.faculty), o.code).toBe(true);
      expect(Array.isArray(o.sections), o.code).toBe(true);
    }
  });

  it("resolves every catalogCode it claims", () => {
    for (const o of file.offerings) {
      if (o.catalogCode === null) continue;
      expect(getCourse(o.catalogCode), `${o.code} -> ${o.catalogCode}`).toBeDefined();
    }
  });

  it("names exactly the two offerings the catalog does not list", () => {
    const orphans = file.offerings.filter((o) => o.catalogCode === null).map((o) => o.code);
    expect(orphans.sort()).toEqual(["LEAD 385A", "POLR 380A"]);
  });

  it("explains every uncatalogued offering", () => {
    for (const o of file.offerings.filter((x) => x.catalogCode === null)) {
      expect(o.note, o.code).toBeTruthy();
    }
  });

  it("agrees with the catalog on credits, or says why not", () => {
    for (const o of file.offerings) {
      if (!o.catalogCode) continue;
      const known = getCourse(o.catalogCode);
      // A special topic runs at whatever weight the term gives it, so its
      // code carries no fixed value to disagree with.
      if (!known || /Special Topic/i.test(known.title)) continue;
      if (o.credits === known.credits) continue;
      // Anything else that diverges has to be a declared, explained case —
      // an undeclared one is far more likely to be a misread credits line.
      expect(o.note, `${o.code} ${o.title} runs at ${o.credits}, catalog says ${known.credits}`).toBeTruthy();
    }
  });

  it("keeps a course that opens a new page of the PDF", () => {
    // pdftotext puts a form feed in front of each page's first line, and
    // these three each open a page. They were silently dropped before.
    for (const code of ["HIST 355", "MATH 200", "PHIL 385A"]) {
      expect(file.offerings.some((o) => o.code === code), code).toBe(true);
    }
  });

  it("files each course under its own department, across page breaks", () => {
    const dept = (code: string) => file.offerings.find((o) => o.code === code)?.department;
    expect(dept("MATH 101")).toBe("Mathematics");
    expect(dept("PHYS 101")).toBe("Physics");
    expect(dept("LITR 210")).toBe("Literature");
  });

  it("runs Leo Strauss as a philosophy special topic, not Great Philosophers", () => {
    // Listed as PHIL 410 in the September descriptions, renumbered in October.
    const o = file.offerings.find((x) => x.code === "PHIL 380B");
    expect(o?.catalogCode).toBe("PHIL 380");
    expect(o?.credits).toBe(1.5);
    expect(file.offerings.some((x) => x.code === "PHIL 410")).toBe(false);
  });
});
