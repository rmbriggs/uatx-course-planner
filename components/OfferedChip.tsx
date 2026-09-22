import { offeredTerms } from "@/lib/offerings";

/** "Winter 26/27" reads as "Winter" once the chip says what it is. */
function shortName(name: string): string {
  return name.replace(/\s*\d\d\/\d\d$/, "");
}

/**
 * Marks a course one of the terms on file actually runs, so a requirement you
 * could close soon is visible without switching into planning. Renders
 * nothing for the rest of the catalog, which is most of it — a badge on
 * everything would say nothing.
 */
export function OfferedChip({ code }: { code: string | string[] }) {
  const parts = Array.isArray(code) ? code : [code];
  if (parts.length === 0) return null;

  // A requirement met by two courses together is only really on offer when
  // both of them run, so the terms intersect rather than pile up.
  const running = parts
    .map(offeredTerms)
    .reduce((a, b) => a.filter((t) => b.some((x) => x.id === t.id)));
  if (running.length === 0) return null;

  return (
    <span
      className="offered-chip"
      title={`Offered ${running.map((t) => t.name).join(" and ")}`}
    >
      {running.map((t) => shortName(t.name)).join(" · ")}
    </span>
  );
}
