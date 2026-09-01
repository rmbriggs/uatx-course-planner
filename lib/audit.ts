import { creditsOf, getRequirements, levelOf, requirementCodesFor, titleOf } from "./catalog";
import { normalizeRecord, type Holding, type NormalizeOptions, type NormalizeResult } from "./equivalency";
import {
  earnsCredit,
  fillsRequirement,
  isPending,
  isWaived,
  needsRetake,
  type Concentration,
  type CourseStatus,
  type RequirementGroup,
  type ProgramId,
  type Slot,
  type TakenCourse,
  type Targets,
  type BuildEntry,
} from "./types";

export interface AuditOptions extends NormalizeOptions {
  program?: ProgramId;
}

/** A requirement, and the course of the student's that filled it. */
export interface SlotFillSource {
  /** The catalog course the slot asked for. */
  requirement: string;
  /** The course on the student's record that provided it. */
  source: string;
  /** Which holding it was, so one course filling two slots is charged once. */
  holdingId: number;
  via: Holding["via"];
  status: CourseStatus;
}

/** Work that can fill a requirement: passed, not finished yet, or waived. */
function canCount(h: Holding): boolean {
  return fillsRequirement(h.status);
}

export interface SlotResult {
  label: string | null;
  options: string[][];
  filled: boolean;
  /** True when only unfinished coursework fills it. */
  pendingOnly: boolean;
  /** True when a waiver closes it, so it costs no credit. */
  waived: boolean;
  filledBy: SlotFillSource[];
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
  /** Whether `required`/`completed` count courses or credits. */
  unit: "courses" | "credits";
}

export interface ConcentrationResult {
  id: string;
  name: string;
  center: string;
  /** The Center whose Foundations and Core this sits inside, scored separately. */
  centerId?: string;
  kind: Concentration["kind"];
  /** What the concentration still asks for, after any waivers came off it. */
  creditsRequired: number;
  /** Credits the concentration no longer asks for, because they were waived. */
  creditsWaived: number;
  creditsEarned: number;
  creditsInProgress: number;
  percent: number;
  satisfied: boolean;
  groups: GroupResult[];
  prerequisites: GroupResult[];
  /** Distinct courses that would close a still-open requirement. */
  remainingOptions: string[];
  /** Courses still to choose, from the groups counted in courses. */
  remainingCourseCount: number;
  /** Credits still to earn, from the groups counted in credits. */
  remainingCredits: number;
}

/** A Center's Foundations and Core, scored on their own. */
export interface CenterResult {
  id: string;
  name: string;
  publishedUnder: string[];
  note?: string;
  creditsRequired: number;
  creditsWaived: number;
  creditsEarned: number;
  creditsInProgress: number;
  percent: number;
  satisfied: boolean;
  groups: GroupResult[];
  remainingCourseCount: number;
  remainingCredits: number;
}

export interface PillarResult {
  id: string;
  name: string;
  /** What this pillar still asks for, after any waivers came off it. */
  creditsRequired: number;
  creditsEarned: number;
  creditsInProgress: number;
  /** Credits waived out of this pillar, or moved into it to replace them. */
  creditsWaived: number;
  satisfied: boolean;
}

