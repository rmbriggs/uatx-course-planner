"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Meridian } from "@/components/Meridian";
import { RecordPanel } from "@/components/RecordPanel";
import { ConcentrationDetail, PillarBlock } from "@/components/Requirements";
import { auditDegree, pacing, suggestNextCourses } from "@/lib/audit";
import { requirements } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import { decodeState, emptyState, encodeState, loadLocal, saveLocal, type SavedState } from "@/lib/storage";
import type { CourseStatus, TakenCourse } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<SavedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // A shared link wins over whatever this browser had saved, so a link always
  // shows the sender's plan.
  useEffect(() => {
    const fromLink = window.location.search ? decodeState(window.location.search) : null;
    setState(fromLink ?? loadLocal() ?? emptyState);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveLocal(state);
  }, [state, ready]);

  const update = useCallback((patch: Partial<SavedState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setTaken = useCallback(
    (taken: TakenCourse[], meta?: { csa?: number }) => {
      update(meta && meta.csa !== undefined ? { taken, csa: meta.csa } : { taken });
    },
    [update],
  );

  const audit = useMemo(
    () => auditDegree(state.taken, { useInferred: state.useInferred }),
    [state.taken, state.useInferred],
  );

  const ranked = useMemo(
    () => [...audit.concentrations].sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name)),
    [audit],
  );

  const next = useMemo(
    () => suggestNextCourses(audit, state.focus, 10),
    [audit, state.focus],
  );

  const pace = pacing(audit, state.termsRemaining);
  const mappings = mappedGrants(audit.normalization);
  const inferredCount = mappings.filter((m) => m.via === "inferred").length;
  const hasCourses = state.taken.length > 0;

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <h1>UATX Degree Audit</h1>
          <p className="sub">
            Bachelor of Arts in Liberal Studies, {requirements.program} catalog. Old-catalog courses count through the
            published equivalencies.
          </p>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?${encodeState(state)}`;
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                window.prompt("Copy this link", url);
              }
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
            disabled={!hasCourses}
          >
            {copied ? "Link copied" : "Copy a link to this plan"}
          </button>
        </div>
      </header>

      <Meridian audit={audit} termsRemaining={state.termsRemaining} />

      <div className="columns">
        <aside>
          <RecordPanel
            taken={state.taken}
            onReplace={setTaken}
            onAdd={(course) => setTaken([...state.taken, course])}
            onRemove={(i) => setTaken(state.taken.filter((_, n) => n !== i))}
            onToggleStatus={(i) =>
              setTaken(state.taken.map((c, n) => (n === i ? { ...c, status: nextStatus(c.status) } : c)))
            }
          />

          <div className="panel" style={{ marginTop: "1rem" }}>
            <div className="panel-body">
              <p className="eyebrow">Planning</p>
              <div className="field-row">
                <label htmlFor="terms">Terms left before you graduate</label>
                <input
                  id="terms"
                  type="number"
                  min={1}
                  max={20}
                  value={state.termsRemaining}
                  onChange={(e) => update({ termsRemaining: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <p style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: "var(--slate)" }}>
                {pace.creditsRemaining} credits left, so {fmt(pace.creditsPerTerm)} a term
                {pace.creditsPerTerm > pace.typicalLoad
                  ? " — heavier than the normal 15-credit load."
                  : " — within the normal 15-credit load."}
              </p>

              <label className="switch" style={{ marginTop: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={state.useInferred}
                  onChange={(e) => update({ useInferred: e.target.checked })}
                />
                Use provisional mappings
              </label>
              <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem", color: "var(--slate-light)" }}>
                Four mappings the two catalogs imply but the equivalency document does not state.
                {inferredCount > 0 ? ` ${inferredCount} of your courses rely on one.` : ""}
              </p>
            </div>
          </div>
        </aside>

        <div>
          {!hasCourses ? (
            <div className="empty">
              <h2>Add your courses to see where you stand</h2>
              <p style={{ maxWidth: "32rem", margin: "0 auto" }}>
                Upload your UATX transcript and every course is read, mapped through the old-catalog equivalencies, and
                measured against all eight concentrations at once.
              </p>
            </div>
          ) : (
            <>
              <section className="section">
                <div className="section-head">
                  <h2>Where you stand</h2>
                  <span className="aside">36 credits each · sorted by how close you are</span>
                </div>
                <div className="conc-grid">
                  {ranked.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="conc"
                      data-open={open === c.id}
                      aria-expanded={open === c.id}
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                    >
                      <div className="conc-top">
                        <span className="conc-name">{c.name}</span>
                        <span className="conc-pct" data-zero={c.percent === 0}>{c.percent}%</span>
                      </div>
                      <div className="bar">
                        <i className="earned" style={{ width: `${(c.creditsEarned / c.creditsRequired) * 100}%` }} />
                        <i className="progress" style={{ width: `${(c.creditsInProgress / c.creditsRequired) * 100}%` }} />
                      </div>
                      <div className="conc-meta">
                        <span className="mono">
                          {fmt(c.creditsEarned)}/{c.creditsRequired} cr
                        </span>
                        <span>
                          {c.satisfied
                            ? "Complete"
                            : `${c.remainingCourseCount} ${c.remainingCourseCount === 1 ? "course" : "courses"} left`}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {open && <ConcentrationDetail conc={ranked.find((c) => c.id === open)!} />}
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>What to take next</h2>
                  <span className="aside">Ranked by how many open requirements each one closes</span>
                </div>
                <div className="btn-row" style={{ marginBottom: "0.7rem" }}>
                  {ranked.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn"
                      aria-pressed={state.focus.includes(c.id)}
                      onClick={() =>
                        update({
                          focus: state.focus.includes(c.id)
                            ? state.focus.filter((f) => f !== c.id)
                            : [...state.focus, c.id],
                        })
                      }
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
                {next.length === 0 ? (
                  <p className="note">Nothing left to suggest — every requirement you are tracking is met.</p>
                ) : (
                  <table className="next-table">
                    <thead>
                      <tr>
                        <th style={{ width: "6rem" }}>Course</th>
                        <th>Title</th>
                        <th style={{ width: "4rem" }}>Credits</th>
                        <th>Counts toward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {next.map((c) => (
                        <tr key={c.code}>
                          <td className="mono">{c.code}</td>
                          <td>{c.title}</td>
                          <td className="mono">{c.credits}</td>
                          <td className="why">{c.forWhat.slice(0, 3).join("; ")}
                            {c.forWhat.length > 3 ? ` +${c.forWhat.length - 3} more` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>Degree requirements</h2>
                  <span className="aside">180 credits across three pillars</span>
                </div>

                <PillarBlock
                  name="Intellectual Foundations"
                  creditsEarned={audit.intellectualFoundations.creditsEarned}
                  creditsRequired={audit.intellectualFoundations.creditsRequired}
                  creditsInProgress={audit.intellectualFoundations.creditsInProgress}
                  groups={audit.intellectualFoundations.groups}
                  counted={audit.intellectualFoundations.countedCourses}
                >
                  {audit.intellectualFoundations.legacyProvision.applies && (
                    <p className="note" style={{ margin: "0.7rem 0 0" }}>
                      You have the complete old Intellectual Foundations.{" "}
                      {audit.intellectualFoundations.legacyProvision.note} That leaves{" "}
                      {audit.intellectualFoundations.legacyProvision.additionalCredits} credits.
                    </p>
                  )}
                </PillarBlock>

                <PillarBlock
                  name="Liberal Studies Major"
                  creditsEarned={audit.major.creditsEarned}
                  creditsRequired={audit.major.creditsRequired}
                  creditsInProgress={audit.major.creditsInProgress}
                  counted={audit.major.countedCourses}
                >
                  <p className="group-note" style={{ marginTop: "0.7rem" }}>
                    Credits outside Foundations and Polaris. {audit.major.note}
                  </p>
                  {audit.major.rules.map((r) => (
                    <div key={r.id} className={`slot-row is-${r.satisfied ? "done" : r.inProgress > 0 ? "pending" : "open"}`}>
                      <span className="tick">{r.satisfied ? "●" : r.inProgress > 0 ? "◐" : "○"}</span>
                      <span className="slot-body">
                        <span className="slot-label">{r.label}</span>
                        <span className="slot-codes mono">
                          {fmt(r.earned)}/{r.minCredits} credits
                          {r.inProgress > 0 && <span className="pending-note"> +{fmt(r.inProgress)} under way</span>}
                        </span>
                      </span>
                    </div>
                  ))}
                </PillarBlock>

                <PillarBlock
                  name="Polaris"
                  creditsEarned={audit.polaris.creditsEarned}
                  creditsRequired={audit.polaris.creditsRequired}
                  creditsInProgress={audit.polaris.creditsInProgress}
                  counted={audit.polaris.countedCourses}
                >
                  <div style={{ marginTop: "0.7rem" }}>
                    {audit.polaris.required.map((s, i) => (
                      <div key={i} className={`slot-row is-${s.filled ? (s.pendingOnly ? "pending" : "done") : "open"}`}>
                        <span className="tick">{s.filled ? (s.pendingOnly ? "◐" : "●") : "○"}</span>
                        <span className="slot-body">
                          <span className="slot-label">{s.label}</span>
                          <span className="slot-codes">
                            <span className="mono">{s.options.flat().join(" or ")}</span>
                            {s.filledBy.some((f) => f.source !== f.requirement) && (
                              <span className="slot-source">
                                {" "}from your{" "}
                                <span className="mono">
                                  {[...new Set(s.filledBy.filter((f) => f.source !== f.requirement).map((f) => f.source))].join(", ")}
                                </span>
                              </span>
                            )}
                          </span>
                        </span>
                      </div>
                    ))}
                    <div className={`slot-row is-${audit.polaris.buildCreditsEarned >= audit.polaris.buildCreditsRequired ? "done" : "open"}`}>
                      <span className="tick">
                        {audit.polaris.buildCreditsEarned >= audit.polaris.buildCreditsRequired ? "●" : "○"}
                      </span>
                      <span className="slot-body">
                        <span className="slot-label">Polaris Build</span>
                        <span className="slot-codes mono">
                          {fmt(audit.polaris.buildCreditsEarned)}/{audit.polaris.buildCreditsRequired} credits
                          {audit.polaris.equivalentCreditsUsed > 0 &&
                            ` · ${fmt(audit.polaris.equivalentCreditsUsed)} from Build equivalents, cap ${audit.polaris.equivalentCap}`}
                        </span>
                      </span>
                    </div>
                  </div>
                  <p className="group-note" style={{ marginTop: "0.6rem" }}>
                    {audit.polaris.note}
                  </p>
                </PillarBlock>

                <div className="note" style={{ marginTop: "0.8rem" }}>
                  <strong>Course Score Average</strong> —{" "}
                  {state.csa === undefined
                    ? `graduation needs a cumulative CSA of at least ${requirements.grading.minimumCsa}. Upload a transcript and yours is read automatically.`
                    : state.csa >= requirements.grading.minimumCsa
                      ? `yours is ${state.csa}, above the ${requirements.grading.minimumCsa} needed to graduate.`
                      : `yours is ${state.csa}, below the ${requirements.grading.minimumCsa} needed to graduate.`}
                </div>
              </section>

              {audit.excluded.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>Not counting toward your degree</h2>
                    <span className="aside">
                      {fmt(audit.excluded.reduce((n, h) => n + h.credits, 0))} credits attempted, none earned
                    </span>
                  </div>
                  <ul className="excluded-list">
                    {audit.excluded.map((h, i) => (
                      <li key={`${h.code}-${i}`}>
                        <span className="mono">{h.code}</span>
                        <span style={{ color: "var(--slate)" }}>{h.title}</span>
                        <span className={`mark ${h.status === "failed" ? "mark-failed" : "mark-neutral"}`}>
                          {statusLabel(h.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {audit.retakeNeeded.length > 0 && (
                    <p className="note note-warn" style={{ marginTop: "0.7rem" }}>
                      {requirements.grading.retake} These are not filling any requirement above.
                    </p>
                  )}
                </section>
              )}

              {mappings.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>How your old courses were counted</h2>
                    <span className="aside">{mappings.length} mapped</span>
                  </div>
                  <table className="next-table">
                    <thead>
                      <tr>
                        <th style={{ width: "13rem" }}>Your course</th>
                        <th style={{ width: "10rem" }}>Counted as</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m) => (
                        <tr key={`${m.from}-${m.to.join()}`}>
                          <td>
                            <span className="mono">{m.from}</span>
                            <br />
                            <span style={{ color: "var(--slate-light)", fontSize: "0.76rem" }}>{m.title}</span>
                          </td>
                          <td className="mono">
                            {m.to.join(", ") || "elective credit"}
                            {m.via === "inferred" && (
                              <>
                                <br />
                                <span className="mark mark-inferred">Provisional</span>
                              </>
                            )}
                          </td>
                          <td className="why">{m.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {audit.normalization.unmapped.length > 0 && (
                    <p className="note" style={{ marginTop: "0.7rem" }}>
                      No published equivalent for{" "}
                      <span className="mono">{audit.normalization.unmapped.map((u) => u.code).join(", ")}</span>. These
                      still count as elective credit toward the 180.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          Built from the {requirements.source} and the UATX course equivalency tables. This is a study aid, not an
          official audit — confirm anything that matters with your advisor.
        </p>
      </footer>
    </main>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Cycle the three statuses someone would set by hand. */
function nextStatus(status: CourseStatus): CourseStatus {
  if (status === "completed") return "in-progress";
  if (status === "in-progress") return "failed";
  return "completed";
}

function statusLabel(status: string) {
  switch (status) {
    case "failed":
      return "Failed - retake";
    case "withdrawn":
      return "Withdrawn";
    case "audit":
      return "Audited";
    case "incomplete":
      return "Incomplete";
    default:
      return status;
  }
}
