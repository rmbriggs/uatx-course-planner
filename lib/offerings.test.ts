import { describe, expect, it } from "vitest";
import {
  findOffering,
  offeredCatalogCodes,
  offeredTerms,
  offeringKey,
  offeringsFor,
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
