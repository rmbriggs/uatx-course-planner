import type { PlanImpactRow } from "@/lib/plan";

const INTEREST_LABEL = { committed: "Committed", considering: "Exploring" } as const;
const TIER_LABEL = { definitely: "Definitely", maybe: "Maybe", considering: "Backup" } as const;

/** "+6" beside a percent, or nothing when it does not move. */
function Delta({ from, to }: { from: number; to: number }) {
  if (to === from) return null;
  return <span className="impact-delta"> +{to - from}</span>;
}

/**
 * Every concentration, before this term and after it, so a course picked for
 * one concentration shows what it does for the others too. Maybes get a
 * column of their own and never move the Definitely one.
 */
export function PlanImpact({ rows, termName, hasPlan }: { rows: PlanImpactRow[]; termName: string; hasPlan: boolean }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>What your {termName} plan does</h2>
        <span className="aside">Every concentration, done or under way, before and after this term</span>
      </div>
      {!hasPlan ? (
        <p className="note">Mark a course Definitely or Maybe and this shows what it moves, in every concentration.</p>
      ) : (
        <div className="table-scroll">
          <table className="next-table impact-table">
            <thead>
              <tr>
                <th>Concentration</th>
                <th style={{ width: "5rem" }}>Before</th>
                <th style={{ width: "7rem" }}>Definitely</th>
                <th style={{ width: "7rem" }}>+ Maybes</th>
                <th>Your courses that count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.courses.length === 0 ? "is-unmoved" : undefined}>
                  <td>
                    {r.name}
                    {r.interest && (
                      <span className="tier-chip" data-tier={r.interest}>
                        {INTEREST_LABEL[r.interest]}
                      </span>
                    )}
                  </td>
                  <td className="mono">{r.before}%</td>
                  <td className="mono">
                    {r.definitely}%<Delta from={r.before} to={r.definitely} />
                  </td>
                  <td className="mono">
                    {r.withMaybes}%<Delta from={r.definitely} to={r.withMaybes} />
                  </td>
                  <td className="why">
                    {r.courses.length === 0
                      ? "None"
                      : r.courses.map((c, i) => (
                          <span key={c.code}>
                            {i > 0 && ", "}
                            <span className="mono">{c.code}</span>
                            {c.tier !== "definitely" && <span className="impact-tier"> ({TIER_LABEL[c.tier]})</span>}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
