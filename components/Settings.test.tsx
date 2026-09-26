import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Settings } from "./Settings";
import { auditDegree, pacing } from "@/lib/audit";
import type { ProgramId } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const render = (program: ProgramId) =>
  renderToStaticMarkup(
    <Settings
      program={program}
      onProgram={noop}
      termsRemaining={6}
      onTermsRemaining={noop}
      pace={pacing(auditDegree([{ code: "WRIT 120", credits: 3, status: "completed" }]), 6)}
      useInferred
      onUseInferred={noop}
      inferredCount={2}
    />,
  );

describe("Settings", () => {
  it("gathers catalog, terms left and equivalencies in one menu", () => {
    const out = text(render("2026-2027"));
    expect(out).toContain("Settings");
    expect(out).toContain("Catalog");
    expect(out).toContain("Terms left before you graduate");
    expect(out).toContain("Use proposed equivalencies");
    expect(out).toContain("2 of your courses rely on one");
  });

  it("presses the catalog in force", () => {
    const markup = render("2024-2025");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>[^<]*2024/);
    expect(text(markup)).toContain("The 2024-2025 requirements are written in the course codes you took");
  });

  it("states the pace the terms left imply", () => {
    expect(text(render("2026-2027"))).toMatch(/\d+ credits left, so [\d.]+ a term/);
  });
});
