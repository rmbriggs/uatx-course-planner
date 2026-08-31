"use client";

import { creditsOf, titleOf } from "@/lib/catalog";
import type { ConcentrationResult, GroupResult } from "@/lib/audit";

export function GroupBlock({ group }: { group: GroupResult }) {
  return (
    <div className="group">
      <div className="group-head">
        <span className="group-name">{group.name}</span>
        <span className="mono" style={{ fontSize: "0.78rem", color: group.satisfied ? "var(--good)" : "var(--slate)" }}>
          {group.completed}/{group.required}
          {group.inProgress > 0 ? ` (+${group.inProgress} in progress)` : ""}
        </span>
      </div>
      {group.note && <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: "var(--slate)" }}>{group.note}</p>}

      {group.slots ? (
        <div>
          {group.slots.map((s, i) => (
            <div
              key={i}
              className={`slot-row${s.filled ? (s.pendingOnly ? " is-progress" : " is-done") : ""}`}
            >
              <span className="tick">{s.filled ? (s.pendingOnly ? "◐" : "●") : "○"}</span>
              <span>
                {s.label ? <strong style={{ fontWeight: 500 }}>{s.label}</strong> : null}
                {s.label ? " — " : null}
                {s.options.map((opt, oi) => (
                  <span key={oi}>
                    {oi > 0 ? <span style={{ color: "var(--slate-light)" }}> or </span> : null}
                    <span className="mono" style={{ fontSize: "0.76rem" }}>
                      {opt.join(" + ")}
                    </span>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {group.chosenPool && (
            <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: "var(--slate)" }}>
              Counting your {group.chosenPool} courses.
            </p>
          )}
          {(group.held ?? []).length > 0 && (
            <ul className="code-list" style={{ marginBottom: "0.45rem" }}>
              {(group.held ?? []).map((c) => (
                <li key={c} className="chip chip-done" title={titleOf(c)}>
                  {c}
                </li>
              ))}
            </ul>
          )}
          {!group.satisfied && (
            <details>
              <summary style={{ cursor: "pointer", fontSize: "0.8rem", color: "var(--slate)" }}>
                {group.options?.length ?? 0} courses you could still use
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

export function ConcentrationDetail({ conc }: { conc: ConcentrationResult }) {
  return (
    <div className="detail">
      <div className="section-head" style={{ marginBottom: "0.4rem" }}>
        <h3 style={{ fontSize: "1.35rem" }}>{conc.name}</h3>
        <span className="aside">
          {conc.kind === "applied track" ? "Applied track" : "Concentration"} · Center for {conc.center} · 36 credits
        </span>
      </div>

      {conc.prerequisites.length > 0 && (
        <div className="group" style={{ marginTop: "0.8rem" }}>
          <div className="group-head">
            <span className="group-name">Foundational prerequisites</span>
            <span className="mono" style={{ fontSize: "0.78rem", color: "var(--slate)" }}>
              {conc.prerequisites.filter((p) => p.satisfied).length}/{conc.prerequisites.length}
            </span>
          </div>
          <p style={{ margin: "0 0 0.4rem", fontSize: "0.8rem", color: "var(--slate)" }}>
            These sit outside the 36 credits, but the concentration assumes them.
          </p>
          {conc.prerequisites.map((p) => (
            <div key={p.id} className={`slot-row${p.satisfied ? " is-done" : ""}`}>
              <span className="tick">{p.satisfied ? "●" : "○"}</span>
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {conc.groups.map((g) => (
        <GroupBlock key={g.id} group={g} />
      ))}
    </div>
  );
}
