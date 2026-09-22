# Plan Next Term — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student skip ahead one term — assuming this term's courses pass — and build a next-term shortlist from the courses actually on offer, sorted into Definitely, Maybe and Considering.

**Architecture:** A new generated `data/offerings.json` records which courses run in Winter 26/27 and D-Term 26/27. `auditDegree` is already a pure function of the course list, so "skip ahead" is a second call with `in-progress` rewritten to `completed` — no audit internals change. The plan itself is a new `plan` map on saved state; Definitely feeds forward into the projection, Maybe and Considering are what-if only.

**Tech Stack:** Next.js 15 (static, client-only), React 19, TypeScript, vitest, Python 3.12 for the data scripts.

**Spec:** `docs/superpowers/specs/2026-09-21-plan-next-term-design.md`

## Global Constraints

- **Generated data must reproduce byte-for-byte.** CI runs `npm run data` and fails if `data/` changes. A correction goes in a script's override table, never in the JSON.
- **Scripts fail loudly.** An unrecognised code or an unparseable line raises; it is never guessed at or silently skipped.
- **No new runtime dependency.** `package.json` dependencies stay as they are. No new Python dependency either — `scripts/requirements.txt` keeps `python-docx==1.2.0` only, so the extractor is stdlib.
- **Client-only.** No server, no network at runtime. The record lives in `localStorage`.
- **Existing share links keep working.** A key absent from the URL means the feature is off, never an error.
- **Terms:** ids are `winter-2627` and `dterm-2627`; names are `Winter 26/27` and `D-Term 26/27`. 58 Winter offerings, 5 D-Term, 63 total.
- **Tier vocabulary:** `definitely`, `maybe`, `considering` — the student's own words. Share-link letters `d`, `m`, `c`.
- Run `npm test` from the worktree root. It must stay green; the suite is 138 tests before this work.

---

### Task 1: Offerings data and extractor

**Files:**
- Create: `data/raw/offerings_winter_dterm_2627.txt`
- Create: `scripts/extract_offerings.py`
- Create: `data/offerings.json` (generated)
- Modify: `package.json` (the `data` script)
- Test: `lib/offerings.data.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `data/offerings.json` with `{ source: string, terms: {id,name,order}[], offerings: Offering[] }` where an offering is `{ term, code, catalogCode, title, credits, faculty, department, note, sections }`. `catalogCode` is `string | null`. `sections` is always `[]` from this source.

- [ ] **Step 1: Produce the text dump**

The PDF is at `~/Downloads/Winter and D-Term 26/27 - Course Descriptions.pdf`. It has a real text layer — no OCR.

```bash
pdftotext -layout "$HOME/Downloads/Winter and D-Term 26/27 - Course Descriptions.pdf" \
  data/raw/offerings_winter_dterm_2627.txt
wc -l data/raw/offerings_winter_dterm_2627.txt   # expect 883
```

This is a manual step by design, the same as `scripts/ocr.swift`. `npm run data` parses the dump, never the PDF, so CI needs no PDF tooling.

- [ ] **Step 2: Write the failing data test**

Create `lib/offerings.data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import offeringsFile from "@/data/offerings.json";
import { getCourse } from "./catalog";

const file = offeringsFile as {
  source: string;
  terms: { id: string; name: string; order: number }[];
  offerings: {
    term: string; code: string; catalogCode: string | null; title: string;
    credits: number; faculty: string[]; department: string;
    note: string | null; sections: unknown[];
  }[];
};

