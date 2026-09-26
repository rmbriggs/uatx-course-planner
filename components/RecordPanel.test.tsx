import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordPanel } from "./RecordPanel";
import type { TakenCourse } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const taken: TakenCourse[] = [
  { code: "WRIT 120", credits: 3, status: "completed", grade: "88", term: "Fall 2025" },
  { code: "MATH 101", credits: 3, status: "withdrawn", grade: "W", term: "Fall 2025" },
];

const markup = renderToStaticMarkup(
  <RecordPanel
    taken={taken}
    onReplace={noop}
    onAdd={noop}
    onRemove={noop}
    onSetStatus={noop}
    build={{ log: [{ credits: 1.5, status: "completed" }], onAdd: noop, onRemove: noop, onToggle: noop, alsoOnTranscript: false }}
  />,
);

describe("RecordPanel", () => {
  it("says what the search tab does", () => {
    expect(text(markup)).toContain("Add a course you’ve taken");
  });

  it("sets a course's status from a select, not by clicking its label", () => {
    expect(markup).toContain('aria-label="How WRIT 120 counts"');
    expect(markup).toContain('<option value="completed" selected="">Done</option>');
    expect(text(markup)).toContain("88");
  });

  it("keeps a transcript-only status instead of snapping to Done", () => {
    expect(markup).toContain('<option value="withdrawn" selected="">Withdrawn</option>');
  });

  it("carries the Build log, anchored so Progress can link to it", () => {
    expect(markup).toContain('id="build-log"');
    expect(text(markup)).toContain("Build log");
  });
});
