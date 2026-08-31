"use client";

import { titleOf } from "@/lib/catalog";
import type { ConcentrationResult, GroupResult, SlotResult } from "@/lib/audit";
import type { Holding } from "@/lib/equivalency";

const MARK = { done: "●", pending: "◐", open: "○" } as const;

/** Code and course name together, so a bare "MATH 220" never stands alone. */
function CourseList({ codes, done }: { codes: string[]; done?: boolean }) {
  return (
    <ul className={`course-list${done ? " is-done" : ""}`}>
      {codes.map((c) => (
        <li key={c}>
          <span className="mono course-code">{c}</span>
          <span className="course-name">{titleOf(c)}</span>
        </li>
      ))}
    </ul>
  );
}

/** The slot's name, with any course code stripped out of it now that the code
 *  has a column of its own. */
function displayName(slot: SlotResult): string {
  const fallback = slot.options[0].map(titleOf).join(" + ");
  const label = slot.label;
  if (!label) return fallback;
  // Most labels are plain requirement names ("Epic and Tragedy") and must be
  // left exactly as they are. Only a label that spells out course codes needs
  // cleaning, now that the codes have a column of their own.
  if (!/[A-Z]{3,4} ?\d{3,4}/.test(label)) return label;
  const stripped = label
    .replace(/[A-Z]{3,4} ?\d{3,4}[A-Z]?/g, " ")
    .replace(/(^|\s)(or|and)(\s|$)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return stripped || fallback;
}

function SlotRow({ slot }: { slot: SlotResult }) {
  const state = slot.filled ? (slot.pendingOnly ? "pending" : "done") : "open";
  const sources = [...new Set(slot.filledBy.filter((f) => f.source !== f.requirement).map((f) => f.source))];
  const provisional = slot.filledBy.some((f) => f.via === "inferred");

  const codes = slot.filled
    ? [slot.filledBy.map((f) => f.requirement).join(" + ")]
    : slot.options.map((opt) => opt.join(" + "));

  // "MATH 220" alone says nothing; "MATH 220 Probability" does. Where a slot
  // has no name of its own, the course title becomes the name.
  const name = displayName(slot);

  return (
    <div className={`slot-row is-${state}`}>
      <span className="tick">{MARK[state]}</span>
      <span className="slot-code mono">
        {codes.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="slot-or"> or </span>}
            {c}
          </span>
        ))}
      </span>
      <span className="slot-body">
        <span className="slot-label">{name}</span>
        {sources.length > 0 && (
          <span className="slot-source">
            from your <span className="mono">{sources.join(", ")}</span>
          </span>
        )}
        {provisional && <span className="mark mark-inferred">Proposed</span>}
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
        <div className="slot-list">
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
              <CourseList codes={group.held ?? []} done />
            </>
          ) : (
            <p className="group-note">Nothing counted toward this yet.</p>
          )}
          {!group.satisfied && (
            <details>
              <summary className="more">
                {remaining} more to choose, from {group.options?.length ?? 0} courses
              </summary>
              <CourseList codes={group.options ?? []} />
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
          <div className="slot-list">
            {conc.prerequisites.map((p) => p.slots?.map((s, i) => <SlotRow key={`${p.id}-${i}`} slot={s} />))}
          </div>
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
