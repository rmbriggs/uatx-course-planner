import { describe, expect, it } from "vitest";
import {
  findOffering,
  knownTerm,
  offeredCatalogCodes,
  offeredTerms,
  offeringKey,
  offeringsFor,
  searchTerm,
  terms,
} from "./offerings";

describe("offerings", () => {
  it("lists the terms nearest first", () => {
    expect(terms.map((t) => t.id)).toEqual(["winter-2627", "dterm-2627"]);
  });

  it("returns a term's own offerings", () => {
    expect(offeringsFor("winter-2627")).toHaveLength(58);
    expect(offeringsFor("dterm-2627")).toHaveLength(5);
    expect(offeringsFor("nope")).toHaveLength(0);
  });

  it("maps a lettered special topic onto the code requirements use", () => {
    const o = findOffering("winter-2627", "PHIL 380A");
    expect(o?.catalogCode).toBe("PHIL 380");
  });

  it("leaves an uncatalogued offering without a catalog code", () => {
    expect(findOffering("dterm-2627", "LEAD 380A")?.catalogCode).toBeNull();
  });

  it("collects the catalog codes a term can fill", () => {
    const codes = offeredCatalogCodes("winter-2627");
    expect(codes.has("PHIL 220")).toBe(true);
    expect(codes.has("PHIL 380")).toBe(true);
    // Offered in D-Term, not Winter.
    expect(codes.has("POLR 210")).toBe(false);
    // Uncatalogued offerings contribute nothing to fill.
    expect([...codes].every((c) => c.length > 0)).toBe(true);
  });

  it("keys an offering by term and code", () => {
    expect(offeringKey("winter-2627", "PHIL 220")).toBe("winter-2627:PHIL 220");
    expect(offeringKey("winter-2627", "phil220")).toBe("winter-2627:PHIL 220");
  });
});

describe("offeredTerms", () => {
  it("names the term that runs a course", () => {
    expect(offeredTerms("PHIL 220").map((t) => t.name)).toEqual(["Winter 26/27"]);
  });

  it("answers for a special topic under its base code", () => {
    // The term prints PHIL 380A; a requirement is written in PHIL 380.
    expect(offeredTerms("PHIL 380").map((t) => t.id)).toEqual(["winter-2627"]);
    expect(offeredTerms("PHIL 380A").map((t) => t.id)).toEqual(["winter-2627"]);
  });

  it("lists both terms when both run it, soonest first", () => {
    // WRIT 385 runs as 385B in Winter and 385A in D-Term.
    expect(offeredTerms("WRIT 385").map((t) => t.id)).toEqual(["winter-2627", "dterm-2627"]);
  });

  it("says nothing about a course no term on file runs", () => {
    // The Hebrew Bible is in the catalog but neither term runs it.
    expect(offeredTerms("HIST 310")).toEqual([]);
  });

  it("shrugs at a code that does not exist", () => {
    expect(offeredTerms("ZZZZ 999")).toEqual([]);
  });
});

describe("searchTerm", () => {
  it("finds a course by code, with or without the space", () => {
    expect(searchTerm("winter-2627", "PHIL 220").offered.map((o) => o.code)).toContain("PHIL 220");
    expect(searchTerm("winter-2627", "phil220").offered.map((o) => o.code)).toContain("PHIL 220");
  });

  it("finds a special topic by its base code", () => {
    expect(searchTerm("winter-2627", "phil 380").offered.map((o) => o.code)).toContain("PHIL 380A");
  });

  it("finds a course by a word in its title, ignoring case", () => {
    expect(searchTerm("winter-2627", "linear algebra").offered.map((o) => o.code)).toEqual(
      expect.arrayContaining(["MATH 210", "MATH 320"]),
    );
  });

  it("finds a course by who teaches it", () => {
    const codes = searchTerm("winter-2627", "scheall").offered.map((o) => o.code);
    expect(codes).toEqual(expect.arrayContaining(["AMCV 365", "AMCV 415"]));
  });

  it("only offers the term's own courses as plannable", () => {
    // POLR 210 runs in D-Term, not Winter.
    expect(searchTerm("winter-2627", "vibecoding").offered).toEqual([]);
    expect(searchTerm("dterm-2627", "vibecoding").offered.map((o) => o.code)).toEqual(["POLR 210"]);
  });

  it("says where a catalog course is when this term does not run it", () => {
    const out = searchTerm("winter-2627", "hebrew bible");
    expect(out.offered).toEqual([]);
    const hit = out.elsewhere.find((e) => e.course.code === "HIST 310");
    expect(hit).toBeDefined();
    expect(hit!.terms).toEqual([]);
  });

  it("points at the other term when that one runs it", () => {
    const hit = searchTerm("winter-2627", "vibecoding").elsewhere.find((e) => e.course.code === "POLR 210");
    expect(hit?.terms.map((t) => t.id)).toEqual(["dterm-2627"]);
  });

  it("does not repeat an offered course among the ones that are not", () => {
    const out = searchTerm("winter-2627", "phil 380");
    expect(out.elsewhere.map((e) => e.course.code)).not.toContain("PHIL 380");
  });

  it("returns nothing for a query too short to mean anything", () => {
    expect(searchTerm("winter-2627", "p")).toEqual({ offered: [], elsewhere: [] });
    expect(searchTerm("winter-2627", "  ")).toEqual({ offered: [], elsewhere: [] });
  });
});

describe("knownTerm", () => {
  it("keeps a term that is on file", () => {
    expect(knownTerm("winter-2627")).toBe("winter-2627");
  });

  it("drops a term that is no longer on file, so the page opens on where you stand", () => {
    expect(knownTerm("spring-2526")).toBeNull();
    expect(knownTerm(null)).toBeNull();
    expect(knownTerm(undefined)).toBeNull();
  });
});