export interface AuditResult {
  program: ProgramId;
  normalization: NormalizeResult;
  /** Courses that cannot count as they stand, and why. */
  excluded: Holding[];
  /** Failed courses; required ones must be retaken. */
  retakeNeeded: Holding[];
  /**
   * Requirements the student was excused from. `creditsToReplace` is what those
   * waivers took off the named pillars and moved into elective credit, so the
   * degree still comes to its full total.
   */
  waived: { courses: Holding[]; creditsToReplace: number };
  /** Legacy courses with no equivalent and no place in the new curriculum. */
  noEquivalent: Holding[];
  intellectualFoundations: {
    groups: GroupResult[];
    creditsRequired: number;
    /** Credits this pillar no longer asks for, because they were waived. */
    creditsWaived: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    /** The courses making up this pillar's credit total. */
    countedCourses: Holding[];
    legacyProvision: { applies: boolean; note: string; additionalCredits: number };
  };
  polaris: {
    creditsRequired: number;
    creditsWaived: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    countedCourses: Holding[];
    required: SlotResult[];
    buildCreditsRequired: number;
    buildCreditsEarned: number;
    equivalentCreditsUsed: number;
    equivalentCap: number;
    note: string;
  };
  major: {
    creditsRequired: number;
    /** Credits moved here from requirements a waiver closed elsewhere. */
    creditsAdded: number;
    creditsEarned: number;
    creditsInProgress: number;
    satisfied: boolean;
    countedCourses: Holding[];
    rules: { id: string; label: string; minCredits: number; earned: number; inProgress: number; satisfied: boolean }[];
    note?: string;
  };
  pillars: PillarResult[];
  concentrations: ConcentrationResult[];
  /**
   * The Centers, where the program has them. Graduation asks for one Center's
   * Foundations and Core; the concentration inside it is optional.
   */
  centers: CenterResult[];
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

function coveredCodes(holdings: Holding[], keep: (h: Holding) => boolean): Set<string> {
  const out = new Set<string>();
  for (const h of holdings) {
    if (!keep(h)) continue;
    for (const c of h.satisfies) out.add(c);
  }
  return out;
}

/**
 * Find holdings that together cover every code in `option`. One holding may
 * cover several codes at once, which is how STM 2102 fills both MATH 230 and
 * MATH 231 without being spent twice.
 */
function fillOption(option: string[], available: Holding[]): { code: string; holding: Holding }[] | null {
  const picks: { code: string; holding: Holding }[] = [];
  const used: Holding[] = [];
  for (const code of option) {
    const already = used.find((h) => h.satisfies.includes(code));
    if (already) {
      picks.push({ code, holding: already });
      continue;
    }
    // Failed, withdrawn and audited work cannot fill a requirement.
    const candidates = available.filter(
      (h) => canCount(h) && !used.includes(h) && h.satisfies.includes(code),
    );
    if (!candidates.length) return null;
    candidates.sort((a, b) => {
      // Real earned coursework first, then a waiver, then unfinished work.
      const rank = (h: Holding) => (isPending(h.status) ? 2 : isWaived(h.status) ? 1 : 0);
      const byStatus = rank(a) - rank(b);
      if (byStatus) return byStatus;
      const cov = (h: Holding) => option.filter((c) => h.satisfies.includes(c)).length;
      return cov(b) - cov(a);
    });
    used.push(candidates[0]);
    picks.push({ code, holding: candidates[0] });
  }
  return picks;
}

interface SlotFill {
  results: SlotResult[];
  consumed: Holding[];
  creditsEarned: number;
  creditsInProgress: number;
  /** Credits these slots no longer ask for, because a waiver closed them. */
  creditsWaived: number;
}

function fillSlots(slots: Slot[], available: Holding[], choose?: number, consume = true): SlotFill {
  const limit = choose ?? slots.length;
  const pool = [...available];
  const consumed: Holding[] = [];
  // A course that maps to two of the new courses fills both requirements, but
  // its credits are counted once. INF 1100 is both LITR 102 and LITR 103.
  const spent = new Set<Holding>();
  let filledCount = 0;
  let creditsEarned = 0;
  let creditsInProgress = 0;
  let creditsWaived = 0;

  const results = slots.map<SlotResult>((s) => {
    if (filledCount >= limit) {
      return { label: s.label, options: s.options, filled: false, pendingOnly: false, waived: false, filledBy: [] };
    }
    for (const option of s.options) {
      const picks = fillOption(option, pool);
      if (!picks) continue;
      const used = [...new Set(picks.map((p) => p.holding))];
      const pendingOnly = used.some((h) => isPending(h.status));
      const waived = used.some((h) => isWaived(h.status));
      if (consume) {
        for (const h of used) {
          if (spent.has(h)) continue;
          spent.add(h);
          consumed.push(h);
          // Waived work carries no credits, so it lands in neither total.
          if (earnsCredit(h.status)) creditsEarned += h.credits;
          else if (isPending(h.status)) creditsInProgress += h.credits;
        }
        // What the pillar stops asking for is the slot's own value, not the
        // waived course's: it is the requirement that goes away. One waiver
        // closing two slots therefore removes both slots' credits.
        creditsWaived += picks.reduce(
          (n, pick) => n + (isWaived(pick.holding.status) ? creditsOf(pick.code) : 0),
          0,
        );
      }
      filledCount++;
      return {
        label: s.label,
        options: s.options,
        filled: true,
        pendingOnly,
        waived,
        filledBy: picks.map((p) => ({
          requirement: p.code,
          source: p.holding.code,
          holdingId: p.holding.id,
          via: p.holding.via,
          status: p.holding.status,
        })),
      };
    }
    return { label: s.label, options: s.options, filled: false, pendingOnly: false, waived: false, filledBy: [] };
  });

  return { results, consumed, creditsEarned, creditsInProgress, creditsWaived };
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
    unit: "courses",
  };
}

