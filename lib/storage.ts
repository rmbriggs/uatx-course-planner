import { normalizeCode } from "./catalog";
import { isAmbiguousCode } from "./equivalency";
import type { CourseStatus, TakenCourse } from "./types";

const KEY = "uatx-degree-audit.v1";

export interface SavedState {
  taken: TakenCourse[];
  termsRemaining: number;
  useInferred: boolean;
  focus: string[];
}

export const emptyState: SavedState = {
  taken: [],
  termsRemaining: 9,
  useInferred: true,
  focus: [],
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
    const bits = [t.code.replace(/\s+/g, ""), t.credits ?? "", t.status === "in-progress" ? "p" : "c"];
    // The title is only needed where one code covers several courses.
    return t.title && isAmbiguousCode(t.code)
      ? `${bits.join(":")}:${encodeURIComponent(t.title.slice(0, 80))}`
      : bits.join(":");
  });
  const params = new URLSearchParams();
  params.set("c", parts.join(","));
  if (state.termsRemaining !== emptyState.termsRemaining) params.set("t", String(state.termsRemaining));
  if (!state.useInferred) params.set("i", "0");
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
      status: (status === "p" ? "in-progress" : "completed") as CourseStatus,
      title: title ? decodeURIComponent(title) : undefined,
    });
  }

  return {
    taken,
    termsRemaining: Number(params.get("t") ?? emptyState.termsRemaining) || emptyState.termsRemaining,
    useInferred: params.get("i") !== "0",
    focus: (params.get("f") ?? "").split(".").filter(Boolean),
  };
}
