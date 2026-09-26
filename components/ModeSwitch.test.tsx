import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModeSwitch } from "./ModeSwitch";
import { terms } from "@/lib/offerings";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("ModeSwitch", () => {
  it("selects Where I stand when no term is being planned", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms} planningTerm={null} defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(markup).toMatch(/aria-selected="true"[^>]*>Where I stand</);
    expect(markup).toMatch(/aria-selected="false"[^>]*>Plan a term</);
  });

  it("selects Plan a term and the term being planned", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms} planningTerm="dterm-2627" defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(markup).toMatch(/aria-selected="true"[^>]*>Plan a term</);
    expect(markup).toContain('<option value="dterm-2627" selected="">D-Term 26/27</option>');
    expect(text(markup)).toContain("Winter 26/27");
  });

  it("names the only term instead of offering a choice of one", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms.slice(0, 1)} planningTerm={null} defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(text(markup)).toContain("Plan Winter 26/27");
    expect(markup).not.toContain("<select");
  });

  it("renders nothing when no term is on file", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={[]} planningTerm={null} defaultTerm="" onChange={noop} />,
    );
    expect(markup).toBe("");
  });
});
