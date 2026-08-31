import { creditsOf, levelOf, requirements, titleOf } from "./catalog";
import { normalizeRecord, type Holding, type NormalizeOptions, type NormalizeResult } from "./equivalency";
import type { Concentration, CourseStatus, RequirementGroup, Slot, TakenCourse } from "./types";

export interface SlotResult {
  label: string | null;
  options: string[][];
  filled: boolean;
  /** True when only in-progress coursework fills it. */
  pendingOnly: boolean;
  filledBy: string[];
}

export interface GroupResult {
  id: string;
  name: string;
  note?: string;
  page?: number;
  required: number;
  completed: number;
  inProgress: number;
  satisfied: boolean;
  slots?: SlotResult[];
  /** Courses from the pool the student already holds. */
  held?: string[];
  /** Courses that would count toward this group but are not yet held. */
  options?: string[];
  /** For oneOf groups, the pool currently doing best. */
  chosenPool?: string;
}

export interface ConcentrationResult {
  id: string;
  name: string;
  center: string;
  kind: Concentration["kind"];
  creditsRequired: number;
  creditsEarned: number;
  creditsInProgress: number;
  percent: number;
  satisfied: boolean;
  groups: GroupResult[];
  prerequisites: GroupResult[];
  /** Distinct courses that would close a still-open requirement. */
  remainingOptions: string[];
  remainingCourseCount: number;
}

export interface PillarResult {
  id: string;
  name: string;
  creditsRequired: number;
  creditsEarned: number;
  creditsInProgress: number;
  satisfied: boolean;
}

export interface AuditResult {
  normalization: NormalizeResult;
  intellectualFoundations: {
    groups: GroupResult[];
    creditsRequired: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    legacyProvision: { applies: boolean; note: string; additionalCredits: number };
  };
  polaris: {
    creditsRequired: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    required: SlotResult[];
    buildCreditsRequired: number;
    buildCreditsEarned: number;
    equivalentCreditsUsed: number;
    equivalentCap: number;
    note: string;
  };
  major: {
    creditsRequired: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    rules: { id: string; label: string; minCredits: number; earned: number; inProgress: number; satisfied: boolean }[];
    note?: string;
  };
  pillars: PillarResult[];
  concentrations: ConcentrationResult[];
  totals: {
    required: number;
    earned: number;
    inProgress: number;
    remaining: number;
  };
}

/** Which holdings can fill each 2026-2027 course code. */
function coverage(holdings: Holding[]): Map<string, Holding[]> {
  const map = new Map<string, Holding[]>();
  for (const h of holdings) {
    for (const code of h.satisfies) {
      const list = map.get(code) ?? [];
      list.push(h);
      map.set(code, list);
    }
  }
  return map;
}

function coveredCodes(holdings: Holding[], status?: CourseStatus): Set<string> {
  const out = new Set<string>();
  for (const h of holdings) {
    if (status && h.status !== status) continue;
    for (const c of h.satisfies) out.add(c);
  }
  return out;
}

/**
 * Find holdings that together cover every code in `option`. One holding may
 * cover several codes at once, which is how STM 2102 fills both MATH 230 and
 * MATH 231 without being spent twice.
 */
function fillOption(option: string[], available: Holding[]): Holding[] | null {
  const used: Holding[] = [];
  for (const code of option) {
    if (used.some((h) => h.satisfies.includes(code))) continue;
    const candidates = available.filter((h) => !used.includes(h) && h.satisfies.includes(code));
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      const byStatus = Number(a.status === "in-progress") - Number(b.status === "in-progress");
      if (byStatus) return byStatus;
      const cov = (h: Holding) => option.filter((c) => h.satisfies.includes(c)).length;
      return cov(b) - cov(a);
    });
    used.push(candidates[0]);
  }
  return used;
}

interface SlotFill {
  results: SlotResult[];
  consumed: Holding[];
  creditsEarned: number;
  creditsInProgress: number;
}

