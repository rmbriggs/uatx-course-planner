"use client";

import type { ReactNode } from "react";
import { titleOf } from "@/lib/catalog";
import type { TermCoverage as Coverage } from "@/lib/plan";

/** "considering" is stored; Exploring is what the concentration button says. */
const INTEREST_LABEL = { committed: "Committed", considering: "Exploring" } as const;

/**
 * Requirement by requirement, what is still open in the concentrations you
 * are aiming at and what this term runs toward each. The suggestion table
 * ranks courses; this is the view for "do I still need upper-division work,
 * and can I get any of it now?" A requirement this term cannot help with
 * says so, which is as useful to know as what it can.
 */
export function TermCoverage({
  coverage,
  termName,
  aiming,
  planCell,
}: {
  coverage: Coverage[];
  termName: string;
  aiming: boolean;
  planCell: (code: string) => ReactNode;
}) {
  if (coverage.length === 0) return null;

  return (
    <section className="section">
      <div className="section-head">
        <h2>Your concentration{coverage.length > 1 ? "s" : ""} in {termName}</h2>
        <span className="aside">
          {aiming
            ? "What is still open, and what this term runs for it"
            : "The concentration you are closest to. Mark one Committed or Exploring to choose"}
        </span>
      </div>

      {coverage.map((c) => (
        <div key={c.id} className="coverage">
          <div className="group-head">
            <span className="group-name">
              {c.name}
              {c.interest && (
                <span className="tier-chip" data-tier={c.interest}>
                  {INTEREST_LABEL[c.interest]}
                </span>
              )}
            </span>
            <span className="group-count mono">{c.percent}%</span>
          </div>

          {c.gaps.length === 0 ? (
            <p className="group-note">Nothing left open here once this term begins.</p>
          ) : (
            <div className="coverage-gaps">
              {c.gaps.map((g) => (
                <div key={g.group} className="coverage-gap">
                  <div className="coverage-gap-head">
                    <span className="slot-label">{g.group}</span>
                    <span className="mono group-count">
                      {g.remaining} {g.unit === "credits" ? "cr" : g.remaining === 1 ? "course" : "courses"} to go
                    </span>
                  </div>
                  {g.offered.length === 0 ? (
                    <p className="group-note">Nothing {termName} runs fills this.</p>
                  ) : (
                    <ul className="course-list">
                      {g.offered.map((o) => (
                        <li key={o.code} className="coverage-course">
                          <span className="mono course-code">{o.code}</span>
                          <span className="course-name">
                            {o.code.split(" + ").map(titleOf).join(" + ")}
                            {o.pool && <span className="group-note"> ({o.pool})</span>}
                          </span>
                          {!o.code.includes(" + ") && planCell(o.code)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
