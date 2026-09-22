import offeringsFile from "@/data/offerings.json";
import { normalizeCode } from "./catalog";
import type { Offering, OfferingsFile, Term } from "./types";

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

export function termName(termId: string): string {
  return terms.find((t) => t.id === termId)?.name ?? termId;
}
