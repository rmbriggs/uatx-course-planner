"use client";

import type { pacing } from "@/lib/audit";
import { PROGRAMS } from "@/lib/catalog";
import type { ProgramId } from "@/lib/types";

/**
 * The three things that change how the audit is measured, kept together.
 * They used to sit in the header, the sidebar and below a dropdown, which
 * made them hard to find and harder to tell apart from the record itself.
 */
export function Settings({
  program,
  onProgram,
  termsRemaining,
  onTermsRemaining,
  pace,
  useInferred,
  onUseInferred,
  inferredCount,
}: {
  program: ProgramId;
  onProgram: (program: ProgramId) => void;
  termsRemaining: number;
  onTermsRemaining: (terms: number) => void;
  pace: ReturnType<typeof pacing>;
  useInferred: boolean;
  onUseInferred: (on: boolean) => void;
  inferredCount: number;
}) {
  const relying = inferredCount > 0 ? ` ${inferredCount} of your courses rely on one.` : "";

  return (
    <details className="settings">
      <summary className="btn">Settings</summary>
      <div className="settings-body panel">
        <div className="panel-body">
          <p className="eyebrow">Catalog</p>
          <div className="segmented" role="group" aria-label="Which catalog to measure against">
            {PROGRAMS.map((prog) => (
              <button
                key={prog.id}
                type="button"
                className="segment"
                aria-pressed={program === prog.id}
                title={prog.blurb}
                onClick={() => onProgram(prog.id)}
              >
                {prog.label}
              </button>
            ))}
          </div>

          <div className="field-row" style={{ marginTop: "1rem" }}>
            <label htmlFor="terms">Terms left before you graduate</label>
            <input
              id="terms"
              type="number"
              min={1}
              max={20}
              value={termsRemaining}
              onChange={(e) => onTermsRemaining(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <p className="settings-note">
            {pace.creditsRemaining} credits left, so {fmt(pace.creditsPerTerm)} a term
            {pace.creditsPerTerm > pace.typicalLoad
              ? " — heavier than the normal 15-credit load."
              : " — within the normal 15-credit load."}
          </p>

          <label className="switch" style={{ marginTop: "1rem" }}>
            <input type="checkbox" checked={useInferred} onChange={(e) => onUseInferred(e.target.checked)} />
            Use proposed equivalencies
          </label>
          <p className="settings-note">
            {program === "2024-2025"
              ? "The 2024-2025 requirements are written in the course codes you took, so the old-to-new equivalencies are not applied. The proposals here are the ones that hold inside the old catalog, between a special-topics number and the course whose content it delivered."
              : "The equivalency document has no table for INF courses, so these are read from the two catalogs’ own course descriptions. Each says why on the mapping table under Record details."}
            {relying}
          </p>
        </div>
      </div>
    </details>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