function fillSlots(slots: Slot[], available: Holding[], choose?: number, consume = true): SlotFill {
  const limit = choose ?? slots.length;
  const pool = [...available];
  const consumed: Holding[] = [];
  let filledCount = 0;
  let creditsEarned = 0;
  let creditsInProgress = 0;

  const results = slots.map<SlotResult>((s) => {
    if (filledCount >= limit) {
      return { label: s.label, options: s.options, filled: false, pendingOnly: false, filledBy: [] };
    }
    for (const option of s.options) {
      const used = fillOption(option, pool);
      if (!used) continue;
      const pendingOnly = used.some((h) => h.status === "in-progress");
      if (consume) {
        for (const h of used) {
          const idx = pool.indexOf(h);
          if (idx >= 0) pool.splice(idx, 1);
          consumed.push(h);
          if (h.status === "completed") creditsEarned += h.credits;
          else creditsInProgress += h.credits;
        }
      }
      filledCount++;
      return { label: s.label, options: s.options, filled: true, pendingOnly, filledBy: option.slice() };
    }
    return { label: s.label, options: s.options, filled: false, pendingOnly: false, filledBy: [] };
  });

  return { results, consumed, creditsEarned, creditsInProgress };
}

function slotsToGroupResult(
  g: { id: string; name: string; note?: string; page?: number; choose?: number; slots: Slot[] },
  results: SlotResult[],
): GroupResult {
  const required = g.choose ?? g.slots.length;
  const done = results.filter((r) => r.filled && !r.pendingOnly).length;
  const pendingCount = results.filter((r) => r.filled && r.pendingOnly).length;
  return {
    id: g.id,
    name: g.name,
    note: g.note,
    page: g.page,
    required,
    completed: Math.min(done, required),
    inProgress: Math.min(pendingCount, Math.max(0, required - done)),
    satisfied: done >= required,
    slots: results,
    options: results.filter((r) => !r.filled).flatMap((r) => r.options.flat()),
  };
}

/** Non-destructive evaluation, used for concentrations. */
function evaluateGroup(g: RequirementGroup, holdings: Holding[]): GroupResult {
  const done = coveredCodes(holdings, "completed");
  const pendingSet = coveredCodes(holdings, "in-progress");

  if (g.type === "slots") {
    // Non-consuming: one holding may legitimately fill more than one slot when
    // it maps to several courses at once (STM 2102 is MATH 230 *and* MATH 231).
    return slotsToGroupResult(g, fillSlots(g.slots, holdings, g.choose, false).results);
  }

  if (g.type === "pick") {
    const held = g.pool.filter((c) => done.has(c));
    const pendingHeld = g.pool.filter((c) => !done.has(c) && pendingSet.has(c));
    return {
      id: g.id,
      name: g.name,
      note: g.note,
      page: g.page,
      required: g.choose,
      completed: Math.min(held.length, g.choose),
      inProgress: Math.min(pendingHeld.length, Math.max(0, g.choose - held.length)),
      satisfied: held.length >= g.choose,
      held: [...held, ...pendingHeld],
      options: g.pool.filter((c) => !done.has(c) && !pendingSet.has(c)),
    };
  }

  let best: GroupResult | null = null;
  for (const p of g.pools) {
    const held = p.pool.filter((c) => done.has(c));
    const pendingHeld = p.pool.filter((c) => !done.has(c) && pendingSet.has(c));
    const candidate: GroupResult = {
      id: g.id,
      name: g.name,
      note: g.note,
      page: g.page,
      required: g.choose,
      completed: Math.min(held.length, g.choose),
      inProgress: Math.min(pendingHeld.length, Math.max(0, g.choose - held.length)),
      satisfied: held.length >= g.choose,
      held: [...held, ...pendingHeld],
      options: p.pool.filter((c) => !done.has(c) && !pendingSet.has(c)),
      chosenPool: p.name,
    };
    if (!best || candidate.completed + candidate.inProgress > best.completed + best.inProgress) best = candidate;
  }
  return best!;
}

