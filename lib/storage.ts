import { normalizeCode } from "./catalog";
import { isAmbiguousCode } from "./equivalency";
import type {
  BuildEntry,
  CourseStatus,
  Interest,
  Plan,
  PlanTier,
  ProgramId,
  TakenCourse,
  Targets,
} from "./types";

const KEY = "uatx-degree-audit.v1";

// Single letters keep a shared link short.
const STATUS_CODE: Record<CourseStatus, string> = {
  completed: "c",
  "in-progress": "p",
  incomplete: "n",
  failed: "f",
  withdrawn: "w",
  audit: "a",
  waived: "v",
};
const CODE_STATUS: Record<string, CourseStatus> = Object.fromEntries(
  Object.entries(STATUS_CODE).map(([k, v]) => [v, k as CourseStatus]),
) as Record<string, CourseStatus>;

const INTEREST_CODE: Record<Interest, string> = { committed: "c", considering: "s" };
const CODE_INTEREST: Record<string, Interest> = { c: "committed", s: "considering" };

// The plan's own letters. Deliberately not the c/s that targets use: a course
// you will take and a concentration you are aiming at are not one scale, and
// a link can carry both at once.
const PLAN_CODE: Record<PlanTier, string> = { definitely: "d", maybe: "m", considering: "c" };
const CODE_PLAN: Record<string, PlanTier> = { d: "definitely", m: "maybe", c: "considering" };

export interface SavedState {
  taken: TakenCourse[];
  termsRemaining: number;
  useInferred: boolean;
  /** Centers and concentrations being pursued, and how seriously. */
  targets: Targets;
  /** Polaris Build credits logged by hand, kept out of `taken` so that a
   *  transcript upload, which replaces the course record, leaves them alone. */
  buildLog: BuildEntry[];
  /** Course Score Average, read from an uploaded transcript. */
  csa?: number;
  /** Which catalog to measure against. */
  program: ProgramId;
  /** Courses picked for a term, keyed "termId:CODE". */
  plan: Plan;
  /**
   * The term being planned, or null for "where you stand today". Saved
   * locally but never shared: a link carries what is true and what is
   * planned, and the receiver projects from their own record.
   */
  planningTerm: string | null;
}

export const emptyState: SavedState = {
  taken: [],
  termsRemaining: 9,
  useInferred: true,
  targets: {},
  buildLog: [],
  program: "2026-2027",
  plan: {},
  planningTerm: null,
};

export function loadLocal(): SavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedState & { focus?: string[] };
    const state: SavedState = { ...emptyState, ...saved };
    // Before there were two tiers, one flat "focus" list meant the same thing
    // as committing, so an older browser's saved plan carries over as that.
    if (!saved.targets && Array.isArray(saved.focus)) {
      state.targets = Object.fromEntries(saved.focus.map((id) => [id, "committed" as Interest]));
    }
    delete (state as SavedState & { focus?: string[] }).focus;
    return state;
  } catch {
    return null;
  }
}

export function saveLocal(state: SavedState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private windows and blocked site data are fine; the page still works.
  }
}

/**
 * Compact share format: each course is `CODE:credits:status`, joined by commas.
 * Titles are dropped except where a code is reused across different courses,
 * so a shared link stays short and carries no personal detail beyond courses.
 */