/** Non-destructive evaluation, used for concentrations. */
function evaluateGroup(g: RequirementGroup, holdings: Holding[]): GroupResult {
  const earnedSet = coveredCodes(holdings, (h) => earnsCredit(h.status));
  const waivedSet = coveredCodes(holdings, (h) => isWaived(h.status));
  const pendingSet = coveredCodes(holdings, (h) => isPending(h.status));
  // A waiver closes the requirement, so the course stops being listed as still
  // needed even though it brought no credit with it.
  const done = new Set([...earnedSet, ...waivedSet]);

  if (g.type === "slots") {
    // Non-consuming: one holding may legitimately fill more than one slot when
    // it maps to several courses at once (STM 2102 is MATH 230 *and* MATH 231).
    return slotsToGroupResult(g, fillSlots(g.slots, holdings, g.choose, false).results);
  }

  if (g.type === "credits") {
    // Credits come from the holdings themselves, so a repeatable course such as
    // Writing Studio counts each time it was taken.
    const inPool = (h: Holding) => h.satisfies.some((c) => g.pool.includes(c));
    const earned = holdings.filter((h) => inPool(h) && earnsCredit(h.status)).reduce((n, h) => n + h.credits, 0);
    const pendingCredits = holdings.filter((h) => inPool(h) && isPending(h.status)).reduce((n, h) => n + h.credits, 0);
    return {
      id: g.id,
      name: g.name,
      note: g.note,
      page: g.page,
      required: g.minCredits,
      completed: Math.min(earned, g.minCredits),
      inProgress: Math.min(pendingCredits, Math.max(0, g.minCredits - earned)),
      satisfied: earned >= g.minCredits,
      // Credits cannot be waived, only courses can, so a waiver neither counts
      // here nor removes a course from the pool still available to fill it.
      held: g.pool.filter((c) => earnedSet.has(c) || pendingSet.has(c)),
      options: g.pool.filter((c) => !earnedSet.has(c) && !pendingSet.has(c)),
      unit: "credits",
    };
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
      unit: "courses",
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
      unit: "courses",
    };
    if (!best || candidate.completed + candidate.inProgress > best.completed + best.inProgress) best = candidate;
  }
  return best!;
}

/**
 * Credits a set of already-evaluated groups is worth, against what it declares.
 *
 * Credits are the student's own, never the requirement's. A 1.5-credit special
 * topic that stands in for a 3-credit course is worth 1.5, and one course
 * filling two requirements is counted once - the same rule the pillars use, so
 * a concentration can never claim credit the transcript does not show.
 *
 * A waiver is the exception on the other side: it earns nothing, and it takes
 * the requirement's own value off the declared total, so the fraction stays
 * reachable.
 */
