"use client";

import { useMemo } from "react";
import { BrowseOfferings, PlanPanel, PlanSearch, TierButtons } from "./PlanPanel";
import { SuggestionTable, type Suggested } from "./Suggestions";
import { offeringKey, offeringsFor, termName } from "@/lib/offerings";
import type { Plan, PlanTier } from "@/lib/types";

/**
 * Planning one term: what you have picked, a way to find anything else the
 * term runs, what the audit suggests from it, and the whole list. Everything
 * here measures the record as it will stand when the term begins.
 */
export function PlanView({
  termId,
  plan,
  held,
  next,
  aiming,
  onPlan,
}: {
  termId: string;
  plan: Plan;
  /** Codes held once the record is projected to the start of this term. */
  held: Set<string>;
  next: Suggested[];
  /** Whether any Center or concentration is marked, which reorders suggestions. */
  aiming: boolean;
  onPlan: (key: string, tier: PlanTier | null) => void;
}) {
  const name = termName(termId);
  // A suggestion names "PHIL 380"; the term runs it as "PHIL 380A", and the
  // plan is keyed by what the term prints. Where a term runs two letters of one
  // course the last one wins, as it always has, so plans already saved against
  // it still line up.
  const printed = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offeringsFor(termId)) if (o.catalogCode) map.set(o.catalogCode, o.code);
    return map;
  }, [termId]);
  const keyFor = (code: string) => offeringKey(termId, printed.get(code) ?? code);

  return (
    <div className="stack">
      <PlanPanel termId={termId} plan={plan} held={held} onChange={onPlan} />

      <section className="section">
        <PlanSearch termId={termId} plan={plan} held={held} onChange={onPlan} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Suggested for {name}</h2>
          <span className="aside">
            {aiming ? "Weighted by what you are aiming at" : "Ranked by how many open requirements each one closes"}
          </span>
        </div>
        <SuggestionTable
          next={next}
          empty={`Nothing ${name} runs closes a requirement you still need.`}
          planCell={(code) => (
            <TierButtons value={plan[keyFor(code)] ?? null} onChange={(tier) => onPlan(keyFor(code), tier)} />
          )}
        />
      </section>

      <BrowseOfferings termId={termId} plan={plan} onChange={onPlan} />
    </div>
  );
}