export function encodeState(state: SavedState): string {
  const parts = state.taken.map((t) => {
    const bits = [t.code.replace(/\s+/g, ""), t.credits ?? "", STATUS_CODE[t.status] ?? "c"];
    // The title is only needed where one code covers several courses.
    return t.title && isAmbiguousCode(t.code)
      ? `${bits.join(":")}:${encodeURIComponent(t.title.slice(0, 80))}`
      : bits.join(":");
  });
  const params = new URLSearchParams();
  params.set("c", parts.join(","));
  if (state.termsRemaining !== emptyState.termsRemaining) params.set("t", String(state.termsRemaining));
  if (!state.useInferred) params.set("i", "0");
  if (state.csa !== undefined) params.set("g", String(state.csa));
  if (state.program !== emptyState.program) params.set("p", state.program);
  const targets = Object.entries(state.targets).map(([id, tier]) => `${id}~${INTEREST_CODE[tier]}`);
  if (targets.length) params.set("f", targets.join("."));
  const planned = Object.entries(state.plan).map(
    ([key, tier]) => `${key.replace(/\s+/g, "")}~${PLAN_CODE[tier]}`,
  );
  if (planned.length) params.set("pl", planned.join("."));
  if (state.buildLog.length) {
    params.set(
      "b",
      state.buildLog
        .map((e) =>
          [e.credits, STATUS_CODE[e.status], e.label ? encodeURIComponent(e.label.slice(0, 60)) : ""].join(":"),
        )
        .join(","),
    );
  }
  return params.toString();
}

export function decodeState(search: string): SavedState | null {
  const params = new URLSearchParams(search);
  const raw = params.get("c");
  if (raw === null) return null;

  const taken: TakenCourse[] = [];
  for (const chunk of raw.split(",")) {
    if (!chunk.trim()) continue;
    const [code, credits, status, title] = chunk.split(":");
    const normalized = normalizeCode(code);
    if (!/^[A-Z]{2,5} \d{3,4}[A-Z]?$/.test(normalized)) continue;
    taken.push({
      code: normalized,
      credits: credits ? Number(credits) : undefined,
      status: CODE_STATUS[status] ?? "completed",
      title: title ? decodeURIComponent(title) : undefined,
    });
  }

  return {
    taken,
    termsRemaining: Number(params.get("t") ?? emptyState.termsRemaining) || emptyState.termsRemaining,
    useInferred: params.get("i") !== "0",
    targets: parseTargets(params.get("f")),
    buildLog: parseBuildLog(params.get("b")),
    csa: params.get("g") ? Number(params.get("g")) : undefined,
    program: params.get("p") === "2024-2025" ? "2024-2025" : "2026-2027",
    plan: parsePlan(params.get("pl")),
    planningTerm: null,
  };
}

/**
 * `termId:CODE~tier`, one entry per dot. An entry whose tier letter or course
 * code is not one of ours is dropped rather than guessed at, the same as a
 * malformed course in `c=`.
 */
function parsePlan(raw: string | null): Plan {
  const out: Plan = {};
  for (const chunk of (raw ?? "").split(".")) {
    if (!chunk) continue;
    const [key, code] = chunk.split("~");
    if (!key || !code) continue;
    const at = key.indexOf(":");
    if (at <= 0) continue;
    const tier = CODE_PLAN[code];
    if (!tier) continue;
    const normalized = normalizeCode(key.slice(at + 1));
    if (!/^[A-Z]{2,5} \d{3,4}[A-Z]?$/.test(normalized)) continue;
    out[`${key.slice(0, at)}:${normalized}`] = tier;
  }
  return out;
}

/**
 * `id~c` is committed, `id~s` is considering. A bare id comes from a link
 * shared before the two tiers existed, when there was only one kind of
 * interest, so it reads as committed.
 */
function parseTargets(raw: string | null): Targets {
  const out: Targets = {};
  for (const chunk of (raw ?? "").split(".")) {
    if (!chunk) continue;
    const [id, code] = chunk.split("~");
    if (!id) continue;
    out[id] = CODE_INTEREST[code] ?? "committed";
  }
  return out;
}

/** `credits:status:label`, one entry per comma. */
function parseBuildLog(raw: string | null): BuildEntry[] {
  const out: BuildEntry[] = [];
  for (const chunk of (raw ?? "").split(",")) {
    if (!chunk.trim()) continue;
    const [credits, status, label] = chunk.split(":");
    const amount = Number(credits);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      credits: amount,
      status: CODE_STATUS[status] === "in-progress" ? "in-progress" : "completed",
      label: label ? decodeURIComponent(label) : undefined,
    });
  }
  return out;
}