function scoreGroups(
  groups: GroupResult[],
  declaredCredits: number,
  ctx: {
    byId: Map<number, Holding>;
    coverage: Map<string, Holding[]>;
    waivedCodes: Set<string>;
  },
) {
  let earned = 0;
  let pending = 0;
  let waivedCredits = 0;
  // One course can satisfy requirements in more than one group; its credits
  // still only exist once.
  const spent = new Set<number>();

  const charge = (h: Holding | undefined) => {
    if (!h || spent.has(h.id)) return;
    spent.add(h.id);
    if (earnsCredit(h.status)) earned += h.credits;
    else if (isPending(h.status)) pending += h.credits;
  };

  // Real coursework before unfinished work, so a code covered by both is
  // charged as earned rather than as pending.
  const holdingFor = (code: string) => {
    const all = ctx.coverage.get(code) ?? [];
    return all.find((h) => earnsCredit(h.status)) ?? all.find((h) => isPending(h.status));
  };

  for (const g of groups) {
    if (g.slots) {
      for (const s of g.slots) {
        if (!s.filled) continue;
        for (const f of s.filledBy) {
          if (isWaived(f.status)) waivedCredits += creditsOf(f.requirement);
          else charge(ctx.byId.get(f.holdingId));
        }
      }
    } else if (g.unit === "credits") {
      // Already counted from the holdings themselves.
      earned += g.completed;
      pending += g.inProgress;
    } else {
      for (const code of (g.held ?? []).slice(0, g.required)) {
        if (ctx.waivedCodes.has(code)) waivedCredits += creditsOf(code);
        else charge(holdingFor(code));
      }
    }
  }

  const creditsRequired = Math.max(0, declaredCredits - waivedCredits);
  const cappedEarned = Math.min(earned, creditsRequired);
  return {
    waivedCredits,
    creditsRequired,
    earned: cappedEarned,
    pending: Math.min(pending, Math.max(0, creditsRequired - cappedEarned)),
  };
}

