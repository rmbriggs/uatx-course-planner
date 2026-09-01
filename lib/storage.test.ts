import { describe, expect, it } from "vitest";
import { decodeState, emptyState, encodeState } from "./storage";
import type { SavedState } from "./storage";

const base: SavedState = { ...emptyState, taken: [{ code: "MATH 210", status: "completed", credits: 3 }] };

describe("shared links", () => {
  it("carries both tiers of a target through a round trip", () => {
    const link = encodeState({ ...base, targets: { philosophy: "committed", history: "considering" } });
    expect(decodeState(link)!.targets).toEqual({ philosophy: "committed", history: "considering" });
  });

  it("reads a link from before the tiers existed as committed", () => {
    // Those links wrote bare ids, when a target was a single yes-or-no.
    expect(decodeState("c=MATH210:3:c&f=philosophy.history")!.targets).toEqual({
      philosophy: "committed",
      history: "committed",
    });
  });

  it("leaves the parameter out when nothing is targeted", () => {
    expect(encodeState(base)).not.toContain("f=");
    expect(decodeState(encodeState(base))!.targets).toEqual({});
  });

  it("keeps a Center and a concentration apart in one key space", () => {
    const targets = { "center-science-technology-engineering-and-mathematics": "committed" as const };
    expect(decodeState(encodeState({ ...base, targets }))!.targets).toEqual(targets);
  });
});
