"use client";

import { useCallback, useMemo, useState } from "react";
import { CenterDetail, ConcentrationDetail, PillarBlock } from "./Requirements";
import { SuggestionTable, type Suggested } from "./Suggestions";
import type { AuditResult } from "@/lib/audit";
import { getRequirements, grading } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import type { Interest, ProgramId, Targets } from "@/lib/types";

/** Committed first, then exploring, then everything else. */
const INTEREST_ORDER: Record<string, number> = { committed: 0, considering: 1, none: 2 };

/** "considering" stays the stored value so saved targets and links still read. */
const INTEREST_LABEL: Record<Interest, string> = { committed: "Committed", considering: "Exploring" };

/**
 * The page as it opens: how far along the degree is, which Centers and
 * concentrations are closest, what to take next, and the fine print on how the
 * record was counted. Always today's record — planning a term is its own view.
 */
export function StandView({
  audit,
  program,
  targets,
  onTarget,
  onClearTargets,
  next,
  csa,
}: {
  audit: AuditResult;
  program: ProgramId;
  targets: Targets;
  onTarget: (id: string, tier: Interest) => void;
  onClearTargets: () => void;
  next: Suggested[];
  csa: number | undefined;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [openCenter, setOpenCenter] = useState<string | null>(null);
  const requirements = getRequirements(program);
  const isLegacyProgram = program === "2024-2025";

  // What the student is aiming at floats to the top of every grid; within a
  // tier the closest to done leads.
  const byInterest = useCallback(
    (a: { id: string; percent: number; name: string }, b: { id: string; percent: number; name: string }) =>
      INTEREST_ORDER[targets[a.id] ?? "none"] - INTEREST_ORDER[targets[b.id] ?? "none"] ||
      b.percent - a.percent ||
      a.name.localeCompare(b.name),
    [targets],
  );

  const ranked = useMemo(() => [...audit.concentrations].sort(byInterest), [audit, byInterest]);
  const centers = useMemo(() => [...audit.centers].sort(byInterest), [audit, byInterest]);

  // The 2024-2025 program requires electing a Center, so its concentrations are
  // grouped by the Center that offers them rather than shown as a flat list.
  const byCenter = useMemo(() => {
    const map = new Map<string, typeof ranked>();
    for (const c of ranked) map.set(c.center, [...(map.get(c.center) ?? []), c]);
    return [...map.entries()];
  }, [ranked]);

  const aimingCount = Object.keys(targets).length;
  const aiming = useMemo(() => {
    const named = (tier: Interest) =>
      [...audit.centers, ...audit.concentrations].filter((x) => targets[x.id] === tier).map((x) => x.name);
    return { committed: named("committed"), considering: named("considering") };
  }, [audit, targets]);

  const targetStrip = (id: string) => (
    <div className="target-row" role="group" aria-label="How seriously you are pursuing this">
      {(["committed", "considering"] as Interest[]).map((tier) => (
        <button
          key={tier}
          type="button"
          className="target-btn"
          data-tier={tier}
          aria-pressed={targets[id] === tier}
          onClick={() => onTarget(id, tier)}
        >
          {INTEREST_LABEL[tier]}
        </button>
      ))}
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

  const card = (
    c: {
      id: string;
      name: string;
      percent: number;
      creditsEarned: number;
      creditsInProgress: number;
      creditsRequired: number;
      satisfied: boolean;
      remainingCourseCount: number;
      remainingCredits: number;
    },
    isOpen: boolean,
    toggle: () => void,
    variant?: string,
  ) => (
    <div key={c.id} className="conc-cell" data-tier={targets[c.id] ?? "none"}>
      <button type="button" className="conc" data-open={isOpen} aria-expanded={isOpen} onClick={toggle}>
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
        {variant && <span className="conc-variant">{variant}</span>}
      </button>
      {targetStrip(c.id)}
    </div>
  );

  const renderCard = (c: (typeof ranked)[number]) =>
    card(c, open === c.id, () => setOpen(open === c.id ? null : c.id));
  const renderCenterCard = (b: (typeof audit.centers)[number]) =>
    card(
      b,
      openCenter === b.id,
      () => setOpenCenter(openCenter === b.id ? null : b.id),
      b.note ? `as printed under ${b.publishedUnder[0]}` : undefined,
    );

  const pillarName = (id: string) => audit.pillars.find((p) => p.id === id)?.name ?? id;
  const mappings = mappedGrants(audit.normalization);
  const hasDetails = audit.excluded.length > 0 || audit.waived.courses.length > 0 || mappings.length > 0;

  return (
    <div className="stack stand">
      <nav className="jump-bar" aria-label="Sections">
        <a href="#progress">Progress</a>
        <a href="#concentrations">Concentrations</a>
        <a href="#next">Take next</a>
        {hasDetails && <a href="#record-details">Record details</a>}
      </nav>

      <section id="progress" className="section">
        <div className="section-head">
          <h2>Progress</h2>
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
        <a href="#build-log" className="more build-link">
          Log Build credits in your record
        </a>

        <div className="note" style={{ marginTop: "0.8rem" }}>
          <strong>Course Score Average</strong> —{" "}
          {csa === undefined
            ? `graduation needs a cumulative CSA of at least ${grading.minimumCsa}. Upload a transcript and yours is read automatically.`
            : csa >= grading.minimumCsa
              ? `yours is ${csa}, above the ${grading.minimumCsa} needed to graduate.`
              : `yours is ${csa}, below the ${grading.minimumCsa} needed to graduate.`}
        </div>
      </section>

      <div id="concentrations" className="stack">
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
                  <h2>{isLegacyProgram ? "Concentrations (optional)" : "Concentrations"}</h2>
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
      </div>

      <section id="next" className="section">
        <div className="section-head">
          <h2>What to take next</h2>
          <span className="aside">
            {aimingCount > 0 ? "Weighted by what you are aiming at" : "Ranked by how many open requirements each one closes"}
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
                          Exploring
                        </span>{" "}
                        {aiming.considering.join(", ")}.{" "}
                      </span>
                    )}
                    <button type="button" className="btn btn-quiet" onClick={() => onClearTargets()}>
                      Clear
                    </button>
                  </p>
                ) : (
                  <p className="note" style={{ marginBottom: "0.7rem" }}>
                    Every concentration counts equally here. Mark one Committed or Exploring above and this list
                    follows it &mdash; committing also settles which Center&rsquo;s Core you need.
                  </p>
                )}
        <SuggestionTable next={next} />
      </section>

      {hasDetails && (
        <section id="record-details" className="section">
          <div className="section-head">
            <h2>Record details</h2>
            <span className="aside">How your record was read</span>
          </div>
              {audit.excluded.length > 0 && (
                <div className="subsection">
                  <div className="section-head">
                    <h3>Not counting toward your degree</h3>
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
                </div>
              )}
              {audit.waived.courses.length > 0 && (
                <div className="subsection">
                  <div className="section-head">
                    <h3>Waived</h3>
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
                </div>
              )}
              {mappings.length > 0 && (
                <div className="subsection">
                  <div className="section-head">
                    <h3>How your old courses were counted</h3>
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
                </div>
              )}
        </section>
      )}
    </div>
  );
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

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
