import type { AuditResult } from "./audit";
import { findOffering, terms } from "./offerings";
import type { Interest, Offering, Plan, PlanTier, TakenCourse, Targets } from "./types";

/**
 * The record as it will stand once this term finishes, assuming the courses
 * being attempted now are passed. Nothing else moves: an incomplete is
 * unfinished work under an extension rather than a course under way, and a
 * failed course stays failed until it is retaken.
 */
export function projectRecord(taken: TakenCourse[]): TakenCourse[] {
  return taken.map((c) => (c.status === "in-progress" ? { ...c, status: "completed" as const } : { ...c }));
}

function orderOf(termId: string): number {
  return terms.find((t) => t.id === termId)?.order ?? Number.POSITIVE_INFINITY;
}

/** Everything planned in one term, optionally at one tier. */
export function plannedAt(plan: Plan, termId: string, tier?: PlanTier) {
  const out: { code: string; offering: Offering }[] = [];
  for (const [key, t] of Object.entries(plan)) {
    if (tier && t !== tier) continue;
    const at = key.indexOf(":");
    if (at < 0 || key.slice(0, at) !== termId) continue;
    const code = key.slice(at + 1);
    const offering = findOffering(termId, code);
    // A plan made before the offerings changed can name a course the term no
    // longer runs; it is dropped rather than guessed at.
    if (offering) out.push({ code, offering });
  }
  return out;
}

export function plannedCredits(plan: Plan, termId: string, tier: PlanTier): number {
  return plannedAt(plan, termId, tier).reduce((sum, p) => sum + p.offering.credits, 0);
}

/**
 * The definitelys, as coursework the audit can read, for every term up to and
 * including the one being planned. Only definitely projects: a maybe is a
 * question, and a question must not close a requirement.
 *
 * They arrive as in-progress, which is what the audit already means by "this
 * may yet count": it fills the requirement and shows as pending rather than
 * being counted as earned.
 */
export function plannedAsCourses(plan: Plan, throughTermId: string, before = false): TakenCourse[] {
  const limit = orderOf(throughTermId);
  const out: TakenCourse[] = [];
  for (const t of terms) {
    if (before ? t.order >= limit : t.order > limit) continue;
    for (const { offering } of plannedAt(plan, t.id, "definitely")) {
      // An offering the catalog does not list fills no requirement, but it is
      // still a real course worth real credits, so it goes in under its own
      // printed code and simply matches nothing.
      out.push({
        code: offering.catalogCode ?? offering.code,
        title: offering.title,
        credits: offering.credits,
        status: "in-progress",
      });
    }
  }
  return out;
}

/** The record as it will stand when the term being planned begins. */
export function projectFor(taken: TakenCourse[], plan: Plan, termId: string): TakenCourse[] {
  return [...projectRecord(taken), ...plannedAsCourses(plan, termId)];
}

/** The record before anything planned for this term, so its effect can be measured. */
export function projectBefore(taken: TakenCourse[], plan: Plan, termId: string): TakenCourse[] {
  return [...projectRecord(taken), ...plannedAsCourses(plan, termId, true)];
}

/**
 * The record if this term's maybes were taken too. Only ever used to show
 * what a maybe would be worth; nothing else reads it, so a maybe still never
 * closes a requirement anywhere it matters.
 */
export function projectWithMaybes(taken: TakenCourse[], plan: Plan, termId: string): TakenCourse[] {
  const maybes = plannedAt(plan, termId, "maybe").map(({ offering }) => ({
    code: offering.catalogCode ?? offering.code,
    title: offering.title,
    credits: offering.credits,
    status: "in-progress" as const,
  }));
  return [...projectFor(taken, plan, termId), ...maybes];
}

export interface PlanImpactRow {
  id: string;
  name: string;
  interest: Interest | null;
  /** Percent done, counting work under way, before this term / with the definitelys / with the maybes too. */
  before: number;
  definitely: number;
  withMaybes: number;
  /** This term's planned courses that close an open requirement here, by catalog code. */
  courses: { code: string; tier: PlanTier }[];
}

const doneOrUnderWay = (c: AuditResult["concentrations"][number]) =>
  c.creditsRequired > 0
    ? Math.min(100, Math.round(((c.creditsEarned + c.creditsInProgress) / c.creditsRequired) * 100))
    : 100;

