import offeringsFile from "@/data/offerings.json";
import { currentCourses, normalizeCode } from "./catalog";
import type { Course, Offering, OfferingsFile, Term } from "./types";

const file = offeringsFile as unknown as OfferingsFile;

export const offeringsSource = file.source;
export const terms: Term[] = [...file.terms].sort((a, b) => a.order - b.order);

const byTerm = new Map<string, Offering[]>();
for (const o of file.offerings) {
  const list = byTerm.get(o.term) ?? [];
  list.push(o);
  byTerm.set(o.term, list);
}

export function offeringsFor(termId: string): Offering[] {
  return byTerm.get(termId) ?? [];
}

/** "winter-2627:PHIL 220" — how a plan names one course in one term. */
export function offeringKey(termId: string, code: string): string {
  return `${termId}:${normalizeCode(code)}`;
}

export function findOffering(termId: string, code: string): Offering | undefined {
  const want = normalizeCode(code);
  return offeringsFor(termId).find((o) => o.code === want);
}

/**
 * The catalog codes a term can actually fill. An offering the catalog does
 * not list contributes nothing here, because there is no requirement it
 * could close.
 */
export function offeredCatalogCodes(termId: string): Set<string> {
  const out = new Set<string>();
  for (const o of offeringsFor(termId)) if (o.catalogCode) out.add(o.catalogCode);
  return out;
}

/**
 * Which terms run a course, by the code a requirement is written in. A
 * lettered special topic answers under its base code, so asking about
 * "PHIL 380" finds this term's "PHIL 380A".
 *
 * Returned in term order, so a caller can name the soonest one first. Empty
 * for a course no term on file runs, which is most of the catalog.
 */
export function offeredTerms(catalogCode: string): Term[] {
  const want = normalizeCode(catalogCode);
  const hits = new Set<string>();
  for (const o of file.offerings) {
    if (o.catalogCode === want || o.code === want) hits.add(o.term);
  }
  return terms.filter((t) => hits.has(t.id));
}

export function termName(termId: string): string {
  return terms.find((t) => t.id === termId)?.name ?? termId;
}

/** "PHIL 380A" and "phil380" compare as "PHIL380A" and "PHIL380". */
const squash = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Look a course up while planning a term. What the term runs comes back as
 * plannable; a catalog course it does not run comes back separately, with the
 * other terms on file that do, so a search never silently comes up empty for a
 * course that exists.
 *
 * Matches a code with or without its space, and a code's start, so "phil 380"
 * finds the term's PHIL 380A; otherwise a title, faculty name or department.
 */
export function searchTerm(termId: string, query: string, limit = 12) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { offered: [] as Offering[], elsewhere: [] as { course: Course; terms: Term[] }[] };
  const code = squash(q);

  const codeHit = (c: string) => code.length >= 2 && squash(c).startsWith(code);
  const textHit = (s: string) => s.toLowerCase().includes(q);

  const offered = offeringsFor(termId).filter(
    (o) =>
      codeHit(o.code) ||
      (o.catalogCode !== null && codeHit(o.catalogCode)) ||
      textHit(o.title) ||
      textHit(o.department) ||
      o.faculty.some(textHit),
  );

  const runningHere = offeredCatalogCodes(termId);
  const elsewhere = currentCourses
    .filter((c) => !runningHere.has(c.code) && (codeHit(c.code) || textHit(c.title)))
    .slice(0, limit)
    .map((course) => ({ course, terms: offeredTerms(course.code).filter((t) => t.id !== termId) }));

  return { offered: offered.slice(0, limit), elsewhere };
}