export function auditDegree(taken: TakenCourse[], opts: AuditOptions = {}): AuditResult {
  const program: ProgramId = opts.program ?? "2026-2027";
  const req = getRequirements(program);
  // Rules are scoped by program: the equivalency document's old-to-new mappings
  // for 2026-2027, and the within-catalog special-topics mappings for
  // 2024-2025, whose requirements are written in old codes already.
  const normalization = normalizeRecord(taken, { ...opts, program });
  const holdings = normalization.holdings;

  // Intellectual Foundations and Polaris claim coursework before the major,
  // because the major is defined as 96 credits *outside* those two pillars.
  let available = [...holdings];
  const claim = (used: Holding[]) => {
    available = available.filter((h) => !used.includes(h));
  };

  const ifGroups: GroupResult[] = [];
  const ifCounted: Holding[] = [];
  let ifEarned = 0;
  let ifPending = 0;
  let ifWaived = 0;
  for (const g of req.intellectualFoundations.groups) {
    if (g.type !== "slots") continue;
    const fill = fillSlots(g.slots, available, g.choose);
    claim(fill.consumed);
    ifCounted.push(...fill.consumed);
    ifGroups.push(slotsToGroupResult(g, fill.results));
    ifEarned += fill.creditsEarned;
    ifPending += fill.creditsInProgress;
    ifWaived += fill.creditsWaived;
  }
  // A waived requirement is one this pillar no longer asks for, so its target
  // comes down. Leaving it at 57 would show a fraction that can never close.
  const ifRequired = Math.max(0, req.intellectualFoundations.credits - ifWaived);

  const takenCodes = new Set(holdings.map((h) => h.code));
  const legacyIf = req.intellectualFoundations.legacyProvision;
  const legacyProvisionApplies = legacyIf.legacyCourses.every((c) => takenCodes.has(c));

  const polarisFill = fillSlots(req.polaris.required, available);
  claim(polarisFill.consumed);
  const polarisCounted: Holding[] = [...polarisFill.consumed];

  let buildEarned = 0;
  let buildPending = 0;
  let equivalentUsed = 0;
  const takeBuild = (codes: string[], cap?: number) => {
    for (const code of codes) {
      for (;;) {
        // Build is a credit total rather than a named course, and a credit
        // total cannot be waived, so only real coursework counts here.
        const h = available.find((x) => canCount(x) && !isWaived(x.status) && x.satisfies.includes(code));
        if (!h) break;
        if (cap !== undefined && equivalentUsed + h.credits > cap) break;
        claim([h]);
        polarisCounted.push(h);
        if (cap !== undefined) equivalentUsed += h.credits;
        if (earnsCredit(h.status)) buildEarned += h.credits;
        else buildPending += h.credits;
      }
    }
  };
  takeBuild(req.polaris.buildCourses);
  takeBuild(req.polaris.buildEquivalents, req.polaris.buildEquivalentCap);

  const polarisWaived = polarisFill.creditsWaived;
  const polarisRequired = Math.max(0, req.polaris.credits - polarisWaived);
  const polarisEarned = polarisFill.creditsEarned + Math.min(buildEarned, req.polaris.buildCredits);
  const polarisPending = polarisFill.creditsInProgress + buildPending;
  const polarisSatisfied =
    polarisFill.results.every((s) => s.filled && !s.pendingOnly) && buildEarned >= req.polaris.buildCredits;
  // The 180 does not move, so credits a waiver freed from a named requirement
  // reappear as electives, which is what the major pillar counts.
  const displacedCredits = ifWaived + polarisWaived;
  const majorRequired = req.major.credits + displacedCredits;

  // Everything still unclaimed counts toward the 96-credit major.
  // Failed, withdrawn and audited work never reaches the major's credit count,
  // and neither does a waiver, which brings no credit to contribute.
  const majorPool = available.filter((h) => canCount(h) && !isWaived(h.status));
  const sumBy = (keep: (h: Holding) => boolean, levels?: number[]) =>
    majorPool
      .filter((h) => keep(h) && (!levels || levels.includes(h.level)))
      .reduce((n, h) => n + h.credits, 0);

  const majorEarned = sumBy((h) => earnsCredit(h.status));
  const majorPending = sumBy((h) => isPending(h.status));
  const majorRules = req.major.rules.map((r) => {
    const earned = sumBy((h) => earnsCredit(h.status), r.levels);
    const inProgress = sumBy((h) => isPending(h.status), r.levels);
    return { ...r, earned, inProgress, satisfied: earned >= r.minCredits };
  });
  const majorSatisfied = majorEarned >= majorRequired && majorRules.every((r) => r.satisfied);

  // Concentrations describe part of the major, so they are scored against the
  // whole record rather than against what the pillars already claimed.
  const completedCodes = coveredCodes(holdings, (h) => earnsCredit(h.status));
  const waivedCodes = coveredCodes(holdings, (h) => isWaived(h.status));
  const scoreCtx = {
    byId: new Map(holdings.map((h) => [h.id, h])),
    coverage: coverage(holdings),
    waivedCodes,
  };
  const concentrations: ConcentrationResult[] = req.concentrations.map((c) => {
    const groups = c.groups.map((g) => evaluateGroup(g, holdings));
    const prerequisites = c.prerequisites.map((pre, i) => {
      const slots: Slot[] = [{ label: pre.label, options: pre.options }];
      return slotsToGroupResult(
        { id: `${c.id}-prereq-${i}`, name: pre.label, note: pre.note, slots },
        fillSlots(slots, holdings, 1, false).results,
      );
    });

    const { earned, pending, waivedCredits, creditsRequired } = scoreGroups(groups, c.credits, scoreCtx);

    const openGroups = groups.filter((g) => !g.satisfied);
    const remainingOptions = [...new Set(openGroups.flatMap((g) => g.options ?? []))];
    const shortfall = (g: GroupResult) => Math.max(0, g.required - g.completed);
    const remainingCourseCount = openGroups.filter((g) => g.unit === "courses").reduce((n, g) => n + shortfall(g), 0);
    const remainingCredits = openGroups.filter((g) => g.unit === "credits").reduce((n, g) => n + shortfall(g), 0);

    return {
      id: c.id,
      name: c.name,
      center: c.center,
      centerId: c.centerId,
      kind: c.kind,
      creditsRequired,
      creditsWaived: waivedCredits,
      creditsEarned: earned,
      creditsInProgress: pending,
      percent: creditsRequired > 0 ? Math.round((earned / creditsRequired) * 100) : 100,
      satisfied: groups.every((g) => g.satisfied),
      groups,
      prerequisites,
      remainingOptions,
      remainingCourseCount,
      remainingCredits,
    };
  });

  // Totals come straight from the record, so they always match the transcript.
  const totalEarned = holdings.filter((h) => earnsCredit(h.status)).reduce((n, h) => n + h.credits, 0);
  const totalPending = holdings.filter((h) => isPending(h.status)).reduce((n, h) => n + h.credits, 0);
  const excluded = holdings.filter((h) => !canCount(h));
  const retakeNeeded = holdings.filter((h) => needsRetake(h.status));
  const waivedHoldings = holdings.filter((h) => isWaived(h.status));
  // A course the new requirements name by its own code is accepted directly,
  // so it is not lacking an equivalent even though no rule mentions it.
  const requirementCodes = requirementCodesFor(program);
  const noEquivalent = normalization.unmapped.filter((h) => !requirementCodes.has(h.code));

  // Graduation asks for one Center's Foundations and Core. A concentration
  // inside the Center is optional, so the Center is scored on its own.
  const centers: CenterResult[] = (req.centers ?? []).map((b) => {
    const groups = b.groups.map((g) => evaluateGroup(g, holdings));
    const scored = scoreGroups(groups, b.credits, scoreCtx);
    const openGroups = groups.filter((g) => !g.satisfied);
    return {
      id: b.id,
      name: b.name,
      publishedUnder: b.publishedUnder,
      note: b.note,
      creditsRequired: scored.creditsRequired,
      creditsWaived: scored.waivedCredits,
      creditsEarned: scored.earned,
      creditsInProgress: scored.pending,
      percent: scored.creditsRequired > 0 ? Math.round((scored.earned / scored.creditsRequired) * 100) : 100,
      satisfied: groups.every((g) => g.satisfied),
      groups,
      remainingCourseCount: openGroups
        .filter((g) => g.unit === "courses")
        .reduce((n, g) => n + Math.max(0, g.required - g.completed), 0),
      remainingCredits: openGroups
        .filter((g) => g.unit === "credits")
        .reduce((n, g) => n + Math.max(0, g.required - g.completed), 0),
    };
  });

  const pillarName = (id: string, fallback: string) =>
    req.pillars.find((p) => p.id === id)?.name ?? fallback;

  const pillars: PillarResult[] = [
    {
      id: "if",
      name: pillarName("if", "Intellectual Foundations"),
      creditsRequired: ifRequired,
      creditsEarned: ifEarned,
      creditsInProgress: ifPending,
      creditsWaived: ifWaived,
      satisfied: ifGroups.every((g) => g.satisfied),
    },
    {
      id: "major",
      name: pillarName("major", "Liberal Studies Major"),
      creditsRequired: majorRequired,
      creditsEarned: majorEarned,
      creditsInProgress: majorPending,
      creditsWaived: -displacedCredits,
      satisfied: majorSatisfied,
    },
    {
      id: "polaris",
      name: pillarName("polaris", "Polaris"),
      creditsRequired: polarisRequired,
      creditsEarned: polarisEarned,
      creditsInProgress: polarisPending,
      creditsWaived: polarisWaived,
      satisfied: polarisSatisfied,
    },
  ];

  return {
    program,
    normalization,
    excluded,
    retakeNeeded,
    waived: { courses: waivedHoldings, creditsToReplace: displacedCredits },
    noEquivalent,
    intellectualFoundations: {
      groups: ifGroups,
      creditsRequired: ifRequired,
      creditsWaived: ifWaived,
      creditsEarned: ifEarned,
      creditsInProgress: ifPending,
      satisfied: ifGroups.every((g) => g.satisfied),
      countedCourses: ifCounted,
      legacyProvision: {
        applies: legacyProvisionApplies,
        note: legacyIf.note,
        additionalCredits: legacyIf.additionalCredits,
      },
    },
    polaris: {
      creditsRequired: polarisRequired,
      creditsWaived: polarisWaived,
      creditsEarned: polarisEarned,
      creditsInProgress: polarisPending,
      satisfied: polarisSatisfied,
      countedCourses: polarisCounted,
      required: polarisFill.results,
      buildCreditsRequired: req.polaris.buildCredits,
      buildCreditsEarned: buildEarned,
      equivalentCreditsUsed: equivalentUsed,
      equivalentCap: req.polaris.buildEquivalentCap,
      note: req.polaris.note,
    },
    major: {
      creditsRequired: majorRequired,
      creditsAdded: displacedCredits,
      creditsEarned: majorEarned,
      creditsInProgress: majorPending,
      satisfied: majorSatisfied,
      countedCourses: majorPool,
      rules: majorRules,
      note: req.major.note,
    },
    pillars,
    concentrations,
    centers,
    totals: {
      required: req.totalCredits,
      earned: totalEarned,
      inProgress: totalPending,
      remaining: Math.max(0, req.totalCredits - totalEarned),
    },
  };
}

