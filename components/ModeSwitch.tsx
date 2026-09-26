"use client";

import type { Term } from "@/lib/types";

/**
 * Where I stand, or planning a term. Planning re-projects every number on the
 * page, so it is a mode you visibly enter and leave rather than a setting
 * tucked in the sidebar.
 */
export function ModeSwitch({
  terms,
  planningTerm,
  defaultTerm,
  onChange,
}: {
  terms: Term[];
  planningTerm: string | null;
  /** The term Plan a term opens on when none is being planned. */
  defaultTerm: string;
  onChange: (termId: string | null) => void;
}) {
  if (terms.length === 0) return null;
  const chosen = planningTerm ?? defaultTerm;
  const only = terms.length === 1 ? terms[0] : null;

  return (
    <div className="mode-switch">
      <div role="tablist" aria-label="What the page shows" className="mode-tabs-top">
        <button
          type="button"
          role="tab"
          className="mode-tab"
          aria-selected={planningTerm === null}
          onClick={() => onChange(null)}
        >
          Where I stand
        </button>
        <button
          type="button"
          role="tab"
          className="mode-tab"
          aria-selected={planningTerm !== null}
          onClick={() => onChange(chosen)}
        >
          {only ? `Plan ${only.name}` : "Plan a term"}
        </button>
      </div>
      {!only && (
        <select
          className="mode-term"
          aria-label="Term to plan"
          value={chosen}
          onChange={(e) => onChange(e.target.value)}
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
