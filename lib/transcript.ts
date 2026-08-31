import { getCourse, normalizeCode, requirements } from "./catalog";
import { earnsCredit, needsRetake, type CourseStatus, type TakenCourse } from "./types";

export interface ParsedRow extends TakenCourse {
  attempted?: number;
  /** Row matched a known course code. */
  recognized: boolean;
  /** Raw source line(s), so a student can check a questionable match. */
  raw: string;
}

export interface TranscriptParseResult {
  rows: ParsedRow[];
  terms: string[];
  /** Earned-credit totals the document itself reports, for cross-checking. */
  reportedEarnedCredits?: number;
  /** Course Score Average, which UATX uses in place of a GPA. */
  cumulativeCsa?: number;
  warnings: string[];
}

/**
 * Read a transcript grade against the catalog's scale (pp. 19-20).
 *
 * Courses are scored 0-100 and anything below 60 is failing: "If a student
 * fails a required course (grade of below 60), the student must retake it to
 * satisfy degree requirements." A D (60-72) is poor but still passes, so it is
 * not treated as a failure.
 */
export function classifyGrade(grade: string | undefined, earned: number, attempted: number): CourseStatus {
  const g = (grade ?? "").trim().toUpperCase();

  if (g === "IP") return "in-progress";
  if (g === "W") return "withdrawn";
  if (g === "AU") return "audit";
  if (g === "I") return "incomplete";
  if (g === "U" || g === "F" || g === "NC") return "failed";
  if (g === "P" || g === "S") return "completed";

  const score = Number(g);
  if (Number.isFinite(score) && g !== "") {
    return score < requirements.grading.passingScore ? "failed" : "completed";
  }

  // Letter grades, should a transcript ever carry them instead of scores.
  if (/^[A-D][+-]?$/.test(g)) return "completed";

  // Nothing usable in the grade column: fall back to whether credit was given.
  if (earned > 0) return "completed";
  return attempted > 0 ? "in-progress" : "completed";
}

// "INF 1100  Chaos and Civilization   4.50  4.50  91  409.50"
// The three trailing numeric columns plus a grade are the reliable anchor; the
// subject code may appear without its number when Populi wraps the column.
const ROW = new RegExp(
  String.raw`^\s*([A-Z]{2,5})(?:\s+(\d{3,4}[A-Z]?))?\s+` + // subject, maybe number
    String.raw`(.*?)\s+` + //                                 course name
    String.raw`(\d+\.\d{2})\s+` + //                          attempted credits
    String.raw`(\d+\.\d{2})\s+` + //                          earned credits
    String.raw`([A-Za-z]{1,3}|\d{1,3}(?:\.\d+)?)\s+` + //     grade (numeric, letter, or IP)
    String.raw`([\d,]+\.\d{2})\s*$`, //                       grade points
);

const CONTINUATION = /^\s*(\d{3,4}[A-Z]?)\s*(.*?)\s*$/;
const TERM = /^\s*(\d{4}\s*-\s*\d{4}):\s*(.+?)\s*(?:-\s*\d{1,2}\/\d{1,2}\/\d{4}.*)?$/;
const SKIP = /^\s*(Course\b|Totals\b|Program Summary|Credits\s*$|Attempted|Produced by|RECIPIENT|Student:|Student ID|Birthdate|Enrolled:|Degrees|B\.A\.|Major:|Concentration:|University of Austin|Unofficial Transcript|Page \d)/i;
const RESIDENT = /^\s*(?:Resident|Total)\s+(.+)$/;
const FIGURE_TOKEN = /[\d,]+\.\d{2}/g;
const CUMULATIVE = /Cumulative\s*(?:GPA|CSA)\s*:?\s*([\d,]+\.\d{2})/i;

function num(s: string): number {
  return Number(s.replace(/,/g, ""));
}

function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse the text of a UATX (Populi) transcript. Also accepts loosely pasted
 * text, since the same anchor works when the column layout collapses.
 */
