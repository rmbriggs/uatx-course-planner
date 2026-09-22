import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OfferedChip } from "./OfferedChip";

const render = (code: string) => renderToStaticMarkup(<OfferedChip code={code} />);
/** Just what a reader sees, with attributes like the tooltip left out. */
const visible = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();

describe("OfferedChip", () => {
  it("names the term a course runs in, without the year", () => {
    // The year belongs in the tooltip, not on the chip itself.
    expect(visible(render("PHIL 220"))).toBe("Winter");
  });

  it("spells the year out in the tooltip", () => {
    expect(render("PHIL 220")).toContain('title="Offered Winter 26/27"');
  });

  it("names both terms when both run it", () => {
    const out = render("WRIT 385");
    expect(visible(out)).toBe("Winter · D-Term");
    expect(out).toContain('title="Offered Winter 26/27 and D-Term 26/27"');
  });

  it("renders nothing for a course no term runs", () => {
    // The Hebrew Bible is in the catalog; neither term on file offers it.
    expect(render("HIST 310")).toBe("");
    expect(render("ZZZZ 999")).toBe("");
  });

  it("marks a special topic by the code a requirement names", () => {
    expect(render("PHIL 380")).toContain("Winter");
  });
});
