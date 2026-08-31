"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Meridian } from "@/components/Meridian";
import { RecordPanel } from "@/components/RecordPanel";
import { ConcentrationDetail, GroupBlock } from "@/components/Requirements";
import { auditDegree, pacing, suggestNextCourses } from "@/lib/audit";
import { requirements } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import { decodeState, emptyState, encodeState, loadLocal, saveLocal, type SavedState } from "@/lib/storage";
import type { TakenCourse } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<SavedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showIf, setShowIf] = useState(false);
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
    (taken: TakenCourse[]) => {
      update({ taken });
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
              setTaken(
                state.taken.map((c, n) =>
                  n === i ? { ...c, status: c.status === "completed" ? "in-progress" : "completed" } : c,
                ),
              )
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
                  <button type="button" className="btn" onClick={() => setShowIf(!showIf)} aria-expanded={showIf}>
                    {showIf ? "Hide the detail" : "Show the detail"}
                  </button>
                </div>

                <div className="note">
                  <strong>Liberal Studies Major</strong> — {fmt(audit.major.creditsEarned)}/{audit.major.creditsRequired}{" "}
                  credits outside Foundations and Polaris.{" "}
                  {audit.major.rules
                    .map((r) => `${r.label}: ${fmt(r.earned)}/${r.minCredits}`)
                    .join(" · ")}
                  . {audit.major.note}
                </div>
                <div className="note">
                  <strong>Polaris</strong> — {fmt(audit.polaris.creditsEarned)}/{audit.polaris.creditsRequired} credits.
                  Build: {fmt(audit.polaris.buildCreditsEarned)}/{audit.polaris.buildCreditsRequired}
                  {audit.polaris.equivalentCreditsUsed > 0
                    ? `, of which ${fmt(audit.polaris.equivalentCreditsUsed)} are Build equivalents (cap ${audit.polaris.equivalentCap}).`
                    : "."}{" "}
                  {audit.polaris.required.map((s) => `${s.label}: ${s.filled ? "done" : "still to take"}`).join(" · ")}.
                </div>
                {audit.intellectualFoundations.legacyProvision.applies && (
                  <div className="note">
                    You have the complete old Intellectual Foundations.{" "}
                    {audit.intellectualFoundations.legacyProvision.note} That leaves{" "}
                    {audit.intellectualFoundations.legacyProvision.additionalCredits} credits.
                  </div>
                )}

                {showIf && (
                  <div className="detail" style={{ marginTop: "0.8rem" }}>
                    <h3 style={{ fontSize: "1.35rem", marginBottom: "0.3rem" }}>Intellectual Foundations</h3>
                    <p style={{ margin: "0 0 0.6rem", color: "var(--slate)", fontSize: "0.85rem" }}>
                      {fmt(audit.intellectualFoundations.creditsEarned)}/
                      {audit.intellectualFoundations.creditsRequired} credits.
                    </p>
                    {audit.intellectualFoundations.groups.map((g) => (
                      <GroupBlock key={g.id} group={g} />
                    ))}
                  </div>
                )}
              </section>

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
