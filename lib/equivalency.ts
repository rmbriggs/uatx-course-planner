import { creditsOf, equivalencies, getCourse, isCurrentCourse, levelOf, normalizeCode, titleSimilarity } from "./catalog";
import type { CourseStatus, EquivalencyRule, TakenCourse } from "./types";

export interface NormalizeOptions {
  /** Include the provisional mappings the equivalency document does not state. */
  useInferred?: boolean;
  /** ruleKey -> index into that rule's `grants`, when a rule offers a choice. */
  choices?: Record<string, number>;
}

/**
 * One course on the student's record.
 *
 * Credits always come from what the student actually earned, so the 180-credit
 * total matches their transcript. `satisfies` is the separate question of which
 * 2026-2027 courses that credit can stand in for.
 */
export interface Holding {
  id: number;
  code: string;
  title: string;
  credits: number;
  status: CourseStatus;
  /** 2026-2027 course codes this holding can fill, including its own if current. */
  satisfies: string[];
  /** Level as it counts in the new curriculum. */
  level: number;
  via: "direct" | "equivalency" | "inferred" | "unmapped";
  explanation: string;
  /** Rule that produced the mapping, when there was one. */
  ruleKey?: string;
}

export interface NormalizeResult {
  holdings: Holding[];
  /** Rules that offer more than one outcome, so the student can pick. */
  pending: { key: string; rule: EquivalencyRule; chosen: number }[];
  /** Legacy courses with no stated equivalent; they still earn elective credit. */
  unmapped: Holding[];
  notes: string[];
}

export function ruleKey(rule: EquivalencyRule): string {
  return `${rule.from.join("+")}|${rule.title}`;
}

let sameCodeCounts: Map<string, number> | null = null;
function sameCodeRuleCount(code: string): number {
  if (!sameCodeCounts) {
    sameCodeCounts = new Map();
    for (const r of equivalencies.rules) {
      for (const c of r.from) sameCodeCounts.set(c, (sameCodeCounts.get(c) ?? 0) + 1);
    }
  }
  return sameCodeCounts.get(code) ?? 0;
}

export function normalizeRecord(taken: TakenCourse[], opts: NormalizeOptions = {}): NormalizeResult {
  const { useInferred = true, choices = {} } = opts;

  const holdings: Holding[] = taken.map((t, i) => {
    const code = normalizeCode(t.code);
    const known = getCourse(code);
    const current = isCurrentCourse(code);
    return {
      id: i,
      code,
      title: t.title ?? known?.title ?? code,
      credits: t.credits ?? known?.credits ?? 3,
      status: t.status,
      satisfies: current ? [code] : [code],
      level: levelOf(code),
      via: current ? "direct" : "unmapped",
      explanation: current ? "2026-2027 catalog course." : "No stated 2026-2027 equivalent; counted as elective credit.",
    };
  });

  const pending: NormalizeResult["pending"] = [];
  const notes: string[] = [];
  const claimed = new Set<number>(holdings.filter((h) => h.via === "direct").map((h) => h.id));

  const rules = equivalencies.rules.filter((r) => useInferred || !r.inferred);
  // Longest `from` first so combined rules win; official rules ahead of inferred.
  const ordered = [...rules].sort((a, b) => {
    if (b.from.length !== a.from.length) return b.from.length - a.from.length;
    return Number(!!a.inferred) - Number(!!b.inferred);
  });

  for (const rule of ordered) {
    const picked: number[] = [];
    for (const code of rule.from) {
      const candidates = holdings.filter((h) => h.code === code && !claimed.has(h.id) && !picked.includes(h.id));
      if (!candidates.length) {
        picked.length = 0;
        break;
      }
      candidates.sort((x, y) => titleSimilarity(y.title, rule.title) - titleSimilarity(x.title, rule.title));
      const best = candidates[0];
      // Where one legacy code covers several different courses (ALT 4500), a
      // titled row that clearly describes a different one must not be captured.
      if (sameCodeRuleCount(code) > 1 && titleSimilarity(best.title, rule.title) < 0.34) {
        picked.length = 0;
        break;
      }
      picked.push(best.id);
    }
    if (!picked.length) continue;

    const key = ruleKey(rule);
    const sources = picked.map((id) => holdings[id]);

    if (rule.electiveGrant) {
      for (const h of sources) {
        claimed.add(h.id);
        h.via = "equivalency";
        h.level = rule.electiveGrant.level;
        h.satisfies = [];
        h.explanation = rule.raw;
        h.ruleKey = key;
      }
      continue;
    }
    if (!rule.grants.length) continue;

    const chosen = Math.min(choices[key] ?? 0, rule.grants.length - 1);
    if (rule.grants.length > 1) pending.push({ key, rule, chosen });
    const granted = rule.grants[chosen];

    // A rule consuming several courses credits the mapping to all of them;
    // each keeps its own credit value so nothing is double counted.
    for (const h of sources) {
      claimed.add(h.id);
      h.via = rule.inferred ? "inferred" : "equivalency";
      h.satisfies = [...new Set([...granted])];
      h.level = levelOf(granted[0]);
      h.explanation = rule.inferred ? (rule.reason ?? rule.raw) : rule.raw;
      h.ruleKey = key;
    }
    if (rule.note) notes.push(`${rule.from.join(" + ")}: ${rule.note}`);
  }

  const unmapped = holdings.filter((h) => h.via === "unmapped");
  return { holdings, pending, unmapped, notes };
}

/** True when one legacy code covers several different courses (ALT 4500). */
export function isAmbiguousCode(code: string): boolean {
  return sameCodeRuleCount(code) > 1;
}

/** Display helper: legacy course -> new courses it was credited as. */
export function mappedGrants(result: NormalizeResult) {
  return result.holdings
    .filter((h) => h.via === "equivalency" || h.via === "inferred")
    .map((h) => ({
      from: h.code,
      title: h.title,
      to: h.satisfies,
      via: h.via,
      status: h.status,
      explanation: h.explanation,
      credits: h.credits,
    }));
}

export function grantedCodesFor(code: string, useInferred = true): string[] {
  const out = new Set<string>();
  for (const r of equivalencies.rules) {
    if (!useInferred && r.inferred) continue;
    if (!r.from.includes(code)) continue;
    for (const alt of r.grants) for (const c of alt) out.add(c);
  }
  return [...out];
}

export { creditsOf };
