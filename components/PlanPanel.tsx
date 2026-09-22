"use client";

import { findOffering, offeringKey, offeringsFor, termName } from "@/lib/offerings";
import { plannedAt, plannedCredits } from "@/lib/plan";
import { checkPrerequisite, type PrereqCheck } from "@/lib/prereq";
import type { Offering, Plan, PlanTier } from "@/lib/types";

const TIERS: { id: PlanTier; label: string }[] = [
  { id: "definitely", label: "Definitely" },
  { id: "maybe", label: "Maybe" },
  { id: "considering", label: "Considering" },
];

export function TierButtons({
  value,
  onChange,
}: {
  value: PlanTier | null;
  onChange: (tier: PlanTier | null) => void;
}) {
  return (
    <span className="tier-buttons">
      {TIERS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="tier-button"
          data-tier={t.id}
          aria-pressed={value === t.id}
          onClick={() => onChange(value === t.id ? null : t.id)}
        >
          {t.label}
        </button>
      ))}
    </span>
  );
}

/** "MATH 210 and MATH 240", or "AMCV 200 or INF 2121". */
function describeOptions(options: string[][]): string {
  return options.map((alt) => alt.join(" and ")).join(" or ");
}

function PrereqWarning({ check }: { check: PrereqCheck }) {
  if (check.state === "unmet") {
    return (
      <p className="note note-warn">
        Wants {describeOptions(check.options ?? [])} — not on your record and not in this plan.
      </p>
    );
  }
  if (check.state === "unknown") {
    return <p className="note">Prerequisite: &ldquo;{check.text}&rdquo; — cannot be checked automatically.</p>;
  }
  return null;
}

/**
 * An offering by the code a requirement is written in. A suggestion names
 * "PHIL 380"; the term runs it as "PHIL 380A".
 */
export function offeringFor(termId: string, catalogCode: string): Offering | undefined {
  return (
    findOffering(termId, catalogCode) ?? offeringsFor(termId).find((o) => o.catalogCode === catalogCode)
  );
}

export function PlanPanel({
  termId,
  plan,
  held,
  onChange,
}: {
  termId: string;
  plan: Plan;
  /** Codes held once the record is projected to the start of this term. */
  held: Set<string>;
  onChange: (key: string, tier: PlanTier | null) => void;
}) {
  const rows = TIERS.map((t) => ({ tier: t, items: plannedAt(plan, termId, t.id) }));
  const anything = rows.some((r) => r.items.length > 0);
  const definite = plannedCredits(plan, termId, "definitely");

  return (
    <section className="section">
      <div className="section-head">
        <h2>Your plan for {termName(termId)}</h2>
        <span className="aside">{definite} credits marked Definitely</span>
      </div>

      {!anything ? (
        <p className="note">
          Nothing planned yet. Mark a course Definitely, Maybe or Considering in the list above, or browse
          everything the term runs.
        </p>
      ) : (
        rows
          .filter((r) => r.items.length > 0)
          .map((r) => (
            <div key={r.tier.id} className="plan-group">
              <p className="eyebrow">
                <span className="tier-chip" data-tier={r.tier.id}>
                  {r.tier.label}
                </span>{" "}
                {plannedCredits(plan, termId, r.tier.id)} credits
              </p>
              <table className="next-table">
                <tbody>
                  {r.items.map(({ offering }) => {
                    const check: PrereqCheck = offering.catalogCode
                      ? checkPrerequisite(offering.catalogCode, held)
                      : { state: "none" };
                    return (
                      <tr key={offering.code}>
                        <td className="mono">{offering.code}</td>
                        <td>
                          {offering.title}
                          {offering.faculty.length > 0 && (
                            <span className="aside"> &middot; {offering.faculty.join(", ")}</span>
                          )}
                          <PrereqWarning check={check} />
                          {offering.note && <p className="note">{offering.note}</p>}
                        </td>
                        <td className="mono">{offering.credits}</td>
                        <td>
                          <TierButtons
                            value={r.tier.id}
                            onChange={(tier) => onChange(offeringKey(termId, offering.code), tier)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
      )}
    </section>
  );
}

export function BrowseOfferings({
  termId,
  plan,
  onChange,
}: {
  termId: string;
  plan: Plan;
  onChange: (key: string, tier: PlanTier | null) => void;
}) {
  const all = offeringsFor(termId);
  const byDept = new Map<string, Offering[]>();
  for (const o of all) byDept.set(o.department, [...(byDept.get(o.department) ?? []), o]);

  return (
    <details className="browse-offerings">
      <summary>
        Browse all {all.length} courses {termName(termId)} runs
      </summary>
      {[...byDept.entries()].map(([dept, list]) => (
        <div key={dept} className="plan-group">
          <p className="eyebrow">{dept}</p>
          <table className="next-table">
            <tbody>
              {list.map((o) => (
                <tr key={o.code}>
                  <td className="mono">{o.code}</td>
                  <td>
                    {o.title}
                    {!o.catalogCode && (
                      <p className="note">Not in the catalog, so it fills no named requirement.</p>
                    )}
                  </td>
                  <td className="mono">{o.credits}</td>
                  <td>
                    <TierButtons
                      value={plan[offeringKey(termId, o.code)] ?? null}
                      onChange={(tier) => onChange(offeringKey(termId, o.code), tier)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}
