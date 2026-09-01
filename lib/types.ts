export type Catalog = "2026-2027" | "legacy";

export interface Course {
  code: string;
  subject: string;
  number: string;
  title: string;
  credits: number;
  catalog: Catalog;
  page?: number;
  prerequisite?: string;
  source?: string;
  note?: string;
}

export interface CoursesFile {
  source: Record<string, string>;
  courses: Course[];
  legacyCourses: Course[];
}

/** One alternative is a set of new-catalog codes all awarded together. */
export type Grants = string[][];

export interface EquivalencyRule {
  from: string[];
  grants: Grants;
  kind: "equals" | "satisfies" | "elective" | "replaced";
  center: string;
  title: string;
  raw: string;
  electiveGrant?: { level: number };
  note?: string;
  inferred?: boolean;
  /**
   * Which program this rule belongs to. Absent means the old-catalog-to-new
   * mapping the equivalency document is about. "2024-2025" marks a rule that
   * holds inside the old catalog, between a special-topics number and the
   * numbered course whose content it delivered.
   */
  scope?: ProgramId;
  /**
   * Key of the official rule this one extends, when it adds a course to that
   * rule's outcome rather than standing on its own.
   */
  refines?: string;
  reason?: string;
  /** How well the two catalogs support a proposed mapping. */
  confidence?: "strong" | "moderate";
}

export interface EquivalenciesFile {
  source: string;
  rules: EquivalencyRule[];
}

export interface Slot {
  label: string | null;
  options: string[][];
}

export type ProgramId = "2026-2027" | "2024-2025";

export type RequirementGroup =
  | { id: string; name: string; type: "slots"; slots: Slot[]; choose?: number; page?: number; note?: string }
  | { id: string; name: string; type: "pick"; pool: string[]; choose: number; page?: number; note?: string }
  | {
      id: string;
      name: string;
      type: "oneOf";
      pools: { name: string; pool: string[] }[];
      choose: number;
      page?: number;
      note?: string;
    }
  /** "Complete N credits from this pool", used by the 2024-2025 program. */
  | { id: string; name: string; type: "credits"; minCredits: number; pool: string[]; page?: number; note?: string };

export interface Prerequisite {
  label: string;
  options: string[][];
  note?: string;
}

export interface Concentration {
  id: string;
  name: string;
  center: string;
  /** The Center block whose Foundations and Core this sits inside, if any. */
  centerId?: string;
  /** What the catalog declares for Center plus concentration together. */
  declaredWithCenter?: number;
  kind: "concentration" | "applied track";
  credits: number;
  lowerCredits: number;
  upperCredits: number;
  prerequisites: Prerequisite[];
  groups: RequirementGroup[];
  page?: number;
}

/**
 * A Center's Foundations and Core, which the 2024-2025 program requires on
 * their own: electing a concentration inside the Center is optional.
 */
export interface Center {
  id: string;
  name: string;
  credits: number;
  groups: RequirementGroup[];
  /** The Areas of Concentration this listing is printed under. */
  publishedUnder: string[];
  page?: number;
  note?: string;
}

export interface GradingPolicy {
  page?: number;
  scale: string;
  passingScore: number;
  minimumCsa: number;
  bands: { min: number; max: number; letters: string[]; descriptor: string }[];
  notations: Record<string, { meaning: string; earnsCredit: boolean; note?: string }>;
  retake: string;
  withdrawalLimits: { perYear: number; total: number; page?: number };
}

export interface Requirements {
  program: ProgramId;
  /** Short name for the catalog, shown on the program switch. */
  label?: string;
  grading: GradingPolicy;
  corrections?: Record<string, { code: string; note: string }>;
  electives?: { credits: number; note: string };
  source: string;
  totalCredits: number;
  pillars: { id: string; name: string; credits: number }[];
  intellectualFoundations: {
    credits: number;
    groups: RequirementGroup[];
    inferredOptions: Record<string, string>;
    legacyProvision: { note: string; legacyCourses: string[]; additionalCredits: number };
  };
  major: {
    credits: number;
    page?: number;
    note?: string;
    rules: { id: string; label: string; minCredits: number; levels: number[] }[];
  };
  polaris: {
    credits: number;
    page?: number;
    required: Slot[];
    buildCredits: number;
    buildCourses: string[];
    buildEquivalents: string[];
    buildEquivalentCap: number;
    note: string;
  };
  concentrations: Concentration[];
  /** Present where the program requires a Center rather than a concentration. */
  centers?: Center[];
}

/**
 * What a course on the record is currently worth.
 *   completed   - passed and earned its credits
 *   in-progress - being taken now
 *   incomplete  - graded I; no credit until the work is finished
 *   failed      - scored below 60, or graded U; must be retaken to count
 *   withdrawn   - graded W; no credit, no CSA impact
 *   audit       - graded AU; participated without earning credit
 *   waived      - excused from taking it; the requirement is closed, but it
 *                 earns no credit, so the 180 must still be reached elsewhere
 */
export type CourseStatus =
  | "completed"
  | "in-progress"
  | "incomplete"
  | "failed"
  | "withdrawn"
  | "audit"
  | "waived";

/** Only completed work earns credit toward the 180. */
export function earnsCredit(status: CourseStatus): boolean {
  return status === "completed";
}

/** Work that may yet earn credit, so it shows as pending rather than missing. */
export function isPending(status: CourseStatus): boolean {
  return status === "in-progress" || status === "incomplete";
}

/** Work that cannot count as it stands. */
export function needsRetake(status: CourseStatus): boolean {
  return status === "failed";
}

/**
 * A requirement the student was excused from. It closes the requirement
 * without earning credit, which is exactly what makes it different from
 * completed work: the course stops being listed as still required, and the
 * credits it would have carried have to come from somewhere else.
 */
export function isWaived(status: CourseStatus): boolean {
  return status === "waived";
}

/** Work that can fill a requirement: earned, still under way, or waived. */
export function fillsRequirement(status: CourseStatus): boolean {
  return earnsCredit(status) || isPending(status) || isWaived(status);
}

/**
 * How seriously a student is pursuing a Center or a concentration.
 * Committing says "this is the plan"; considering says "show me, but do not
 * let it outrank the plan."
 */
export type Interest = "committed" | "considering";

/** The Centers and concentrations a student is aiming at, by id. */
export type Targets = Record<string, Interest>;

/**
 * Project work logged toward Polaris Build. Build is a credit total rather
 * than a class, so it accrues in whatever amounts the work is granted, and it
 * is kept apart from the course record so that re-uploading a transcript
 * cannot wipe a term's worth of logging.
 */
export interface BuildEntry {
  credits: number;
  /** What the credits were for, in the student's own words. */
  label?: string;
  status: "completed" | "in-progress";
}

/** A course the student has on their record. */
export interface TakenCourse {
  code: string;
  /** Transcript title, used to disambiguate reused special-topic codes. */
  title?: string;
  credits?: number;
  /** Credits the course was worth, even when none were earned. */
  attempted?: number;
  term?: string;
  grade?: string;
  status: CourseStatus;
}

/** A new-catalog course credited to the student, and why. */
export interface Grant {
  code: string;
  credits: number;
  level: number;
  from: string[];
  via: "direct" | "equivalency" | "inferred";
  explanation: string;
  status: CourseStatus;
}

/** Credit with no specific course attached (generic elective). */
export interface ElectiveCredit {
  from: string;
  title: string;
  credits: number;
  level: number;
  explanation: string;
  status: CourseStatus;
  mapped: boolean;
}