export function auditDegree(taken: TakenCourse[], opts: NormalizeOptions = {}): AuditResult {
  const normalization = normalizeRecord(taken, opts);
  const holdings = normalization.holdings;
  const req = requirements;

  // Intellectual Foundations and Polaris claim coursework before the major,
  // because the major is defined as 96 credits *outside* those two pillars.
  let available = [...holdings];
  const claim = (used: Holding[]) => {
    available = available.filter((h) => !used.includes(h));
  };

  const ifGroups: GroupResult[] = [];
  let ifEarned = 0;
  let ifPending = 0;
  for (const g of req.intellectualFoundations.groups) {
    if (g.type !== "slots") continue;
    const fill = fillSlots(g.slots, available, g.choose);
    claim(fill.consumed);
    ifGroups.push(slotsToGroupResult(g, fill.results));
    ifEarned += fill.creditsEarned;
    ifPending += fill.creditsInProgress;
  }

  const takenCodes = new Set(holdings.map((h) => h.code));
  const legacyIf = req.intellectualFoundations.legacyProvision;
  const legacyProvisionApplies = legacyIf.legacyCourses.every((c) => takenCodes.has(c));

  const polarisFill = fillSlots(req.polaris.required, available);
  claim(polarisFill.consumed);

  let buildEarned = 0;
  let buildPending = 0;
  let equivalentUsed = 0;
  const takeBuild = (codes: string[], cap?: number) => {
    for (const code of codes) {
      for (;;) {
        const h = available.find((x) => x.satisfies.includes(code));
        if (!h) break;
        if (cap !== undefined && equivalentUsed + h.credits > cap) break;
        claim([h]);
        if (cap !== undefined) equivalentUsed += h.credits;
        if (h.status === "completed") buildEarned += h.credits;
        else buildPending += h.credits;
      }
    }
  };
  takeBuild(req.polaris.buildCourses);
  takeBuild(req.polaris.buildEquivalents, req.polaris.buildEquivalentCap);

  const polarisEarned = polarisFill.creditsEarned + Math.min(buildEarned, req.polaris.buildCredits);
  const polarisPending = polarisFill.creditsInProgress + buildPending;
  const polarisSatisfied =
    polarisFill.results.every((s) => s.filled && !s.pendingOnly) && buildEarned >= req.polaris.buildCredits;

  // Everything still unclaimed counts toward the 96-credit major.
  const sumBy = (status: CourseStatus, levels?: number[]) =>
    available
      .filter((h) => h.status === status && (!levels || levels.includes(h.level)))
      .reduce((n, h) => n + h.credits, 0);

  const majorEarned = sumBy("completed");
  const majorPending = sumBy("in-progress");
  const majorRules = req.major.rules.map((r) => {
    const earned = sumBy("completed", r.levels);
    const inProgress = sumBy("in-progress", r.levels);
    return { ...r, earned, inProgress, satisfied: earned >= r.minCredits };
  });
  const majorSatisfied = majorEarned >= req.major.credits && majorRules.every((r) => r.satisfied);

  // Concentrations describe part of the major, so they are scored against the
  // whole record rather than against what the pillars already claimed.
  const completedCodes = coveredCodes(holdings, "completed");
  const concentrations: ConcentrationResult[] = req.concentrations.map((c) => {
    const groups = c.groups.map((g) => evaluateGroup(g, holdings));
    const prerequisites = c.prerequisites.map((pre, i) => {
      const slots: Slot[] = [{ label: pre.label, options: pre.options }];
      return slotsToGroupResult(
        { id: `${c.id}-prereq-${i}`, name: pre.label, note: pre.note, slots },
        fillSlots(slots, holdings, 1, false).results,
      );
    });

    let earned = 0;
    let pending = 0;
    for (const g of groups) {
      if (g.slots) {
        for (const s of g.slots) {
          if (!s.filled) continue;
          const value = s.filledBy.reduce((n, code) => n + creditsOf(code), 0);
          if (s.pendingOnly) pending += value;
          else earned += value;
        }
      } else {
        for (const code of (g.held ?? []).slice(0, g.required)) {
          if (completedCodes.has(code)) earned += creditsOf(code);
          else pending += creditsOf(code);
        }
      }
    }
    earned = Math.min(earned, c.credits);
    pending = Math.min(pending, Math.max(0, c.credits - earned));

    const openGroups = groups.filter((g) => !g.satisfied);
    const remainingOptions = [...new Set(openGroups.flatMap((g) => g.options ?? []))];
    const remainingCourseCount = openGroups.reduce((n, g) => n + Math.max(0, g.required - g.completed), 0);

    return {
      id: c.id,
      name: c.name,
      center: c.center,
      kind: c.kind,
      creditsRequired: c.credits,
      creditsEarned: earned,
      creditsInProgress: pending,
      percent: Math.round((earned / c.credits) * 100),
      satisfied: groups.every((g) => g.satisfied),
      groups,
      prerequisites,
      remainingOptions,
      remainingCourseCount,
    };
  });

  // Totals come straight from the record, so they always match the transcript.
  const totalEarned = holdings.filter((h) => h.status === "completed").reduce((n, h) => n + h.credits, 0);
  const totalPending = holdings.filter((h) => h.status === "in-progress").reduce((n, h) => n + h.credits, 0);

  const pillars: PillarResult[] = [
    {
      id: "if",
      name: "Intellectual Foundations",
      creditsRequired: req.intellectualFoundations.credits,
      creditsEarned: ifEarned,
      creditsInProgress: ifPending,
      satisfied: ifGroups.every((g) => g.satisfied),
    },
    {
      id: "major",
      name: "Liberal Studies Major",
      creditsRequired: req.major.credits,
      creditsEarned: majorEarned,
      creditsInProgress: majorPending,
      satisfied: majorSatisfied,
    },
    {
      id: "polaris",
      name: "Polaris",
      creditsRequired: req.polaris.credits,
      creditsEarned: polarisEarned,
      creditsInProgress: polarisPending,
      satisfied: polarisSatisfied,
    },
  ];

  return {
    normalization,
    intellectualFoundations: {
      groups: ifGroups,
      creditsRequired: req.intellectualFoundations.credits,
      creditsEarned: ifEarned,
      creditsInProgress: ifPending,
      satisfied: ifGroups.every((g) => g.satisfied),
      legacyProvision: {
        applies: legacyProvisionApplies,
        note: legacyIf.note,
        additionalCredits: legacyIf.additionalCredits,
      },
    },
    polaris: {
      creditsRequired: req.polaris.credits,
      creditsEarned: polarisEarned,
      creditsInProgress: polarisPending,
      satisfied: polarisSatisfied,
      required: polarisFill.results,
      buildCreditsRequired: req.polaris.buildCredits,
      buildCreditsEarned: buildEarned,
      equivalentCreditsUsed: equivalentUsed,
      equivalentCap: req.polaris.buildEquivalentCap,
      note: req.polaris.note,
    },
    major: {
      creditsRequired: req.major.credits,
      creditsEarned: majorEarned,
      creditsInProgress: majorPending,
      satisfied: majorSatisfied,
      rules: majorRules,
      note: req.major.note,
    },
    pillars,
    concentrations,
    totals: {
      required: req.totalCredits,
      earned: totalEarned,
      inProgress: totalPending,
      remaining: Math.max(0, req.totalCredits - totalEarned),
    },
  };
}

