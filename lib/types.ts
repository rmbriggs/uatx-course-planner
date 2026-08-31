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
  reason?: string;
}

export interface EquivalenciesFile {
  source: string;
  rules: EquivalencyRule[];
}

export interface Slot {
  label: string | null;
  options: string[][];
}

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
    };

export interface Prerequisite {
  label: string;
  options: string[][];
  note?: string;
}

export interface Concentration {
  id: string;
  name: string;
  center: string;
  kind: "concentration" | "applied track";
  credits: number;
  lowerCredits: number;
  upperCredits: number;
  prerequisites: Prerequisite[];
  groups: RequirementGroup[];
  page?: number;
}

export interface Requirements {
  program: string;
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
}

export type CourseStatus = "completed" | "in-progress";

/** A course the student has on their record. */
export interface TakenCourse {
  code: string;
  /** Transcript title, used to disambiguate reused special-topic codes. */
  title?: string;
  credits?: number;
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