/**
 * What the term's plan does to every concentration at once, not only the ones
 * being aimed at: a course picked for one concentration often moves another,
 * and that is easy to miss one concentration at a time.
 *
 * Every concentration is listed, the ones the plan moves first, so it reads
 * as "here is what this term buys you" before "and here is everything else".
 */
export function planImpact(
  taken: TakenCourse[],
  plan: Plan,
  termId: string,
  targets: Targets,
  audit: (record: TakenCourse[]) => AuditResult,
): PlanImpactRow[] {
  const before = audit(projectBefore(taken, plan, termId));
  const definitely = audit(projectFor(taken, plan, termId));
  const maybes = audit(projectWithMaybes(taken, plan, termId));

  const planned = [...plannedAt(plan, termId, "definitely"), ...plannedAt(plan, termId, "maybe")].map((p) => ({
    code: p.offering.catalogCode,
    tier: plan[`${termId}:${p.code}`],
  }));

  const rows = before.concentrations.map((c, i) => {
    const open = new Set(c.remainingOptions);
    return {
      id: c.id,
      name: c.name,
      interest: targets[c.id] ?? null,
      before: doneOrUnderWay(c),
      definitely: doneOrUnderWay(definitely.concentrations[i]),
      withMaybes: doneOrUnderWay(maybes.concentrations[i]),
      courses: planned
        .filter((p): p is { code: string; tier: PlanTier } => p.code !== null && open.has(p.code))
        .map((p) => ({ code: p.code, tier: p.tier })),
    };
  });

  const gain = (r: PlanImpactRow) => r.withMaybes - r.before;
  return rows.sort((a, b) => gain(b) - gain(a) || b.definitely - a.definitely);
}

/** One still-open requirement, and what the term runs that would fill it. */
export interface TermGap {
  group: string;
  /** Courses (or credits) still to go once the term begins. */
  remaining: number;
  unit: "courses" | "credits";
  /** What this term runs that would count, with its subtopic where that matters. */
  offered: { code: string; pool?: string }[];
}

export interface TermCoverage {
  id: string;
  name: string;
  percent: number;
  interest: Interest | null;
  gaps: TermGap[];
}

/**
 * For each concentration being aimed at, every requirement still open and
 * what this term runs toward it. The flat suggestion list ranks courses
 * against each other; this answers the other question, "do I still need
 * upper-division work here, and can I get any of it this term?"
 *
 * With nothing marked, the concentration closest to done stands in, so the
 * view is never empty for someone who has not set a target yet.
 */
export function termCoverage(audit: AuditResult, targets: Targets, offered: Set<string>): TermCoverage[] {
  const marked = audit.concentrations.filter((c) => targets[c.id]);
  const rank = (id: string) => (targets[id] === "committed" ? 0 : 1);
  const chosen = marked.length
    ? [...marked].sort((a, b) => rank(a.id) - rank(b.id))
    : [...audit.concentrations].sort((a, b) => b.percent - a.percent).slice(0, 1);

  const runs = (option: string[]) => option.every((c) => offered.has(c));

  return chosen.map((c) => {
    const gaps: TermGap[] = [];
    const groups = [...c.prerequisites.map((p) => ({ ...p, name: `Prerequisite: ${p.name}` })), ...c.groups];
    for (const g of groups) {
      const remaining = Math.max(0, g.required - g.completed - g.inProgress);
      if (g.satisfied || remaining === 0) continue;

      let offeredHere: TermGap["offered"];
      if (g.slots) {
        offeredHere = g.slots
          .filter((s) => !s.filled)
          .flatMap((s) => s.options.filter(runs).map((o) => ({ code: o.join(" + ") })));
      } else if (g.openPools) {
        offeredHere = g.openPools.flatMap((p) =>
          p.options.filter((code) => offered.has(code)).map((code) => ({ code, pool: p.name })),
        );
      } else {
        offeredHere = (g.options ?? []).filter((code) => offered.has(code)).map((code) => ({ code }));
      }
      gaps.push({ group: g.name, remaining, unit: g.unit, offered: offeredHere });
    }
    return { id: c.id, name: c.name, percent: c.percent, interest: targets[c.id] ?? null, gaps };
  });
}