/**
 * Courses that would close the most still-open requirements, across the
 * concentrations the student cares about.
 */
export function suggestNextCourses(audit: AuditResult, concentrationIds: string[], limit = 12) {
  const score = new Map<string, { code: string; count: number; forWhat: string[]; required: boolean }>();
  const pool = concentrationIds.length
    ? audit.concentrations.filter((c) => concentrationIds.includes(c.id))
    : audit.concentrations;

  for (const c of pool) {
    for (const g of c.groups) {
      if (g.satisfied) continue;
      for (const code of g.options ?? []) {
        const entry = score.get(code) ?? { code, count: 0, forWhat: [], required: false };
        entry.count++;
        entry.forWhat.push(`${c.name}: ${g.name}`);
        score.set(code, entry);
      }
    }
  }
  for (const g of audit.intellectualFoundations.groups) {
    if (g.satisfied) continue;
    for (const code of g.options ?? []) {
      const entry = score.get(code) ?? { code, count: 0, forWhat: [], required: false };
      entry.count++;
      entry.required = true; // everyone must finish Foundations
      entry.forWhat.unshift(`Intellectual Foundations: ${g.name}`);
      score.set(code, entry);
    }
  }

  const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code);
  const all = [...score.values()];
  // A course that closes more than one requirement is worth the most.
  const doubleDuty = all.filter((e) => e.count > 1).sort((a, b) => b.count - a.count || byCode(a, b));
  const foundations = all.filter((e) => e.count === 1 && e.required).sort(byCode);
  const elective = all.filter((e) => e.count === 1 && !e.required).sort(byCode);

  // Alternate the two single-purpose lists so a concentration never gets
  // crowded out by the Foundations backlog.
  const mixed: typeof all = [];
  for (let i = 0; i < Math.max(foundations.length, elective.length); i++) {
    if (foundations[i]) mixed.push(foundations[i]);
    if (elective[i]) mixed.push(elective[i]);
  }

  return [...doubleDuty, ...mixed]
    .slice(0, limit)
    .map((e) => ({ ...e, title: titleOf(e.code), credits: creditsOf(e.code), level: levelOf(e.code) }));
}

export function pacing(audit: AuditResult, termsRemaining: number) {
  const remaining = Math.max(0, audit.totals.required - audit.totals.earned - audit.totals.inProgress);
  return {
    creditsRemaining: remaining,
    termsRemaining,
    creditsPerTerm: termsRemaining > 0 ? remaining / termsRemaining : 0,
    typicalLoad: 15,
  };
}
