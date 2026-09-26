"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Meridian } from "@/components/Meridian";
import { ModeSwitch } from "@/components/ModeSwitch";
import { PlanView } from "@/components/PlanView";
import { RecordPanel } from "@/components/RecordPanel";
import { Settings } from "@/components/Settings";
import { StandView } from "@/components/StandView";
import { auditDegree, buildLogAsCourses, pacing, suggestNextCourses } from "@/lib/audit";
import { getRequirements } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import { knownTerm, offeredCatalogCodes, terms, termName } from "@/lib/offerings";
import { projectFor } from "@/lib/plan";
import { heldCodes } from "@/lib/prereq";
import { decodeState, emptyState, encodeState, loadLocal, saveLocal, type SavedState } from "@/lib/storage";
import type { Interest, PlanTier, TakenCourse } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<SavedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  // The term Plan a term reopens on after a trip back to where you stand. Not
  // saved: it only has to outlast the switch, not a reload.
  const [lastTerm, setLastTerm] = useState<string | null>(null);

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

  const record = useMemo(
    () => [...state.taken, ...buildLogAsCourses(state.buildLog, state.program)],
    [state.taken, state.buildLog, state.program],
  );

  const trueAudit = useMemo(
    () => auditDegree(record, { useInferred: state.useInferred, program: state.program }),
    [record, state.useInferred, state.program],
  );

  const planningTerm = knownTerm(state.planningTerm);

  /** The record as it will stand when the term being planned begins. */
  const projectedRecord = useMemo(
    () => (planningTerm ? projectFor(record, state.plan, planningTerm) : record),
    [record, state.plan, planningTerm],
  );

  /**
   * Everything that measures the degree reads this, so the whole page moves
   * together rather than half of it projecting and half of it not. The record
   * panel is driven by state.taken, so what you actually took stays truthful
   * either way, and a label under the meridian says when this is a projection.
   */
  const audit = useMemo(
    () =>
      planningTerm
        ? auditDegree(projectedRecord, { useInferred: state.useInferred, program: state.program })
        : trueAudit,
    [planningTerm, projectedRecord, state.useInferred, state.program, trueAudit],
  );

  /** Only what the term runs is worth suggesting while planning it. */
  const offered = useMemo(() => (planningTerm ? offeredCatalogCodes(planningTerm) : null), [planningTerm]);
  const held = useMemo(() => heldCodes(projectedRecord), [projectedRecord]);
  const next = useMemo(
    () => suggestNextCourses(audit, state.targets, 10, offered),
    [audit, state.targets, offered],
  );

  /** Pressing the tier a course already has takes it out of the plan. */
  const setPlanTier = useCallback((key: string, tier: PlanTier | null) => {
    setState((prev) => {
      const plan = { ...prev.plan };
      if (tier === null || plan[key] === tier) delete plan[key];
      else plan[key] = tier;
      return { ...prev, plan };
    });
  }, []);

  /** Pressing the tier a target already has clears it. */
  const setTarget = useCallback((id: string, tier: Interest) => {
    setState((prev) => {
      const targets = { ...prev.targets };
      if (targets[id] === tier) delete targets[id];
      else targets[id] = tier;
      return { ...prev, targets };
    });
  }, []);

  const addBuild = useCallback((credits: number, label: string) => {
    setState((prev) => ({
      ...prev,
      buildLog: [...prev.buildLog, { credits, label: label || undefined, status: "completed" }],
    }));
  }, []);

  const removeBuild = useCallback((index: number) => {
    setState((prev) => ({ ...prev, buildLog: prev.buildLog.filter((_, i) => i !== index) }));
  }, []);

  const toggleBuild = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      buildLog: prev.buildLog.map((e, i) =>
        i === index ? { ...e, status: e.status === "completed" ? "in-progress" : "completed" } : e,
      ),
    }));
  }, []);

  // Build credit the course record earns on its own, which logged credits are
  // then counted on top of. Asking the audit rather than matching course codes
  // is what catches the mapped cases: an old POL 1110 arrives as Build credit
  // through the equivalencies without ever naming a Build course.
  const buildOnTranscript = useMemo(
    () =>
      state.taken.length > 0 &&
      auditDegree(state.taken, { useInferred: state.useInferred, program: state.program }).polaris
        .buildCreditsEarned > 0,
    [state.taken, state.useInferred, state.program],
  );

  // Leaving a term remembers it, so Plan a term comes back to the term you
  // were on, including one restored from a previous visit.
  const changeMode = (termId: string | null) => {
    const remembered = termId ?? planningTerm;
    if (remembered) setLastTerm(remembered);
    update({ planningTerm: termId });
  };

  const inferredCount = mappedGrants(audit.normalization).filter((m) => m.via === "inferred").length;
  const hasCourses = record.length > 0;
  const planIndex = planningTerm ? terms.findIndex((t) => t.id === planningTerm) : -1;

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
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <Settings
            program={state.program}
            onProgram={(program) => update({ program })}
            termsRemaining={state.termsRemaining}
            onTermsRemaining={(termsRemaining) => update({ termsRemaining })}
            pace={pacing(audit, state.termsRemaining)}
            useInferred={state.useInferred}
            onUseInferred={(useInferred) => update({ useInferred })}
            inferredCount={inferredCount}
          />
        </div>
      </header>

      <ModeSwitch
        terms={terms}
        planningTerm={planningTerm}
        defaultTerm={lastTerm ?? terms[0]?.id ?? ""}
        onChange={changeMode}
      />

      <Meridian audit={audit} termsRemaining={state.termsRemaining} />
      {planningTerm && (
        <p className="note note-projecting">
          Projected to the start of {termName(planningTerm)} — assuming you pass what you are taking now
          {planIndex > 0 ? ", and what you marked Definitely for an earlier term" : ""}. This is not where you
          stand today.
        </p>
      )}

      <div className="columns">
        <aside>
          <RecordPanel
            taken={state.taken}
            onReplace={setTaken}
            onAdd={(course) => setTaken([...state.taken, course])}
            onRemove={(i) => setTaken(state.taken.filter((_, n) => n !== i))}
            onSetStatus={(i, status) => setTaken(state.taken.map((c, n) => (n === i ? { ...c, status } : c)))}
            build={{
              log: state.buildLog,
              onAdd: addBuild,
              onRemove: removeBuild,
              onToggle: toggleBuild,
              alsoOnTranscript: buildOnTranscript,
            }}
          />
        </aside>

        <div>
          {planningTerm ? (
            <PlanView
              termId={planningTerm}
              plan={state.plan}
              held={held}
              next={next}
              aiming={Object.keys(state.targets).length > 0}
              onPlan={setPlanTier}
            />
          ) : !hasCourses ? (
            <div className="empty">
              <h2>Add your courses to see where you stand</h2>
              <p style={{ maxWidth: "32rem", margin: "0 auto" }}>
                Upload your UATX transcript and every course is read, mapped through the old-catalog equivalencies, and
                measured against all eight concentrations at once.
              </p>
            </div>
          ) : (
            <StandView
              audit={audit}
              program={state.program}
              targets={state.targets}
              onTarget={setTarget}
              onClearTargets={() => update({ targets: {} })}
              next={next}
              csa={state.csa}
            />
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
