import { findOffering, terms } from "./offerings";
import type { Offering, Plan, PlanTier, TakenCourse } from "./types";

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
export function plannedAsCourses(plan: Plan, throughTermId: string): TakenCourse[] {
  const limit = orderOf(throughTermId);
  const out: TakenCourse[] = [];
  for (const t of terms) {
    if (t.order > limit) continue;
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
