"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Meridian } from "@/components/Meridian";
import { RecordPanel } from "@/components/RecordPanel";
import { CenterDetail, ConcentrationDetail, PillarBlock } from "@/components/Requirements";
import { auditDegree, pacing, suggestNextCourses, type SuggestionTier } from "@/lib/audit";
import { getRequirements, grading, PROGRAMS } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import { decodeState, emptyState, encodeState, loadLocal, saveLocal, type SavedState } from "@/lib/storage";
import type { CourseStatus, Interest, TakenCourse } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<SavedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [openCenter, setOpenCenter] = useState<string | null>(null);
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

  const requirements = getRequirements(state.program);
  const isLegacyProgram = state.program === "2024-2025";

  const audit = useMemo(
    () => auditDegree(state.taken, { useInferred: state.useInferred, program: state.program }),
    [state.taken, state.useInferred, state.program],
  );

  // What the student is aiming at floats to the top of every grid; within a
  // tier the closest to done leads.
  const byInterest = useCallback(
    (a: { id: string; percent: number; name: string }, b: { id: string; percent: number; name: string }) =>
      INTEREST_ORDER[state.targets[a.id] ?? "none"] - INTEREST_ORDER[state.targets[b.id] ?? "none"] ||
      b.percent - a.percent ||
      a.name.localeCompare(b.name),
    [state.targets],
  );

  const ranked = useMemo(() => [...audit.concentrations].sort(byInterest), [audit, byInterest]);
  const centers = useMemo(() => [...audit.centers].sort(byInterest), [audit, byInterest]);

  // The 2024-2025 program requires electing a Center, so its concentrations are
  // grouped by the Center that offers them rather than shown as a flat list.
  const byCenter = useMemo(() => {
    const map = new Map<string, typeof ranked>();
    for (const c of ranked) {
      const list = map.get(c.center) ?? [];
      list.push(c);
      map.set(c.center, list);
    }
    return [...map.entries()];
  }, [ranked]);

  const next = useMemo(() => suggestNextCourses(audit, state.targets, 10), [audit, state.targets]);

  /** Pressing the tier a target already has clears it. */
  const setTarget = useCallback((id: string, tier: Interest) => {
    setState((prev) => {
      const targets = { ...prev.targets };
      if (targets[id] === tier) delete targets[id];
      else targets[id] = tier;
      return { ...prev, targets };
    });
  }, []);

  const aimingCount = Object.keys(state.targets).length;

  const aiming = useMemo(() => {
    const named = (tier: Interest) =>
      [...audit.centers, ...audit.concentrations].filter((x) => state.targets[x.id] === tier).map((x) => x.name);
    return { committed: named("committed"), considering: named("considering") };
  }, [audit, state.targets]);

  const targetStrip = (id: string) => (
    <div className="target-row" role="group" aria-label="How seriously you are pursuing this">
      {(["committed", "considering"] as Interest[]).map((tier) => (
        <button
          key={tier}
          type="button"
          className="target-btn"
          data-tier={tier}
          aria-pressed={state.targets[id] === tier}
          onClick={() => setTarget(id, tier)}
        >
          {tier === "committed" ? "Committed" : "Considering"}
        </button>
      ))}
    </div>
  );

  const renderCard = (c: (typeof ranked)[number]) => (
    <div key={c.id} className="conc-cell" data-tier={state.targets[c.id] ?? "none"}>
    <button
      type="button"
      className="conc"
      data-open={open === c.id}
      aria-expanded={open === c.id}
      onClick={() => setOpen(open === c.id ? null : c.id)}
    >
      <div className="conc-top">
        <span className="conc-name">{c.name}</span>
        <span className="conc-pct" data-zero={c.percent === 0}>
          {c.percent}%
        </span>
      </div>
      <div className="bar">
        <i className="earned" style={{ width: `${(c.creditsEarned / c.creditsRequired) * 100}%` }} />
        <i className="progress" style={{ width: `${(c.creditsInProgress / c.creditsRequired) * 100}%` }} />
      </div>
      <div className="conc-meta">
        <span className="mono">
          {fmt(c.creditsEarned)}/{c.creditsRequired} cr
        </span>
        <span>{c.satisfied ? "Complete" : remainingLabel(c)}</span>
      </div>
    </button>
      {targetStrip(c.id)}
    </div>
  );

  const renderCenterCard = (b: (typeof audit.centers)[number]) => (
    <div key={b.id} className="conc-cell" data-tier={state.targets[b.id] ?? "none"}>
    <button
      type="button"
      className="conc"
      data-open={openCenter === b.id}
      aria-expanded={openCenter === b.id}
      onClick={() => setOpenCenter(openCenter === b.id ? null : b.id)}
    >
      <div className="conc-top">
        <span className="conc-name">{b.name}</span>
        <span className="conc-pct" data-zero={b.percent === 0}>
          {b.percent}%
        </span>
      </div>
      <div className="bar">
        <i className="earned" style={{ width: `${(b.creditsEarned / b.creditsRequired) * 100}%` }} />
        <i className="progress" style={{ width: `${(b.creditsInProgress / b.creditsRequired) * 100}%` }} />
      </div>
      <div className="conc-meta">
        <span className="mono">
          {fmt(b.creditsEarned)}/{b.creditsRequired} cr
        </span>
        <span>{b.satisfied ? "Complete" : remainingLabel(b)}</span>
      </div>
      {b.note && <span className="conc-variant">as printed under {b.publishedUnder[0]}</span>}
    </button>
      {targetStrip(b.id)}
    </div>
  );

  // A block can ask for courses, for credits, or for both, and saying "courses"
  // for a credit total is simply wrong.
  const remainingLabel = (b: { remainingCourseCount: number; remainingCredits: number }) => {
    const parts: string[] = [];
    if (b.remainingCourseCount > 0)
      parts.push(`${b.remainingCourseCount} ${b.remainingCourseCount === 1 ? "course" : "courses"}`);
    if (b.remainingCredits > 0) parts.push(`${fmt(b.remainingCredits)} credits`);
    return parts.length ? `${parts.join(" + ")} left` : "Nothing left";
  };

  const pillarName = (id: string) => audit.pillars.find((p) => p.id === id)?.name ?? id;
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
            {isLegacyProgram
              ? "Bachelor of Arts in Liberal Studies, 2024-2025 catalog. Elect a Center, then complete its Foundations and Core."
              : "Bachelor of Arts in Liberal Studies, 2026-2027 catalog. Old-catalog courses count through the published equivalencies."}
          </p>
        </div>
        <div className="masthead-actions">
          <div className="segmented" role="group" aria-label="Which catalog to measure against">
            {PROGRAMS.map((prog) => (
              <button
                key={prog.id}
                type="button"
                className="segment"
                aria-pressed={state.program === prog.id}
                title={prog.blurb}
                onClick={() => update({ program: prog.id })}
              >
                {prog.label}
              </button>
            ))}
          </div>
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
                Use proposed equivalencies
              </label>
              {!isLegacyProgram ? (
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem", color: "var(--slate-light)" }}>
                  The equivalency document has no table for INF courses, so these are read from the two catalogs&rsquo;
                  own course descriptions. Each says why on the mapping table below.
                  {inferredCount > 0 ? ` ${inferredCount} of your courses rely on one.` : ""}
                </p>
              ) : (
                <p style={{ margin: "0.3rem 0 0", fontSize: "0.78rem", color: "var(--slate-light)" }}>
                  The 2024-2025 requirements are written in the course codes you took, so the old-to-new equivalencies
                  are not applied. The proposals here are the ones that hold inside the old catalog, between a
                  special-topics number and the course whose content it delivered.
                  {inferredCount > 0 ? ` ${inferredCount} of your courses rely on one.` : ""}
                </p>
              )}
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
              {audit.centers.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>Centers</h2>
                    <span className="aside">Foundations and Core of any one Center · 54 credits</span>
                  </div>
                  <p className="note" style={{ marginBottom: "0.7rem" }}>
                    To graduate you complete the Foundations and Core of a single Center. A concentration inside it is
                    optional: without one you take{" "}
                    {fmt(requirements.major.credits - (requirements.centers?.[0]?.credits ?? 54))} elective credits
                    instead of {requirements.electives?.credits ?? 24}.
                  </p>
                  <div className="conc-grid">{centers.map(renderCenterCard)}</div>
                  {openCenter && <CenterDetail center={audit.centers.find((b) => b.id === openCenter)!} />}
                </section>
              )}

              <section className="section">
                <div className="section-head">
                  <h2>{isLegacyProgram ? "Concentrations (optional)" : "Where you stand"}</h2>
                  <span className="aside">
                    {isLegacyProgram
                      ? "27 credits each, on top of the Center they sit in"
                      : aimingCount > 0
                        ? "36 credits each · what you are aiming at first"
                        : "36 credits each · sorted by how close you are"}
                  </span>
                </div>
                {isLegacyProgram && (
                  <p className="note" style={{ marginBottom: "0.7rem" }}>
                    These are the concentration&rsquo;s own courses only. The Foundations and Core of the Center each
                    one sits in are counted above, and together they come to the 81 credits the catalog declares.
                  </p>
                )}
                {isLegacyProgram ? (
                  byCenter.map(([center, list]) => (
                    <div key={center} className="center-block">
                      <p className="eyebrow center-name">Center for {center}</p>
                      <div className="conc-grid">{list.map(renderCard)}</div>
                    </div>
                  ))
                ) : (
                  <div className="conc-grid">{ranked.map(renderCard)}</div>
                )}
                {open && <ConcentrationDetail conc={ranked.find((c) => c.id === open)!} />}
              </section>

              <section className="section">
                <div className="section-head">
                  <h2>What to take next</h2>
                  <span className="aside">
                    {aimingCount > 0
                      ? "Weighted by what you are aiming at"
                      : "Ranked by how many open requirements each one closes"}
                  </span>
                </div>
                {aimingCount > 0 ? (
                  <p className="note aiming" style={{ marginBottom: "0.7rem" }}>
                    {aiming.committed.length > 0 && (
                      <span>
                        <span className="tier-chip" data-tier="committed">
                          Committed
                        </span>{" "}
                        {aiming.committed.join(", ")}.{" "}
                      </span>
                    )}
                    {aiming.considering.length > 0 && (
                      <span>
                        <span className="tier-chip" data-tier="considering">
                          Considering
                        </span>{" "}
                        {aiming.considering.join(", ")}.{" "}
                      </span>
                    )}
                    <button type="button" className="btn btn-quiet" onClick={() => update({ targets: {} })}>
                      Clear
                    </button>
                  </p>
                ) : (
                  <p className="note" style={{ marginBottom: "0.7rem" }}>
                    Every concentration counts equally here. Mark one Committed or Considering above and this list
                    follows it &mdash; committing also settles which Center&rsquo;s Core you need.
                  </p>
                )}
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
                          <td className="why">
                            <span className="tier-chip" data-tier={c.tier}>
                              {TIER_LABEL[c.tier]}
                            </span>{" "}
                            {c.forWhat.slice(0, 3).join("; ")}
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
                  name={pillarName("if")}
                  creditsEarned={audit.intellectualFoundations.creditsEarned}
                  creditsRequired={audit.intellectualFoundations.creditsRequired}
                  creditsInProgress={audit.intellectualFoundations.creditsInProgress}
                  adjustment={
                    audit.intellectualFoundations.creditsWaived > 0
                      ? `${fmt(audit.intellectualFoundations.creditsWaived)} waived, down from ${requirements.intellectualFoundations.credits}`
                      : undefined
                  }
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
                  name={pillarName("major")}
                  creditsEarned={audit.major.creditsEarned}
                  creditsRequired={audit.major.creditsRequired}
                  creditsInProgress={audit.major.creditsInProgress}
                  adjustment={
                    audit.major.creditsAdded > 0
                      ? `${fmt(audit.major.creditsAdded)} replacing waived requirements`
                      : undefined
                  }
                  counted={audit.major.countedCourses}
                >
                  <p className="group-note" style={{ marginTop: "0.7rem" }}>
                    {isLegacyProgram ? "" : "Credits outside Foundations and Polaris. "}
                    {audit.major.note}
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
                  name={pillarName("polaris")}
                  creditsEarned={audit.polaris.creditsEarned}
                  creditsRequired={audit.polaris.creditsRequired}
                  creditsInProgress={audit.polaris.creditsInProgress}
                  adjustment={
                    audit.polaris.creditsWaived > 0
                      ? `${fmt(audit.polaris.creditsWaived)} waived, down from ${requirements.polaris.credits}`
                      : undefined
                  }
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
                    ? `graduation needs a cumulative CSA of at least ${grading.minimumCsa}. Upload a transcript and yours is read automatically.`
                    : state.csa >= grading.minimumCsa
                      ? `yours is ${state.csa}, above the ${grading.minimumCsa} needed to graduate.`
                      : `yours is ${state.csa}, below the ${grading.minimumCsa} needed to graduate.`}
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
                      {grading.retake} These are not filling any requirement above.
                    </p>
                  )}
                </section>
              )}

              {audit.waived.courses.length > 0 && (
                <section className="section">
                  <div className="section-head">
                    <h2>Waived</h2>
                    <span className="aside">
                      {audit.waived.courses.length}{" "}
                      {audit.waived.courses.length === 1 ? "requirement" : "requirements"} ·{" "}
                      {fmt(audit.waived.creditsToReplace)} credits to replace
                    </span>
                  </div>
                  <ul className="excluded-list">
                    {audit.waived.courses.map((h, i) => (
                      <li key={`${h.code}-${i}`}>
                        <span className="mono">{h.code}</span>
                        <span style={{ color: "var(--slate)" }}>{h.title}</span>
                        <span className="mark mark-waived">Waived</span>
                      </li>
                    ))}
                  </ul>
                  <p className="note" style={{ marginTop: "0.7rem" }}>
                    These no longer show as required above. A waiver excuses the course, not its credits, so{" "}
                    {audit.waived.creditsToReplace > 0 ? (
                      <>
                        {fmt(audit.waived.creditsToReplace)} credits move into {pillarName("major")}, where you make
                        them up as electives. The degree still comes to {audit.totals.required}.
                      </>
                    ) : (
                      <>
                        the courses you take instead count as electives toward the same{" "}
                        {audit.totals.required}. No pillar total changes.
                      </>
                    )}
                  </p>
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
                                <span className="mark mark-inferred">Proposed</span>
                              </>
                            )}
                          </td>
                          <td className="why">{m.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {audit.noEquivalent.length > 0 && (
                    <p className="note" style={{ marginTop: "0.7rem" }}>
                      No counterpart in the new curriculum for{" "}
                      <span className="mono">{audit.noEquivalent.map((u) => u.code).join(", ")}</span>. These still count
                      as elective credit toward the 180.
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

/** Committed first, then considering, then everything else. */
const INTEREST_ORDER: Record<string, number> = { committed: 0, considering: 1, none: 2 };

const TIER_LABEL: Record<SuggestionTier, string> = {
  required: "Required",
  committed: "Committed",
  considering: "Considering",
  open: "Optional",
};

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Cycle the statuses someone would set by hand. */
function nextStatus(status: CourseStatus): CourseStatus {
  if (status === "completed") return "in-progress";
  if (status === "in-progress") return "failed";
  if (status === "failed") return "waived";
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
    case "waived":
      return "Waived";
    default:
      return status;
  }
}
