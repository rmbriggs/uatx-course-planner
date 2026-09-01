import { normalizeCode } from "./catalog";
import { isAmbiguousCode } from "./equivalency";
import type { CourseStatus, ProgramId, TakenCourse } from "./types";

const KEY = "uatx-degree-audit.v1";

// Single letters keep a shared link short.
const STATUS_CODE: Record<CourseStatus, string> = {
  completed: "c",
  "in-progress": "p",
  incomplete: "n",
  failed: "f",
  withdrawn: "w",
  audit: "a",
};
const CODE_STATUS: Record<string, CourseStatus> = Object.fromEntries(
  Object.entries(STATUS_CODE).map(([k, v]) => [v, k as CourseStatus]),
) as Record<string, CourseStatus>;

export interface SavedState {
  taken: TakenCourse[];
  termsRemaining: number;
  useInferred: boolean;
  focus: string[];
  /** Course Score Average, read from an uploaded transcript. */
  csa?: number;
  /** Which catalog to measure against. */
  program: ProgramId;
}

export const emptyState: SavedState = {
  taken: [],
  termsRemaining: 9,
  useInferred: true,
  focus: [],
  program: "2026-2027",
};

export function loadLocal(): SavedState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return { ...emptyState, ...(JSON.parse(raw) as SavedState) };
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
  if (state.focus.length) params.set("f", state.focus.join("."));
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
    focus: (params.get("f") ?? "").split(".").filter(Boolean),
    csa: params.get("g") ? Number(params.get("g")) : undefined,
    program: params.get("p") === "2024-2025" ? "2024-2025" : "2026-2027",
  };
}