describe("term offerings", () => {
  it("has both terms, in order", () => {
    expect(file.terms.map((t) => t.id)).toEqual(["winter-2627", "dterm-2627"]);
    expect(file.terms.map((t) => t.name)).toEqual(["Winter 26/27", "D-Term 26/27"]);
  });

  it("carries every course the descriptions list", () => {
    expect(file.offerings.length).toBe(63);
    const byTerm = (id: string) => file.offerings.filter((o) => o.term === id).length;
    expect(byTerm("winter-2627")).toBe(58);
    expect(byTerm("dterm-2627")).toBe(5);
  });

  it("gives every offering a term, a department, a title and credits", () => {
    for (const o of file.offerings) {
      expect(file.terms.some((t) => t.id === o.term), o.code).toBe(true);
      expect(o.department.length, o.code).toBeGreaterThan(2);
      expect(o.title.length, o.code).toBeGreaterThan(2);
      expect(o.credits, o.code).toBeGreaterThan(0);
      expect(o.credits, o.code).toBeLessThanOrEqual(18);
      expect(Array.isArray(o.faculty), o.code).toBe(true);
      expect(Array.isArray(o.sections), o.code).toBe(true);
    }
  });

  it("resolves every catalogCode it claims", () => {
    for (const o of file.offerings) {
      if (o.catalogCode === null) continue;
      expect(getCourse(o.catalogCode), `${o.code} -> ${o.catalogCode}`).toBeDefined();
    }
  });

  it("names exactly the two offerings the catalog does not list", () => {
    const orphans = file.offerings.filter((o) => o.catalogCode === null).map((o) => o.code);
    expect(orphans.sort()).toEqual(["LEAD 380A", "POLR 380A"]);
  });

  it("explains every uncatalogued offering", () => {
    for (const o of file.offerings.filter((x) => x.catalogCode === null)) {
      expect(o.note, o.code).toBeTruthy();
    }
  });

  it("agrees with the catalog on credits wherever both know a course", () => {
    for (const o of file.offerings) {
      if (!o.catalogCode) continue;
      const known = getCourse(o.catalogCode);
      // Special topics run at whatever weight the term gives them, so only
      // ordinary courses have to match the catalog.
      if (!known || /Special Topic/i.test(known.title)) continue;
      expect(o.credits, `${o.code} ${o.title}`).toBe(known.credits);
    }
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- offerings.data`
Expected: FAIL — `data/offerings.json` does not exist.

- [ ] **Step 4: Write the extractor**

Create `scripts/extract_offerings.py`. The three format variants below are real and were found in the dump — do not tighten these regexes.

```python
"""Parse a term's course-description dump into the offerings file.

Source (committed under data/raw/):
  offerings_winter_dterm_2627.txt   Winter and D-Term 26/27 Course Descriptions

The PDF has a real text layer, unlike both catalogs, so the dump is made with
    pdftotext -layout "<pdf>" data/raw/offerings_winter_dterm_2627.txt
which is a manual step: this script reads the dump, never the PDF.
"""
import json, re, sys
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT = Path(__file__).resolve().parent.parent / "data"
SOURCE = "offerings_winter_dterm_2627.txt"
LABEL = "Winter and D-Term 26/27 Course Descriptions, retrieved 2026-09-21"

# "AMCV 200: The American Founding", always at column 0.
CODE_RE = re.compile(r"^(?P<subj>[A-Z]{2,5}) (?P<num>\d{3}[A-Z]?): (?P<title>\S.*?)\s*$")

# "(3 Credits; Faculty: Wolf, Reznick, Hoffpauir)" and its three variants in
# this dump: lowercase "credits", a colon where the semicolon belongs
# (HIST 385B), and no "Faculty:" label at all (LEAD 380A).
CREDITS_RE = re.compile(
    r"^\(\s*(?P<cr>\d+(?:\.\d+)?)\s*credits?\s*[;:,]\s*"
    r"(?:Faculty\s*[:;]\s*)?(?P<fac>[^)]*?)\s*\)\s*$",
    re.IGNORECASE,
)

TERMS = [
    {"id": "winter-2627", "name": "Winter 26/27", "order": 1, "heading": "winter"},
    {"id": "dterm-2627", "name": "D-Term 26/27", "order": 2, "heading": "d-term"},
]
BY_HEADING = {t["heading"]: t for t in TERMS}

# Centered lines that are page furniture rather than a department.
FURNITURE = {"course descriptions"}

# Offerings whose code the 2026-2027 catalog does not list. They stay in the
# file and stay plannable, but they fill no named requirement, and the note
# says so. A new code appearing here fails the build until someone decides
# which of the two it is.
UNCATALOGUED = {
    "LEAD 380A": "The catalog lists no LEAD subject, so this cannot be matched to a "
                 "requirement. It still counts toward the term's credits.",
    "POLR 380A": "The catalog's POLR numbering stops at 313 before Polaris Gateway "
                 "(490), so this cannot be matched to a requirement. It still counts "
                 "toward the term's credits.",
}

# A lettered special topic is delivered under its base code's requirement:
# PHIL 380A is a PHIL 380. This mirrors getCourse()'s own fallback in lib.
LETTERED = re.compile(r"^([A-Z]{2,5} \d{3})[A-Z]$")


def catalog_codes() -> set[str]:
    data = json.loads((OUT / "courses.json").read_text())
    return {c["code"] for c in data["courses"]} | {c["code"] for c in data["legacyCourses"]}


def resolve(code: str, known: set[str]) -> str | None:
    """The catalog code this offering delivers, or None if there is not one."""
    if code in known:
        return code
    m = LETTERED.match(code)
    if m and m.group(1) in known:
        return m.group(1)
    if code in UNCATALOGUED:
        return None
    raise SystemExit(
        f"{code} is offered but is not in the catalog and is not listed in "
        f"UNCATALOGUED in {Path(__file__).name}. Confirm it against the catalog, "
        f"or add it there with a note saying why it fills no requirement."
    )


def parse(text: str) -> list[dict]:
    term = None
    dept = None
    cur = None
    out: list[dict] = []

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            continue

        # A centered term heading switches terms and clears the department.
        if s.lower() in BY_HEADING and raw.startswith(" " * 20):
            term = BY_HEADING[s.lower()]["id"]
            dept = None
            cur = None
            continue

        m = CODE_RE.match(raw)
        if m:
            if term is None:
                raise SystemExit(f"{m['subj']} {m['num']} appears before any term heading.")
            if dept is None:
                raise SystemExit(f"{m['subj']} {m['num']} appears before any department heading.")
            cur = {
                "term": term,
                "code": f"{m['subj']} {m['num']}",
                "catalogCode": None,
                "title": m["title"],
                "credits": None,
                "faculty": [],
                "department": dept,
                "note": None,
                "sections": [],
            }
            out.append(cur)
            continue

        c = CREDITS_RE.match(s)
        if c and cur is not None and cur["credits"] is None:
            cur["credits"] = float(c["cr"])
            fac = c["fac"].strip()
            cur["faculty"] = (
                [] if fac.upper() in ("TBD", "") else [f.strip() for f in fac.split(",") if f.strip()]
            )
            continue

        # A centered line that is not a course and not furniture names the
        # department the courses under it belong to.
        if raw.startswith(" " * 20) and s.lower() not in FURNITURE and "26/27" not in s:
            if cur is None or cur["credits"] is not None:
                dept = s
                cur = None
                continue

        # Inside a description, an indented line is a restriction or a note
        # about who the course is for. The prose itself sits at column 0.
        if cur is not None and cur["credits"] is not None and raw.startswith(" " * 7):
            if s == "Course Description:":
                continue
            cur["note"] = f"{cur['note']} {s}" if cur["note"] else s

    return out


def main() -> None:
    text = (RAW / SOURCE).read_text()
    rows = parse(text)
    known = catalog_codes()

    for r in rows:
        if r["credits"] is None:
            raise SystemExit(f"{r['code']} has no credits line; the dump format changed.")
        r["catalogCode"] = resolve(r["code"], known)
        if r["catalogCode"] is None:
            reason = UNCATALOGUED[r["code"]]
            r["note"] = f"{r['note']} {reason}" if r["note"] else reason

    seen = set()
    for r in rows:
        key = (r["term"], r["code"])
        if key in seen:
            raise SystemExit(f"{r['code']} is listed twice under {r['term']}.")
        seen.add(key)

    payload = {
        "source": LABEL,
        "terms": [{k: t[k] for k in ("id", "name", "order")} for t in TERMS],
        "offerings": rows,
    }
    (OUT / "offerings.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    counts = {t["id"]: sum(1 for r in rows if r["term"] == t["id"]) for t in TERMS}
    print(f"offerings.json: {len(rows)} offerings {counts}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Wire it into the data chain**

In `package.json`, append to the `data` script so it runs after the courses it checks against:

```json
"data": "python3 scripts/extract_courses.py && python3 scripts/extract_equivalencies.py && python3 scripts/build_requirements.py && python3 scripts/build_requirements_2024.py && python3 scripts/extract_offerings.py"
```

- [ ] **Step 6: Generate and check**

```bash
npm run data
# expect: offerings.json: 63 offerings {'winter-2627': 58, 'dterm-2627': 5}
git diff --stat -- data/   # only data/offerings.json should be new
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- offerings.data`
Expected: PASS, 7 tests.

Then `npm test` — the whole suite, still green.

- [ ] **Step 8: Verify it reproduces**

```bash
npm run data && git diff --quiet -- data/ && echo "reproduces exactly"
```

- [ ] **Step 9: Commit**

```bash
git add data/raw/offerings_winter_dterm_2627.txt scripts/extract_offerings.py \
        data/offerings.json package.json lib/offerings.data.test.ts
git commit -m "Record which courses actually run next term"
```

---

### Task 2: Reading offerings in the app

**Files:**
- Create: `lib/offerings.ts`
- Modify: `lib/types.ts` (add `Offering`, `Term`, `OfferingsFile`)
- Test: `lib/offerings.test.ts`

**Interfaces:**
- Consumes: `data/offerings.json` from Task 1; `getCourse`, `normalizeCode` from `lib/catalog`.
- Produces:
  - `terms: Term[]`
  - `offeringsFor(termId: string): Offering[]`
  - `offeredCatalogCodes(termId: string): Set<string>`
  - `offeringKey(termId: string, code: string): string` → `"winter-2627:PHIL 220"`
  - `findOffering(termId: string, code: string): Offering | undefined`

- [ ] **Step 1: Add the types**

Append to `lib/types.ts`:

```ts
/** A term the app has an offerings list for. */
export interface Term {
  id: string;
  name: string;
  /** Chronological position; 1 is the term nearest to now. */
  order: number;
}

/** One course as a term actually offers it. */
export interface Offering {
  term: string;
  /** The code as printed, including a special topic's letter. */
  code: string;
  /**
   * The catalog code this delivers, which is what requirements are written
   * in. Null where the catalog does not list the course at all: it still
   * counts toward the term's credits but fills no named requirement.
   */
  catalogCode: string | null;
  title: string;
  credits: number;
  /** Empty where the term lists the faculty as TBD. */
  faculty: string[];
  department: string;
  /** A restriction or eligibility note printed with the description. */
  note: string | null;
  /**
   * Meeting times and seats, which the course descriptions do not carry.
   * Always empty from that source; a Populi section export would fill it.
   */
  sections: unknown[];
}

export interface OfferingsFile {
  source: string;
  terms: Term[];
  offerings: Offering[];
}
```

- [ ] **Step 2: Write the failing test**

Create `lib/offerings.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { findOffering, offeredCatalogCodes, offeringKey, offeringsFor, terms } from "./offerings";

describe("offerings", () => {
  it("lists the terms nearest first", () => {
    expect(terms.map((t) => t.id)).toEqual(["winter-2627", "dterm-2627"]);
  });

  it("returns a term's own offerings", () => {
    expect(offeringsFor("winter-2627")).toHaveLength(58);
    expect(offeringsFor("dterm-2627")).toHaveLength(5);
    expect(offeringsFor("nope")).toHaveLength(0);
  });

  it("maps a lettered special topic onto the code requirements use", () => {
    const o = findOffering("winter-2627", "PHIL 380A");
    expect(o?.catalogCode).toBe("PHIL 380");
  });

  it("leaves an uncatalogued offering without a catalog code", () => {
    expect(findOffering("dterm-2627", "LEAD 380A")?.catalogCode).toBeNull();
  });

  it("collects the catalog codes a term can fill", () => {
    const codes = offeredCatalogCodes("winter-2627");
    expect(codes.has("PHIL 220")).toBe(true);
    expect(codes.has("PHIL 380")).toBe(true);
    // Offered in D-Term, not Winter.
    expect(codes.has("POLR 210")).toBe(false);
    // Uncatalogued offerings contribute nothing to fill.
    expect([...codes].every((c) => c.length > 0)).toBe(true);
  });

  it("keys an offering by term and code", () => {
    expect(offeringKey("winter-2627", "PHIL 220")).toBe("winter-2627:PHIL 220");
    expect(offeringKey("winter-2627", "phil220")).toBe("winter-2627:PHIL 220");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- offerings.test`
Expected: FAIL — cannot resolve `./offerings`.

- [ ] **Step 4: Implement**

Create `lib/offerings.ts`:

```ts
import offeringsFile from "@/data/offerings.json";
import { normalizeCode } from "./catalog";
import type { Offering, OfferingsFile, Term } from "./types";

const file = offeringsFile as unknown as OfferingsFile;

export const offeringsSource = file.source;
export const terms: Term[] = [...file.terms].sort((a, b) => a.order - b.order);

const byTerm = new Map<string, Offering[]>();
for (const o of file.offerings) {
  const list = byTerm.get(o.term) ?? [];
  list.push(o);
  byTerm.set(o.term, list);
}

export function offeringsFor(termId: string): Offering[] {
  return byTerm.get(termId) ?? [];
}

/** "winter-2627:PHIL 220" — how a plan names one course in one term. */
export function offeringKey(termId: string, code: string): string {
  return `${termId}:${normalizeCode(code)}`;
}

export function findOffering(termId: string, code: string): Offering | undefined {
  const want = normalizeCode(code);
  return offeringsFor(termId).find((o) => o.code === want);
}

/**
 * The catalog codes a term can actually fill. An offering the catalog does
 * not list contributes nothing here, because there is no requirement it
 * could close.
 */
export function offeredCatalogCodes(termId: string): Set<string> {
  const out = new Set<string>();
  for (const o of offeringsFor(termId)) if (o.catalogCode) out.add(o.catalogCode);
  return out;
}

export function termName(termId: string): string {
  return terms.find((t) => t.id === termId)?.name ?? termId;
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- offerings`
Expected: PASS, both files.

- [ ] **Step 6: Commit**

```bash
git add lib/offerings.ts lib/offerings.test.ts lib/types.ts
git commit -m "Read the term's offerings"
```

---

### Task 3: Projecting the record forward

**Files:**
- Create: `lib/plan.ts`
- Modify: `lib/types.ts` (add `PlanTier`, `Plan`)
- Test: `lib/plan.test.ts`

**Interfaces:**
- Consumes: `TakenCourse`, `CourseStatus` from `lib/types`; `Offering` and `findOffering` from `lib/offerings`; `terms` for ordering.
- Produces:
  - `projectRecord(taken: TakenCourse[]): TakenCourse[]`
  - `plannedAt(plan: Plan, termId: string, tier?: PlanTier): { code: string; offering: Offering }[]`
  - `plannedAsCourses(plan: Plan, throughTermId: string): TakenCourse[]`
  - `projectFor(taken: TakenCourse[], plan: Plan, termId: string): TakenCourse[]`
  - `plannedCredits(plan: Plan, termId: string, tier: PlanTier): number`

- [ ] **Step 1: Add the plan types**

Append to `lib/types.ts`:

```ts
/**
 * How firmly a course is in next term's plan. Definitely is the plan and is
 * projected forward; maybe and considering are shown but never displace it.
 */
export type PlanTier = "definitely" | "maybe" | "considering";

/** Planned courses, keyed "termId:CODE" so one course can sit in two terms. */
export type Plan = Record<string, PlanTier>;
```

- [ ] **Step 2: Write the failing test**

Create `lib/plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { plannedAsCourses, plannedAt, plannedCredits, projectFor, projectRecord } from "./plan";
import type { Plan, TakenCourse } from "./types";

const record: TakenCourse[] = [
  { code: "PHIL 120", credits: 3, status: "completed" },
  { code: "MATH 210", credits: 3, status: "in-progress" },
  { code: "HIST 110", credits: 3, status: "incomplete" },
  { code: "ECON 102", credits: 3, status: "failed" },
  { code: "LITR 210", credits: 3, status: "withdrawn" },
];

describe("projectRecord", () => {
  it("assumes what you are attempting now will pass", () => {
    const out = projectRecord(record);
    expect(out.find((c) => c.code === "MATH 210")?.status).toBe("completed");
  });

  it("leaves every other status alone", () => {
    const out = projectRecord(record);
    const status = (code: string) => out.find((c) => c.code === code)?.status;
    // An incomplete is unfinished work under an extension, not a course
    // being attempted now, so it is a different and less safe assumption.
    expect(status("HIST 110")).toBe("incomplete");
    expect(status("ECON 102")).toBe("failed");
    expect(status("LITR 210")).toBe("withdrawn");
    expect(status("PHIL 120")).toBe("completed");
  });

  it("does not mutate what it was given", () => {
    projectRecord(record);
    expect(record.find((c) => c.code === "MATH 210")?.status).toBe("in-progress");
  });
});

describe("the plan", () => {
  const plan: Plan = {
    "winter-2627:PHIL 220": "definitely",
    "winter-2627:MATH 220": "maybe",
    "dterm-2627:POLR 210": "definitely",
  };

  it("lists what is planned in one term", () => {
    expect(plannedAt(plan, "winter-2627").map((p) => p.code).sort()).toEqual(["MATH 220", "PHIL 220"]);
    expect(plannedAt(plan, "winter-2627", "definitely").map((p) => p.code)).toEqual(["PHIL 220"]);
  });

  it("totals a tier's credits for a term", () => {
    expect(plannedCredits(plan, "winter-2627", "definitely")).toBe(3);
    expect(plannedCredits(plan, "winter-2627", "maybe")).toBe(3);
    expect(plannedCredits(plan, "dterm-2627", "considering")).toBe(0);
  });

  it("turns only the definitelys into coursework, and only up to the term asked for", () => {
    const winter = plannedAsCourses(plan, "winter-2627");
    expect(winter.map((c) => c.code)).toEqual(["PHIL 220"]);
    expect(winter[0].status).toBe("in-progress");

    // Planning D-Term means Winter's definitelys are behind you.
    const dterm = plannedAsCourses(plan, "dterm-2627");
    expect(dterm.map((c) => c.code).sort()).toEqual(["PHIL 220", "POLR 210"]);
  });

  it("projects the record plus the plan up to that term", () => {
    const out = projectFor(record, plan, "winter-2627");
    const status = (code: string) => out.find((c) => c.code === code)?.status;
    expect(status("MATH 210")).toBe("completed");
    expect(status("PHIL 220")).toBe("in-progress");
    expect(out.find((c) => c.code === "MATH 220")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- plan.test`
Expected: FAIL — cannot resolve `./plan`.

- [ ] **Step 4: Implement**

Create `lib/plan.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- plan.test`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/plan.ts lib/plan.test.ts lib/types.ts
git commit -m "Assume this term's courses pass, and carry the plan forward"
```

---

### Task 4: Prerequisite warnings

**Files:**
- Create: `lib/prereq.ts`
- Test: `lib/prereq.test.ts`

**Interfaces:**
- Consumes: `getCourse`, `normalizeCode` from `lib/catalog`; `TakenCourse`, `fillsRequirement` from `lib/types`.
- Produces:
  - `parsePrerequisite(text: string): string[][] | null` — alternatives of all-of sets; `null` when it is prose.
  - `checkPrerequisite(code: string, held: Set<string>): PrereqCheck`
  - `heldCodes(record: TakenCourse[]): Set<string>`
  - `type PrereqCheck = { state: "met" | "unmet" | "unknown" | "none"; text?: string; options?: string[][] }`

- [ ] **Step 1: Write the failing test**

Create `lib/prereq.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkPrerequisite, heldCodes, parsePrerequisite } from "./prereq";
import type { TakenCourse } from "./types";

describe("parsePrerequisite", () => {
  it("reads alternatives", () => {
    expect(parsePrerequisite("AMCV 200 or INF 2121")).toEqual([["AMCV 200"], ["INF 2121"]]);
  });

  it("reads a single course", () => {
    expect(parsePrerequisite("AMCV 310")).toEqual([["AMCV 310"]]);
  });

  it("reads two codes with no connector as both being needed", () => {
    // PHYS 310's catalog text is exactly "PHYS 220 MATH 240".
    expect(parsePrerequisite("PHYS 220 MATH 240")).toEqual([["PHYS 220", "MATH 240"]]);
  });

  it("reads an explicit and", () => {
    expect(parsePrerequisite("MATH 101 and MATH 200")).toEqual([["MATH 101", "MATH 200"]]);
  });

  it("refuses to guess at prose", () => {
    expect(parsePrerequisite("Latin I or equivalent proficiency")).toBeNull();
    expect(parsePrerequisite("Permission of the instructor")).toBeNull();
  });
});

describe("checkPrerequisite", () => {
  const held = new Set(["MATH 210", "AMCV 200"]);

  it("says nothing about a course with no prerequisite", () => {
    expect(checkPrerequisite("MATH 101", held).state).toBe("none");
  });

  it("passes when one alternative is held", () => {
    // AMCV 210 :: "AMCV 200 or INF 2121"
    expect(checkPrerequisite("AMCV 210", held).state).toBe("met");
  });

  it("fails when none is", () => {
    // AMCV 310 :: "AMCV 210"
    const out = checkPrerequisite("AMCV 310", held);
    expect(out.state).toBe("unmet");
    expect(out.options).toEqual([["AMCV 210"]]);
  });

  it("reports prose rather than judging it", () => {
    const out = checkPrerequisite("LANG 321", held);
    expect(["unknown", "none"]).toContain(out.state);
  });
});

describe("heldCodes", () => {
  it("counts completed, in-progress and waived work, but not failed", () => {
    const record: TakenCourse[] = [
      { code: "MATH 210", status: "completed" },
      { code: "PHIL 220", status: "in-progress" },
      { code: "HIST 110", status: "waived" },
      { code: "ECON 102", status: "failed" },
      { code: "LITR 210", status: "withdrawn" },
    ];
    const held = heldCodes(record);
    expect(held.has("MATH 210")).toBe(true);
    expect(held.has("PHIL 220")).toBe(true);
    expect(held.has("HIST 110")).toBe(true);
    expect(held.has("ECON 102")).toBe(false);
    expect(held.has("LITR 210")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- prereq`
Expected: FAIL — cannot resolve `./prereq`.

- [ ] **Step 3: Implement**

Create `lib/prereq.ts`:

```ts
import { getCourse, normalizeCode } from "./catalog";
import { fillsRequirement, type TakenCourse } from "./types";

export type PrereqCheck = {
  /**
   * none    - the catalog asks for nothing
   * met     - at least one alternative is entirely held
   * unmet   - none is
   * unknown - the catalog states it in prose, so it is shown, not judged
   */
  state: "met" | "unmet" | "unknown" | "none";
  /** The catalog's own words, for display. */
  text?: string;
  options?: string[][];
};

const CODE = /^[A-Z]{2,5} ?\d{3,4}[A-Z]?$/;

/**
 * A prerequisite as alternatives of all-of sets — the same options-of-codes
 * shape requirement slots already use, where the outer array is "any of" and
 * the inner one is "all of".
 *
 * Of the 174 catalog courses that state a prerequisite, 173 are clean code
 * expressions. The exception is PHYS 310's "PHYS 220 MATH 240", two codes
 * with the "and" left out. Anything that is not codes returns null and is
 * reported rather than guessed at.
 */
export function parsePrerequisite(text: string): string[][] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const alternatives = trimmed.split(/\s+or\s+|\s*\/\s*/i);
  const out: string[][] = [];

  for (const alt of alternatives) {
    // "and", a comma, a plus, or nothing at all between two codes.
    const parts = alt.split(/\s+and\s+|\s*[,;+]\s*|\s+/i).filter(Boolean);
    const codes: string[] = [];
    let buffer = "";
    for (const part of parts) {
      // A bare number after a subject is the rest of that code: "PHYS" "220".
      buffer = buffer ? `${buffer} ${part}` : part;
      if (CODE.test(buffer)) {
        codes.push(normalizeCode(buffer));
        buffer = "";
      } else if (!/^[A-Z]{2,5}$/.test(buffer)) {
        return null; // prose
      }
    }
    if (buffer || !codes.length) return null;
    out.push(codes);
  }
  return out.length ? out : null;
}

/** Course codes that count as held: earned, under way, or waived. */
export function heldCodes(record: TakenCourse[]): Set<string> {
  const out = new Set<string>();
  for (const c of record) if (fillsRequirement(c.status)) out.add(normalizeCode(c.code));
  return out;
}

export function checkPrerequisite(code: string, held: Set<string>): PrereqCheck {
  const course = getCourse(code);
  const text = course?.prerequisite?.trim();
  if (!text) return { state: "none" };

  const options = parsePrerequisite(text);
  if (!options) return { state: "unknown", text };

  const met = options.some((alt) => alt.every((c) => held.has(c)));
  return met ? { state: "met", text, options } : { state: "unmet", text, options };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- prereq`
Expected: PASS, 10 tests.

If `parsePrerequisite("Latin I or equivalent proficiency")` does not return null, the buffer logic is wrong: "Latin" is not a subject code of 2-5 capitals, so the `!/^[A-Z]{2,5}$/` branch must reject it.

- [ ] **Step 5: Sanity-check against the whole catalog**

```bash
cat > /tmp/prereq-sweep.mjs <<'EOF'
import courses from "./data/courses.json" with { type: "json" };
const CODE = /^[A-Z]{2,5} ?\d{3,4}[A-Z]?$/;
let clean = 0, prose = 0;
for (const c of courses.courses) {
  if (!c.prerequisite) continue;
  const alts = c.prerequisite.split(/\s+or\s+/i);
  const ok = alts.every((a) => a.trim().split(/\s+and\s+|\s*,\s*/i).every((p) => {
    const t = p.trim();
    return CODE.test(t) || t.split(/\s+/).length === 4;
  }));
  ok ? clean++ : prose++;
}
console.log({ clean, prose });
EOF
node /tmp/prereq-sweep.mjs   # expect roughly { clean: 173, prose: 1 }
```

- [ ] **Step 6: Commit**

```bash
git add lib/prereq.ts lib/prereq.test.ts
git commit -m "Warn when a planned course wants something you do not have"
```

---

### Task 5: Saving and sharing the plan

**Files:**
- Modify: `lib/storage.ts`
- Test: `lib/storage.test.ts`

**Interfaces:**
- Consumes: `Plan`, `PlanTier` from `lib/types`.
- Produces: `SavedState.plan: Plan` and `SavedState.planningTerm: string | null`; `encodeState`/`decodeState` round-trip both.

- [ ] **Step 1: Write the failing test**

Append to `lib/storage.test.ts`:

```ts
describe("the plan in a link", () => {
  it("survives a round trip", () => {
    const state = {
      ...emptyState,
      taken: [{ code: "PHIL 120", credits: 3, status: "completed" as const }],
      plan: {
        "winter-2627:PHIL 220": "definitely" as const,
        "winter-2627:MATH 220": "maybe" as const,
        "dterm-2627:POLR 210": "considering" as const,
      },
      planningTerm: "winter-2627",
    };
    const back = decodeState(encodeState(state))!;
    expect(back.plan).toEqual(state.plan);
  });

  it("does not share which term you were looking at", () => {
    // The projection is the receiver's own; a link carries record and plan.
    const state = { ...emptyState, taken: [{ code: "PHIL 120", status: "completed" as const }], planningTerm: "winter-2627" };
    expect(decodeState(encodeState(state))!.planningTerm).toBeNull();
  });

  it("leaves an empty plan out of the link", () => {
    const state = { ...emptyState, taken: [{ code: "PHIL 120", status: "completed" as const }] };
    expect(encodeState(state)).not.toContain("pl=");
  });

  it("still reads a link written before plans existed", () => {
    const back = decodeState("c=PHIL120:3:c")!;
    expect(back.plan).toEqual({});
    expect(back.taken).toHaveLength(1);
  });

  it("drops a tier it does not recognise", () => {
    expect(decodeState("c=PHIL120:3:c&pl=winter-2627:PHIL220~z")!.plan).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- storage`
Expected: FAIL — `plan` is not on `SavedState`.

- [ ] **Step 3: Implement**

In `lib/storage.ts`, add the tier codes next to the existing `INTEREST_CODE`:

```ts
// The plan's own letters. Deliberately not the c/s that targets use: a course
// you will take and a concentration you are aiming at are not one scale.
const PLAN_CODE: Record<PlanTier, string> = { definitely: "d", maybe: "m", considering: "c" };
const CODE_PLAN: Record<string, PlanTier> = { d: "definitely", m: "maybe", c: "considering" };
```

Extend the interface and the empty state:

```ts
export interface SavedState {
  // ...existing fields...
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
  // ...existing fields...
  plan: {},
  planningTerm: null,
};
```

Import `Plan` and `PlanTier` in the type import at the top of the file.

In `encodeState`, after the `targets` block:

```ts
  const planned = Object.entries(state.plan).map(([key, tier]) => `${key.replace(/\s+/g, "")}~${PLAN_CODE[tier]}`);
  if (planned.length) params.set("pl", planned.join("."));
```

In `decodeState`, in the returned object:

```ts
    plan: parsePlan(params.get("pl")),
    planningTerm: null,
```

And add the parser beside `parseTargets`:

```ts
/**
 * `termId:CODE~tier`, one entry per dot. An entry whose tier letter is not
 * one of ours is dropped rather than guessed at, the same as a malformed
 * course code in `c=`.
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
```

`loadLocal` already spreads `emptyState` first, so a browser holding a plan-less state gets `plan: {}` and `planningTerm: null` with no migration.

- [ ] **Step 4: Run the tests**

Run: `npm test -- storage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts lib/storage.test.ts
git commit -m "Keep the plan, and carry it in a shared link"
```

---

### Task 6: Suggesting only what is offered

**Files:**
- Modify: `lib/audit.ts` (`suggestNextCourses`, around line 815)
- Test: `lib/audit.test.ts`

**Interfaces:**
- Consumes: `AuditResult`, `Targets` as now.
- Produces: `suggestNextCourses(audit, targets?, limit?, offered?: Set<string> | null)` — same return shape. When `offered` is a set, only codes in it survive; `null` or omitted keeps today's behaviour.

- [ ] **Step 1: Write the failing test**

Append to `lib/audit.test.ts`:

```ts
describe("suggesting only what is offered", () => {
  const record: TakenCourse[] = [{ code: "PHIL 120", credits: 3, status: "completed" }];

  it("suggests across the catalog when given no filter", () => {
    const all = suggestNextCourses(auditDegree(record), {}, 50);
    expect(all.length).toBeGreaterThan(0);
  });

  it("keeps only offered courses when given a filter", () => {
    const audit = auditDegree(record);
    const offered = new Set(["PHIL 220", "MATH 210"]);
    const out = suggestNextCourses(audit, {}, 50, offered);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(offered.has(s.code), s.code).toBe(true);
  });

  it("does not reorder what survives the filter", () => {
    const audit = auditDegree(record);
    const all = suggestNextCourses(audit, {}, 500);
    const offered = new Set(all.slice(0, 20).map((s) => s.code));
    const filtered = suggestNextCourses(audit, {}, 500, offered);
    const expected = all.filter((s) => offered.has(s.code)).map((s) => s.code);
    expect(filtered.map((s) => s.code)).toEqual(expected);
  });

  it("returns nothing when nothing offered helps", () => {
    expect(suggestNextCourses(auditDegree(record), {}, 50, new Set(["ZZZZ 999"]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- audit`
Expected: FAIL — `suggestNextCourses` takes three arguments.

- [ ] **Step 3: Implement**

Change the signature and filter at the end. The filter goes *after* ranking, so the order courses would have had is preserved exactly.

```ts
export function suggestNextCourses(
  audit: AuditResult,
  targets: Targets = {},
  limit = 12,
  /**
   * Catalog codes a term actually offers. Null suggests across the whole
   * catalog, which is what the page does when you are not planning a term.
   * Filtering happens after ranking, so being offered decides who is
   * eligible and never who wins.
   */
  offered: Set<string> | null = null,
) {
```

Then replace the return statement:

```ts
  const ranked = [...doubleDuty, ...interleave(required, plan), ...tail];
  const eligible = offered ? ranked.filter((e) => offered.has(e.code)) : ranked;

  return eligible
    .slice(0, limit)
    .map((e) => ({ ...e, title: titleOf(e.code), credits: creditsOf(e.code), level: levelOf(e.code) }));
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS — the new cases and all 138 existing ones. The default argument means no existing caller changes.

- [ ] **Step 5: Commit**

```bash
git add lib/audit.ts lib/audit.test.ts
git commit -m "Suggest only what the term actually runs"
```

---

### Task 7: The planning UI

**Files:**
- Create: `components/PlanPanel.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: everything above — `terms`, `offeringsFor`, `offeredCatalogCodes`, `offeringKey`, `findOffering`, `termName`; `projectFor`, `plannedAt`, `plannedCredits`; `checkPrerequisite`, `heldCodes`; `suggestNextCourses`'s fourth argument; `state.plan`, `state.planningTerm`.
- Produces: no new exports the rest of the app consumes.

- [ ] **Step 1: Build the term switch in `app/page.tsx`**

Add the imports:

```tsx
import { PlanPanel } from "@/components/PlanPanel";
import { offeredCatalogCodes, terms, termName } from "@/lib/offerings";
import { projectFor } from "@/lib/plan";
import type { PlanTier } from "@/lib/types";
```

Derive the projected audit beside the existing one. The existing `audit` stays exactly as it is, because "where you stand" must keep meaning that:

```tsx
  const planningTerm = state.planningTerm;

  const projectedRecord = useMemo(
    () => (planningTerm ? projectFor(record, state.plan, planningTerm) : record),
    [record, state.plan, planningTerm],
  );

  const shownAudit = useMemo(
    () =>
      planningTerm
        ? auditDegree(projectedRecord, { useInferred: state.useInferred, program: state.program })
        : audit,
    [planningTerm, projectedRecord, state.useInferred, state.program, audit],
  );

  const offered = useMemo(
    () => (planningTerm ? offeredCatalogCodes(planningTerm) : null),
    [planningTerm],
  );

  const setPlanTier = useCallback((key: string, tier: PlanTier | null) => {
    setState((prev) => {
      const plan = { ...prev.plan };
      if (tier === null) delete plan[key];
      else plan[key] = tier;
      return { ...prev, plan };
    });
  }, []);
```

Then feed `shownAudit` and `offered` to the suggestion call that currently reads `suggestNextCourses(audit, state.targets)`:

```tsx
  const next = useMemo(
    () => suggestNextCourses(shownAudit, state.targets, 12, offered),
    [shownAudit, state.targets, offered],
  );
```

Replace `audit` with `shownAudit` in `<Meridian>`, the pillar blocks, and the concentration ranking, so the whole page moves together. Leave `audit` itself untouched — `RecordPanel` and the excluded/waived/equivalency sections describe the real record, not the projection.

Add the switch inside the existing Planning panel, directly under the terms-left field:

```tsx
              <div className="field-row" style={{ marginTop: "0.9rem" }}>
                <label htmlFor="planning">Show me</label>
                <select
                  id="planning"
                  value={planningTerm ?? ""}
                  onChange={(e) => update({ planningTerm: e.target.value || null })}
                >
                  <option value="">Where you stand today</option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      Planning {t.name}
                    </option>
                  ))}
                </select>
              </div>
              {planningTerm && (
                <p className="note" style={{ marginTop: "0.5rem" }}>
                  Assuming you pass everything you are taking now
                  {terms.findIndex((t) => t.id === planningTerm) > 0
                    ? ", and everything marked Definitely before this term"
                    : ""}
                  .
                </p>
              )}
```

- [ ] **Step 2: Add the tier buttons to the suggestion table**

In the "What to take next" table, add a column header after `Credits`:

```tsx
                        {planningTerm && <th style={{ width: "13rem" }}>Plan it</th>}
```

and in each row, after the credits cell:

```tsx
                          {planningTerm && (
                            <td>
                              <TierButtons
                                value={state.plan[offeringKey(planningTerm, c.code)] ?? null}
                                onChange={(tier) => setPlanTier(offeringKey(planningTerm, c.code), tier)}
                              />
                            </td>
                          )}
```

Import `offeringKey` from `@/lib/offerings` and `TierButtons` from `@/components/PlanPanel`.

Note the key uses `c.code`, the catalog code the suggestion is written in. `findOffering` matches on the printed code, so `PlanPanel` resolves a catalog code back to its offering — see Step 3's `offeringFor`.

- [ ] **Step 3: Write `components/PlanPanel.tsx`**

```tsx
"use client";

import { findOffering, offeringKey, offeringsFor, termName } from "@/lib/offerings";
import { plannedAt, plannedCredits } from "@/lib/plan";
import { checkPrerequisite } from "@/lib/prereq";
import { titleOf } from "@/lib/catalog";
import type { Offering, Plan, PlanTier } from "@/lib/types";

const TIERS: { id: PlanTier; label: string }[] = [
  { id: "definitely", label: "Definitely" },
  { id: "maybe", label: "Maybe" },
  { id: "considering", label: "Considering" },
];

export function TierButtons({
  value,
  onChange,
}: {
  value: PlanTier | null;
  onChange: (tier: PlanTier | null) => void;
}) {
  return (
    <span className="tier-buttons">
      {TIERS.map((t) => (
        <button
          key={t.id}
          type="button"
          className="btn btn-quiet tier-button"
          data-tier={t.id}
          aria-pressed={value === t.id}
          onClick={() => onChange(value === t.id ? null : t.id)}
        >
          {t.label}
        </button>
      ))}
    </span>
  );
}

/**
 * An offering by the code a requirement is written in. A suggestion names
 * "PHIL 380"; the term runs it as "PHIL 380A".
 */
function offeringFor(termId: string, catalogCode: string): Offering | undefined {
  return (
    findOffering(termId, catalogCode) ??
    offeringsFor(termId).find((o) => o.catalogCode === catalogCode)
  );
}

export function PlanPanel({
  termId,
  plan,
  held,
  onChange,
}: {
  termId: string;
  plan: Plan;
  /** Codes held once the record is projected to the start of this term. */
  held: Set<string>;
  onChange: (key: string, tier: PlanTier | null) => void;
}) {
  const rows = TIERS.map((t) => ({ tier: t, items: plannedAt(plan, termId, t.id) }));
  const total = plannedCredits(plan, termId, "definitely");
  const anything = rows.some((r) => r.items.length > 0);

  return (
    <section className="section">
      <div className="section-head">
        <h2>Your plan for {termName(termId)}</h2>
        <span className="aside">{total} credits marked Definitely</span>
      </div>

      {!anything ? (
        <p className="note">
          Nothing planned yet. Mark a course Definitely, Maybe or Considering in the list above, or browse
          everything the term runs.
        </p>
      ) : (
        rows
          .filter((r) => r.items.length > 0)
          .map((r) => (
            <div key={r.tier.id} className="plan-group">
              <p className="eyebrow">
                <span className="tier-chip" data-tier={r.tier.id}>
                  {r.tier.label}
                </span>{" "}
                {plannedCredits(plan, termId, r.tier.id)} credits
              </p>
              <table className="next-table">
                <tbody>
                  {r.items.map(({ code, offering }) => {
                    const check = offering.catalogCode
                      ? checkPrerequisite(offering.catalogCode, held)
                      : { state: "none" as const };
                    return (
                      <tr key={code}>
                        <td className="mono">{offering.code}</td>
                        <td>
                          {offering.title}
                          {offering.faculty.length > 0 && (
                            <span className="aside"> · {offering.faculty.join(", ")}</span>
                          )}
                          {check.state === "unmet" && (
                            <p className="note warn">
                              ⚠ Wants {check.options!.map((alt) => alt.map(titleOf ? (c) => c : (c) => c).join(" and ")).join(" or ")} — not on your
                              record and not in this plan.
                            </p>
                          )}
                          {check.state === "unknown" && (
                            <p className="note">
                              Prerequisite: “{check.text}” — cannot be checked automatically.
                            </p>
                          )}
                          {offering.note && <p className="note">{offering.note}</p>}
                        </td>
                        <td className="mono">{offering.credits}</td>
                        <td>
                          <TierButtons
                            value={plan[offeringKey(termId, offering.code)] ?? r.tier.id}
                            onChange={(tier) => onChange(offeringKey(termId, offering.code), tier)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))
      )}
    </section>
  );
}

export function BrowseOfferings({
  termId,
  plan,
  onChange,
}: {
  termId: string;
  plan: Plan;
  onChange: (key: string, tier: PlanTier | null) => void;
}) {
  const all = offeringsFor(termId);
  const byDept = new Map<string, Offering[]>();
  for (const o of all) byDept.set(o.department, [...(byDept.get(o.department) ?? []), o]);

  return (
    <details className="browse-offerings">
      <summary>Browse all {all.length} courses {termName(termId)} runs</summary>
      {[...byDept.entries()].map(([dept, list]) => (
        <div key={dept} className="plan-group">
          <p className="eyebrow">{dept}</p>
          <table className="next-table">
            <tbody>
              {list.map((o) => (
                <tr key={o.code}>
                  <td className="mono">{o.code}</td>
                  <td>
                    {o.title}
                    {!o.catalogCode && (
                      <p className="note">Not in the catalog, so it fills no named requirement.</p>
                    )}
                  </td>
                  <td className="mono">{o.credits}</td>
                  <td>
                    <TierButtons
                      value={plan[offeringKey(termId, o.code)] ?? null}
                      onChange={(tier) => onChange(offeringKey(termId, o.code), tier)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </details>
  );
}
```

Simplify the `unmet` line while writing it — the intended output is plain:

```tsx
⚠ Wants {check.options!.map((alt) => alt.join(" and ")).join(" or ")} — not on your record and not in this plan.
```

- [ ] **Step 4: Mount the panels in `app/page.tsx`**

Directly after the "What to take next" `</section>`:

```tsx
              {planningTerm && (
                <>
                  <PlanPanel
                    termId={planningTerm}
                    plan={state.plan}
                    held={heldCodes(projectedRecord)}
                    onChange={setPlanTier}
                  />
                  <BrowseOfferings termId={planningTerm} plan={state.plan} onChange={setPlanTier} />
                </>
              )}
```

Import `heldCodes` from `@/lib/prereq`, and `PlanPanel`/`BrowseOfferings` from `@/components/PlanPanel`.

- [ ] **Step 5: Mark the projection in the requirements panel**

In the "Where you stand" section head, when `planningTerm` is set, add a banner so a projected reading can never be mistaken for a real one:

```tsx
              {planningTerm && (
                <p className="note projecting">
                  Projected to the start of {termName(planningTerm)}. This is not where you stand today.
                </p>
              )}
```

- [ ] **Step 6: Style it**

Append to `app/globals.css`, following the existing `.tier-chip[data-tier=...]` colours:

```css
.tier-buttons { display: inline-flex; gap: 0.25rem; flex-wrap: wrap; }
.tier-button { font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 999px; }
.tier-button[aria-pressed="true"][data-tier="definitely"] { background: var(--ink); color: var(--paper); }
.tier-button[aria-pressed="true"][data-tier="maybe"] { background: var(--slate); color: var(--paper); }
.tier-button[aria-pressed="true"][data-tier="considering"] { background: var(--mist); color: var(--ink); }
.tier-chip[data-tier="definitely"] { background: var(--ink); color: var(--paper); }
.tier-chip[data-tier="maybe"] { background: var(--slate); color: var(--paper); }
.tier-chip[data-tier="considering"] { background: var(--mist); color: var(--ink); }
.plan-group { margin-top: 0.9rem; }
.note.warn { color: var(--rust, #9a3412); }
.note.projecting { border-left: 3px solid var(--slate); padding-left: 0.6rem; }
.browse-offerings { margin-top: 1rem; }
.browse-offerings summary { cursor: pointer; font-size: 0.85rem; color: var(--slate); }
```

If any of `--ink`, `--paper`, `--slate`, `--mist` is not defined in `globals.css`, use whatever the existing `.tier-chip` rules use instead — match the file, do not introduce a palette.

- [ ] **Step 7: Check it builds and runs**

```bash
npm run build     # type-checks and lints
npm test          # whole suite
npm run dev       # then open http://localhost:3000
```

By hand: add a course as in-progress, switch to "Planning Winter 26/27", confirm the suggestion list shrinks to offered courses only, mark one Definitely, and confirm it appears in the plan panel with its credits and that the requirement it closes now reads as projected.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx components/PlanPanel.tsx app/globals.css
git commit -m "Plan a term from what it actually runs"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the feature to "What it does"**

After the "Follows what you are aiming at" bullet:

```markdown
- **Plans next term.** Skip ahead a term and the audit assumes you pass what
  you are taking now, then ranks what to take next against the courses that
  term actually runs — not the whole catalog. Mark each one Definitely, Maybe
  or Considering. Definitely carries forward, so a Winter choice counts when
  you plan D-Term; Maybe and Considering are shown but never displace it. A
  course whose prerequisite you will not hold is flagged, and one the catalog
  states in prose is quoted rather than guessed at.
```

- [ ] **Step 2: Add the data file to the table**

```markdown
| `data/offerings.json` | 63 courses Winter 26/27 and D-Term 26/27 actually run: code, catalog code, credits, faculty, department |
```

- [ ] **Step 3: Document the manual dump**

In "Where the data comes from", after the regeneration list:

```markdown
The term's offerings come from a different kind of source. *Winter and D-Term
26/27 Course Descriptions* has a real text layer, so no OCR is needed, but
turning the PDF into `data/raw/offerings_winter_dterm_2627.txt` is a manual
step and `npm run data` does not do it:

```bash
pdftotext -layout "Winter and D-Term 26/27 - Course Descriptions.pdf" \
  data/raw/offerings_winter_dterm_2627.txt
```

`extract_offerings.py` then parses that dump. Two of the 63 courses —
`LEAD 380A` and `POLR 380A` — are not in the catalog at all, so they are
listed in the script's `UNCATALOGUED` table with a note: they stay plannable
and count toward a term's credits, but fill no named requirement. A new code
that is in neither the catalog nor that table fails the build rather than
being guessed at.
```

- [ ] **Step 4: Update the test count**

Change `npm test # 138 tests` to the number the suite now reports.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Tell people how next term gets planned"
```

---

## Self-review

**Spec coverage**

| Spec section | Task |
| --- | --- |
| Generated data `offerings.json` | 1 |
| Manual dump step, CI hermetic | 1, 8 |
| Uncatalogued offerings fail loudly | 1 |
| Reading offerings in the app | 2 |
| `projectRecord`, incomplete untouched | 3 |
| Planning a term projects the terms before it | 3 |
| Plan type, tiers, definitely feeds forward | 3, 5 |
| Suggestions filtered to offered | 6 |
| Prerequisite parsing and warnings | 4 |
| Share links, `pl=`, old links work | 5 |
| Projection not shared | 5 |
| UI: switch, tier buttons, plan summary, browse, projected banner | 7 |
| Testing | in every task |
| `sections` left empty for a future Populi export | 1, 2 |

**Type consistency**

- `PlanTier` / `Plan` are defined once in Task 3's `lib/types.ts` edit and imported everywhere after.
- `offeringKey(termId, code)` is the only thing that builds a plan key; `parsePlan` in Task 5 rebuilds the same shape and normalises the code the same way.
- `suggestNextCourses`'s fourth argument is `Set<string> | null` in Task 6 and is fed from `offeredCatalogCodes` in Task 7, which returns `Set<string>`.
- `heldCodes` is defined in Task 4 and consumed in Task 7.
- `checkPrerequisite` returns `PrereqCheck` with `state`/`text`/`options`; Task 7 reads exactly those.

**Known rough edge**

Task 7 Step 3's `unmet` line is written awkwardly in the draft and Step 3 gives the plain replacement. Use the replacement.
