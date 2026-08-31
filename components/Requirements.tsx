"use client";

import { creditsOf, titleOf } from "@/lib/catalog";
import type { ConcentrationResult, GroupResult, SlotResult } from "@/lib/audit";
import type { Holding } from "@/lib/equivalency";

const MARK = { done: "●", pending: "◐", open: "○" } as const;

function SlotRow({ slot }: { slot: SlotResult }) {
  const state = slot.filled ? (slot.pendingOnly ? "pending" : "done") : "open";
  const sources = slot.filledBy.filter((f) => f.source !== f.requirement);
  const provisional = slot.filledBy.some((f) => f.via === "inferred");

  return (
    <div className={`slot-row is-${state}`}>
      <span className="tick">{MARK[state]}</span>
      <span className="slot-body">
        {slot.label && <span className="slot-label">{slot.label}</span>}
        <span className="slot-codes">
          {slot.filled ? (
            <>
              <span className="mono">{slot.filledBy.map((f) => f.requirement).join(" + ")}</span>
              {sources.length > 0 && (
                <span className="slot-source">
                  {" "}from your <span className="mono">{[...new Set(sources.map((f) => f.source))].join(", ")}</span>
                </span>
              )}
              {provisional && <span className="mark mark-inferred">Provisional</span>}
            </>
          ) : (
            slot.options.map((opt, i) => (
              <span key={i}>
                {i > 0 && <span className="slot-or"> or </span>}
                <span className="mono" title={opt.map(titleOf).join(" + ")}>
                  {opt.join(" + ")}
                </span>
              </span>
            ))
          )}
        </span>
      </span>
    </div>
  );
}

export function GroupBlock({ group }: { group: GroupResult }) {
  const remaining = Math.max(0, group.required - group.completed - group.inProgress);

  return (
    <div className="group">
      <div className="group-head">
        <span className="group-name">{group.name}</span>
        <span className="group-count mono">
          {group.completed}/{group.required}
          {group.inProgress > 0 && <span className="pending-note"> +{group.inProgress} under way</span>}
        </span>
      </div>
      {group.note && <p className="group-note">{group.note}</p>}

      {group.slots ? (
        <div>
          {group.slots.map((s, i) => (
            <SlotRow key={i} slot={s} />
          ))}
        </div>
      ) : (
        <>
          {group.chosenPool && <p className="group-note">Counting your {group.chosenPool} courses.</p>}
          {(group.held ?? []).length > 0 ? (
            <>
              <p className="group-note">You have taken:</p>
              <ul className="code-list">
                {(group.held ?? []).map((c) => (
                  <li key={c} className="chip chip-done" title={`${titleOf(c)} · ${creditsOf(c)} cr`}>
                    {c}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="group-note">Nothing counted toward this yet.</p>
          )}
          {!group.satisfied && (
            <details>
              <summary className="more">
                {remaining} more to choose, from {group.options?.length ?? 0} courses
              </summary>
              <ul className="code-list" style={{ marginTop: "0.45rem" }}>
                {(group.options ?? []).map((c) => (
                  <li key={c} className="chip" title={`${titleOf(c)} · ${creditsOf(c)} cr`}>
                    {c}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/** One of the three degree pillars, with the courses making up its total. */
export function PillarBlock({
  name,
  creditsEarned,
  creditsRequired,
  creditsInProgress,
  groups,
  counted,
  children,
}: {
  name: string;
  creditsEarned: number;
  creditsRequired: number;
  creditsInProgress: number;
  groups?: GroupResult[];
  counted?: Holding[];
  children?: React.ReactNode;
}) {
  const met = groups?.reduce((n, g) => n + g.completed, 0);
  const total = groups?.reduce((n, g) => n + g.required, 0);

  return (
    <section className="pillar">
      <div className="pillar-head">
        <h3>{name}</h3>
        <span className="pillar-count mono">
          {fmt(creditsEarned)}/{creditsRequired} credits
          {creditsInProgress > 0 && <span className="pending-note"> +{fmt(creditsInProgress)} under way</span>}
          {total !== undefined && (
            <span className="pillar-sub"> · {met} of {total} requirements met</span>
          )}
        </span>
      </div>
      {children}
      {groups?.map((g) => (
        <GroupBlock key={g.id} group={g} />
      ))}
      {counted && counted.length > 0 && (
        <details className="counted">
          <summary className="more">
            The {counted.length} {counted.length === 1 ? "course" : "courses"} making up {fmt(creditsEarned + creditsInProgress)} credits here
          </summary>
          <ul className="counted-list">
            {counted.map((h, i) => (
              <li key={`${h.code}-${i}`}>
                <span className="mono">{h.code}</span>
                <span className="counted-title">{h.title}</span>
                <span className="mono counted-cr">
                  {h.credits} cr · {h.level}-level
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function ConcentrationDetail({ conc }: { conc: ConcentrationResult }) {
  return (
    <div className="detail">
      <div className="section-head" style={{ marginBottom: "0.4rem" }}>
        <h3 style={{ fontSize: "1.35rem" }}>{conc.name}</h3>
        <span className="aside">
          {conc.kind === "applied track" ? "Applied track" : "Concentration"} · Center for {conc.center} ·{" "}
          {fmt(conc.creditsEarned)}/{conc.creditsRequired} credits
        </span>
      </div>

      {conc.prerequisites.length > 0 && (
        <div className="group">
          <div className="group-head">
            <span className="group-name">Foundational prerequisites</span>
            <span className="group-count mono">
              {conc.prerequisites.filter((p) => p.satisfied).length}/{conc.prerequisites.length}
            </span>
          </div>
          <p className="group-note">These sit outside the 36 credits, but the concentration assumes them.</p>
          {conc.prerequisites.map((p) => p.slots?.map((s, i) => <SlotRow key={`${p.id}-${i}`} slot={s} />))}
        </div>
      )}

      {conc.groups.map((g) => (
        <GroupBlock key={g.id} group={g} />
      ))}
    </div>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