export function parseTranscript(text: string): TranscriptParseResult {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const terms: string[] = [];
  const warnings: string[] = [];
  let currentTerm: string | undefined;
  let reportedEarnedCredits: number | undefined;
  let cumulativeCsa: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const cumulative = CUMULATIVE.exec(line);
    if (cumulative) cumulativeCsa = num(cumulative[1]);

    const resident = RESIDENT.exec(line);
    if (resident && !ROW.test(line)) {
      // Program summary: attempted, earned, grade points, CSA.
      const figures = resident[1].match(FIGURE_TOKEN) ?? [];
      if (figures.length >= 2) reportedEarnedCredits = num(figures[1]);
      if (figures.length >= 4) cumulativeCsa = num(figures[3]);
      continue;
    }

    const term = TERM.exec(line);
    if (term && !ROW.test(line)) {
      currentTerm = cleanName(term[2]).replace(/\s*-\s*$/, "");
      if (currentTerm && !terms.includes(currentTerm)) terms.push(currentTerm);
      continue;
    }

    if (SKIP.test(line)) continue;

    const m = ROW.exec(line);
    if (!m) continue;

    const [, subject, numberOnLine, namePart, attempted, earned, grade] = m;
    let number = numberOnLine;
    let name = cleanName(namePart);
    let raw = line;

    // Populi wraps a long course column: the number (and the rest of the
    // name) lands on the following line.
    if (!number) {
      const next = lines[i + 1];
      const cont = next ? CONTINUATION.exec(next) : null;
      if (cont) {
        number = cont[1];
        if (cont[2]) name = cleanName(`${name} ${cont[2]}`);
        raw = `${line}\n${next}`;
        i++;
      }
    }

    if (!number) {
      warnings.push(`Could not find a course number for "${cleanName(line)}".`);
      continue;
    }

    const code = normalizeCode(`${subject} ${number}`);
    const known = getCourse(code);
    const status = classifyGrade(grade, num(earned), num(attempted));

    rows.push({
      code,
      title: name || known?.title,
      // The credit value of the course, whether or not it was earned; `status`
      // decides whether it counts.
      credits: num(attempted) || known?.credits,
      attempted: num(attempted),
      term: currentTerm,
      grade,
      status,
      recognized: Boolean(known),
      raw,
    });
  }

  const unknown = rows.filter((r) => !r.recognized);
  if (unknown.length) {
    warnings.push(
      `${unknown.length} course${unknown.length === 1 ? "" : "s"} did not match the catalog: ` +
        unknown.map((r) => r.code).join(", ") + ". Check these before trusting the audit.",
    );
  }

  const failed = rows.filter((r) => needsRetake(r.status));
  if (failed.length) {
    warnings.push(
      `${failed.length} course${failed.length === 1 ? " was" : "s were"} failed and earned no credit: ` +
        failed.map((r) => `${r.code} (${r.grade})`).join(", ") +
        ". Required courses below 60 must be retaken to satisfy degree requirements.",
    );
  }

  const earnedSum = rows
    .filter((r) => earnsCredit(r.status))
    .reduce((n, r) => n + (r.credits ?? 0), 0);
  if (reportedEarnedCredits !== undefined && Math.abs(earnedSum - reportedEarnedCredits) > 0.01) {
    warnings.push(
      `Parsed ${earnedSum} earned credits but the transcript reports ${reportedEarnedCredits}. Some rows may be missing.`,
    );
  }

  return { rows, terms, reportedEarnedCredits, cumulativeCsa, warnings };
}

/** Accepts "INF 1100, ALT 1010; STM 2102" and newline-separated lists. */
export function parseCodeList(text: string): TakenCourse[] {
  const out: TakenCourse[] = [];
  const seen = new Set<string>();
  const re = /([A-Z]{2,5})\s*[- ]?\s*(\d{3,4}[A-Z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const code = normalizeCode(`${m[1]} ${m[2]}`);
    if (seen.has(code) || !getCourse(code)) continue;
    seen.add(code);
    out.push({ code, status: "completed", credits: getCourse(code)?.credits });
  }
  return out;
}
