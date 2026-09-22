import { getCourse, normalizeCode } from "./catalog";
import { fillsRequirement, type TakenCourse } from "./types";

export type PrereqCheck = {
  /**
   * none    - the catalog asks for nothing
   * met     - at least one alternative is entirely held
   * unmet   - none is
   * unknown - the catalog states it in prose, so it is shown, not judged
   */
  state: "met" | "unmet" | "unknown" | "none";
  /** The catalog's own words, for display. */
  text?: string;
  options?: string[][];
};

const CODE = /^[A-Z]{2,5} ?\d{3,4}[A-Z]?$/;
const SUBJECT = /^[A-Z]{2,5}$/;

/**
 * A prerequisite as alternatives of all-of sets — the same options-of-codes
 * shape requirement slots already use, where the outer array is "any of" and
 * the inner one is "all of".
 *
 * Of the 174 catalog courses that state a prerequisite, 173 are clean code
 * expressions. The exception is PHYS 310's "PHYS 220 MATH 240", two codes
 * with the "and" left out. Anything that is not codes returns null and is
 * reported rather than guessed at.
 */
export function parsePrerequisite(text: string): string[][] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const alternatives = trimmed.split(/\s+or\s+|\s*\/\s*/i);
  const out: string[][] = [];

  for (const alt of alternatives) {
    // "and", a comma, a plus, or nothing at all between two codes.
    const parts = alt.split(/\s+and\s+|\s*[,;+]\s*|\s+/i).filter(Boolean);
    const codes: string[] = [];
    let buffer = "";
    for (const part of parts) {
      // A bare number after a subject is the rest of that code: "PHYS" "220".
      buffer = buffer ? `${buffer} ${part}` : part;
      if (CODE.test(buffer)) {
        codes.push(normalizeCode(buffer));
        buffer = "";
      } else if (!SUBJECT.test(buffer)) {
        return null; // prose
      }
    }
    if (buffer || !codes.length) return null;
    out.push(codes);
  }
  return out.length ? out : null;
}

/** Course codes that count as held: earned, under way, or waived. */
export function heldCodes(record: TakenCourse[]): Set<string> {
  const out = new Set<string>();
  for (const c of record) if (fillsRequirement(c.status)) out.add(normalizeCode(c.code));
  return out;
}

export function checkPrerequisite(code: string, held: Set<string>): PrereqCheck {
  const course = getCourse(code);
  const text = course?.prerequisite?.trim();
  if (!text) return { state: "none" };

  const options = parsePrerequisite(text);
  if (!options) return { state: "unknown", text };

  const met = options.some((alt) => alt.every((c) => held.has(c)));
  return met ? { state: "met", text, options } : { state: "unmet", text, options };
}
