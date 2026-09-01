import coursesFile from "@/data/courses.json";
import equivalenciesFile from "@/data/equivalencies.json";
import requirementsFile from "@/data/requirements.json";
import requirements2024File from "@/data/requirements-2024.json";
import type { Course, CoursesFile, EquivalenciesFile, ProgramId, Requirements } from "./types";

export const courses = coursesFile as CoursesFile;
export const equivalencies = equivalenciesFile as EquivalenciesFile;
export const requirements = requirementsFile as unknown as Requirements;
const requirements2024 = requirements2024File as unknown as Requirements;

export const PROGRAMS: { id: ProgramId; label: string; blurb: string }[] = [
  { id: "2026-2027", label: "2026-2027 catalog", blurb: "Liberal Studies major with academic concentrations" },
  { id: "2024-2025", label: "2024-2025 catalog", blurb: "Elect a Center, then its Foundations and Core" },
];

/**
 * Grading is a university-wide policy, not part of a program's requirements,
 * so it is read from the current catalog whichever program is being audited.
 */
export const grading = requirements.grading;

export function getRequirements(program: ProgramId): Requirements {
  return program === "2024-2025" ? requirements2024 : requirements;
}

export const currentCourses: Course[] = courses.courses;
export const legacyCourses: Course[] = courses.legacyCourses;

const byCode = new Map<string, Course>();
for (const c of currentCourses) byCode.set(c.code, c);
for (const c of legacyCourses) if (!byCode.has(c.code)) byCode.set(c.code, c);

export const allCourses: Course[] = [...currentCourses, ...legacyCourses];

export function getCourse(code: string): Course | undefined {
  const norm = normalizeCode(code);
  const direct = byCode.get(norm);
  if (direct) return direct;
  // Lettered special-topic variants (EDU 2900B) are not all catalogued
  // individually; fall back to the base offering they were run under.
  const stripped = norm.replace(/([A-Z]{3,4} \d{3,4})[A-Z]$/, "$1");
  return stripped === norm ? undefined : byCode.get(stripped);
}

export function isCurrentCourse(code: string): boolean {
  const c = byCode.get(normalizeCode(code));
  return c?.catalog === "2026-2027";
}

/** "csai110" / "CSAI  110" / "CSAI-110" all mean CSAI 110. */
export function normalizeCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]{3,4})(\d{3,4}[A-Z]?)$/.exec(cleaned);
  return m ? `${m[1]} ${m[2]}` : raw.toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Course level from its number: 3-digit current codes and 4-digit legacy codes
 * both put the level in the leading digit (CSAI 350 -> 300, STM 3910 -> 300).
 */
export function levelOf(code: string): number {
  const m = /(\d)/.exec(normalizeCode(code).split(" ")[1] ?? "");
  return m ? Number(m[1]) * 100 : 0;
}

export function creditsOf(code: string, fallback = 3): number {
  return getCourse(code)?.credits ?? fallback;
}

export function titleOf(code: string): string {
  return getCourse(code)?.title ?? code;
}

/**
 * Every course code the 2026-2027 requirements name. A legacy course whose own
 * code appears here is accepted directly and needs no equivalency rule.
 */
function collectCodes(source: Requirements): Set<string> {
  const out = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "pick" || obj.type === "credits") (obj.pool as string[]).forEach((c) => out.add(c));
    if (obj.type === "oneOf")
      (obj.pools as { pool: string[] }[]).forEach((p) => p.pool.forEach((c) => out.add(c)));
    for (const [key, value] of Object.entries(obj)) {
      if (key === "slots" || key === "prerequisites" || key === "required") {
        for (const slot of value as { options: string[][] }[]) {
          for (const option of slot.options) option.forEach((c) => out.add(c));
        }
      } else walk(value);
    }
  };
  walk(source);
  for (const c of source.polaris.buildCourses) out.add(c);
  for (const c of source.polaris.buildEquivalents) out.add(c);
  return out;
}

const codesByProgram: Record<ProgramId, Set<string>> = {
  "2026-2027": collectCodes(requirements),
  "2024-2025": collectCodes(requirements2024),
};

export function requirementCodesFor(program: ProgramId): Set<string> {
  return codesByProgram[program];
}

/** Comparable form of a course title, for matching transcript rows to rules. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/^special topics?\b.*?:/, " ")
    .replace(/\b(the|a|an|and|of|in|to|for|i|ii|iii)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Rough token overlap between two titles, 0..1. */
export function titleSimilarity(a: string, b: string): number {
  const at = new Set(titleKey(a).split(" ").filter(Boolean));
  const bt = new Set(titleKey(b).split(" ").filter(Boolean));
  if (!at.size || !bt.size) return 0;
  let hits = 0;
  for (const t of at) if (bt.has(t)) hits++;
  return hits / Math.max(at.size, bt.size);
}