/** Why a suggested course earns its place in the list. */
export type SuggestionTier = "required" | "committed" | "considering" | "open";

/**
 * What each tier is worth when scoring a course that closes several
 * requirements. Required work and work inside a committed target weigh the
 * same, because committing to something makes it required in everything but
 * name. Considering counts for something but must never displace the plan, and
 * untargeted work is only a tie-breaker.
 */
const TIER_WEIGHT: Record<SuggestionTier, number> = {
  required: 3,
  committed: 3,
  considering: 1,
  open: 0.5,
};

/**
 * Which label wins when one course serves several targets at once, weakest
 * first. Kept apart from the weights: required and committed score the same,
 * but a course the student must take should still say so.
 */
const TIER_PRECEDENCE: SuggestionTier[] = ["open", "considering", "committed", "required"];

const outranks = (a: SuggestionTier, b: SuggestionTier) =>
  TIER_PRECEDENCE.indexOf(a) > TIER_PRECEDENCE.indexOf(b);

interface Suggestion {
  code: string;
  /** How many still-open requirements this course would close. */
  count: number;
  forWhat: string[];
  required: boolean;
  tier: SuggestionTier;
  score: number;
  /** Whether Foundations is one of the requirements it closes. */
  servesFoundations: boolean;
}

/** Take from two lists in turn, so neither one crowds the other out. */
function interleave(a: Suggestion[], b: Suggestion[]): Suggestion[] {
  const out: Suggestion[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/**
 * Courses that would close the most still-open requirements, weighted by what
 * the student is aiming at. Foundations are required of everyone; beyond that,
 * a committed Center or concentration decides what counts as the plan, and
 * anything only being considered ranks below it.
 */
export function suggestNextCourses(audit: AuditResult, targets: Targets = {}, limit = 12) {
  const score = new Map<string, Suggestion>();

  const add = (code: string, label: string, tier: SuggestionTier, foundations = false) => {
    const entry =
      score.get(code) ??
      { code, count: 0, forWhat: [], required: false, tier: "open" as SuggestionTier, score: 0, servesFoundations: false };
    entry.count++;
    entry.score += TIER_WEIGHT[tier];
    if (foundations) entry.servesFoundations = true;
    if (outranks(tier, entry.tier)) entry.tier = tier;
    if (tier === "required") {
      entry.required = true;
      entry.forWhat.unshift(label);
    } else {
      entry.forWhat.push(label);
    }
    score.set(code, entry);
  };

  const walk = (groups: GroupResult[], name: string, tier: SuggestionTier, foundations = false) => {
    for (const g of groups) {
      if (g.satisfied) continue;
      for (const code of g.options ?? []) add(code, `${name}: ${g.name}`, tier, foundations);
    }
  };

  // Everyone finishes Foundations, whatever they are aiming at.
  walk(audit.intellectualFoundations.groups, "Intellectual Foundations", "required", true);

  const chosen = audit.concentrations.filter((c) => targets[c.id]);
  // Committing to a concentration commits you to the Center it sits inside.
  const impliedCenters = new Set(
    chosen
      .filter((c) => targets[c.id] === "committed")
      .map((c) => c.centerId)
      .filter((id): id is string => Boolean(id)),
  );
  const anyCenterElected = impliedCenters.size > 0 || audit.centers.some((b) => targets[b.id]);

  // A Center's Foundations and Core are required, but only for the one Center
  // the student elects. Until they elect one, every Center still counts, since
  // there is no way to tell which will be required.
  for (const b of audit.centers) {
    const tier: SuggestionTier | null =
      targets[b.id] === "committed" || impliedCenters.has(b.id)
        ? "required"
        : targets[b.id] === "considering"
          ? "considering"
          : anyCenterElected
            ? null
            : "required";
    if (tier) walk(b.groups, b.name, tier);
  }

  for (const c of chosen.length ? chosen : audit.concentrations) {
    const tier: SuggestionTier = !chosen.length
      ? "open"
      : targets[c.id] === "committed"
        ? "committed"
        : "considering";
    walk(c.groups, c.name, tier);
  }

  const byCode = (a: Suggestion, b: Suggestion) => a.code.localeCompare(b.code);
  const all = [...score.values()];

  // A course that closes several requirements at once is worth the most, and
  // the tiers break its ties: the plan ahead of the maybes.
  const doubleDuty = all
    .filter((e) => e.count > 1)
    .sort((a, b) => b.score - a.score || b.count - a.count || byCode(a, b));

  const singles = all.filter((e) => e.count === 1);
  // Required work splits two ways, and course codes sort the Center's Core
  // behind the whole Foundations backlog, so the two take turns instead.
  const required = interleave(
    singles.filter((e) => e.tier === "required" && e.servesFoundations).sort(byCode),
    singles.filter((e) => e.tier === "required" && !e.servesFoundations).sort(byCode),
  );
  const committed = singles.filter((e) => e.tier === "committed").sort(byCode);
  const considering = singles.filter((e) => e.tier === "considering").sort(byCode);
  const untargeted = singles.filter((e) => e.tier === "open").sort(byCode);

  // The Foundations backlog must not crowd out the courses the student chose,
  // so it alternates with them. Where nothing is chosen, every concentration
  // takes that side of the alternation instead.
  const plan = committed.length ? committed : untargeted;
  const tail = committed.length ? [...considering, ...untargeted] : considering;

  return [...doubleDuty, ...interleave(required, plan), ...tail]
    .slice(0, limit)
    .map((e) => ({ ...e, title: titleOf(e.code), credits: creditsOf(e.code), level: levelOf(e.code) }));
}

/**
 * Logged Build work in the form the audit reads. The credits come from the
 * entry and the requirement it satisfies comes from the code — the same
 * division the rest of the audit follows — so the code is taken from the
 * program's own Build course rather than written down here.
 */
export function buildLogAsCourses(log: BuildEntry[], program: ProgramId = "2026-2027"): TakenCourse[] {
  const code = getRequirements(program).polaris.buildCourses[0];
  if (!code) return [];
  return log
    .filter((e) => e.credits > 0)
    .map((e) => ({
      code,
      credits: e.credits,
      title: e.label?.trim() || "Polaris Build",
      status: e.status,
    }));
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
