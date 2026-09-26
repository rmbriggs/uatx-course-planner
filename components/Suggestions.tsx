import type { ReactNode } from "react";
import type { SuggestionTier, suggestNextCourses } from "@/lib/audit";
import { OfferedChip } from "./OfferedChip";

export type Suggested = ReturnType<typeof suggestNextCourses>[number];

/** "considering" is stored; Exploring is what the concentration button says. */
const TIER_LABEL: Record<SuggestionTier, string> = {
  required: "Required",
  committed: "Committed",
  considering: "Exploring",
  open: "Optional",
};

/**
 * What to take next, as a table. Where I stand shows it plain; planning a term
 * adds a column of plan buttons, which is the only difference between them.
 */
export function SuggestionTable({
  next,
  planCell,
  empty = "Nothing left to suggest — every requirement you are tracking is met.",
}: {
  next: Suggested[];
  planCell?: (code: string) => ReactNode;
  empty?: string;
}) {
  if (next.length === 0) return <p className="note">{empty}</p>;

  return (
    <table className="next-table">
      <thead>
        <tr>
          <th style={{ width: "6rem" }}>Course</th>
          <th>Title</th>
          <th style={{ width: "4rem" }}>Credits</th>
          <th>Counts toward</th>
          {planCell && <th style={{ width: "12rem" }}>Plan it</th>}
        </tr>
      </thead>
      <tbody>
        {next.map((c) => (
          <tr key={c.code}>
            <td className="mono">{c.code}</td>
            <td>
              {c.title} <OfferedChip code={c.code} />
            </td>
            <td className="mono">{c.credits}</td>
            <td className="why">
              <span className="tier-chip" data-tier={c.tier}>
                {TIER_LABEL[c.tier]}
              </span>{" "}
              {c.forWhat.slice(0, 3).join("; ")}
              {c.forWhat.length > 3 ? ` +${c.forWhat.length - 3} more` : ""}
            </td>
            {planCell && <td>{planCell(c.code)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
