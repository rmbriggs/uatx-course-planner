# Plan next term

Skip ahead one term — assume this term's courses pass — and build a shortlist
for the next one from the courses actually on offer, sorted into Definitely,
Maybe and Considering.

Today the app answers "where do I stand?" It cannot answer "what should I
register for?", because it knows every course in the catalog but not which of
them run next term. Its "what to take next" list therefore suggests courses
that may not be offered, and it measures you as you are today rather than as
you will be once the term you are in finishes.

## Source data

`Winter and D-Term 26/27 - Course Descriptions.pdf`, 22 pages, downloaded
2026-09-21. Unlike both catalogs it has a real text layer, so no OCR is needed.

It holds 63 courses across two terms — 58 under `Winter`, 5 under `D-term` —
grouped by department, each as:

```
PHIL 380A: Special Topic in Philosophy: Intellectual Origins of Antizionism

(3 Credits; Faculty: Kraynak)

Course Description:
...
```

Some descriptions carry a restriction, indented under the prose:

```
       Not available to students who have taken INF 1320 Intellectual
       Foundations of Economics with Professor Scheall.
```

Against `data/courses.json`: 46 codes match the 2026-2027 catalog directly, 15
are lettered special-topic variants whose base code exists (`PHIL 380A` →
`PHIL 380`, which `getCourse` already falls back on), and 2 exist nowhere —
`LEAD 380A` and `POLR 380A`. There is no `LEAD` subject in the catalog at all,
and `POLR` stops at 313 before jumping to 490.

## Generated data: `data/offerings.json`

`data/raw/` holds text dumps rather than source documents — that is how both
catalogs' OCR is committed, and it is what keeps CI hermetic, since the runner
installs only `scripts/requirements.txt` and has no PDF tooling. So:

1. `data/raw/offerings_winter_dterm_2627.txt` — `pdftotext -layout` output,
   committed.
2. `scripts/extract_offerings.py` — parses that text, added to `npm run data`.

Turning the PDF into the dump is a manual step, the same deal as `ocr.swift`
today. `npm run data` will not re-read the PDF. The README says so.

```json
{
  "source": "Winter and D-Term 26/27 Course Descriptions, retrieved 2026-09-21",
  "terms": [
    { "id": "winter-2627", "name": "Winter 26/27", "order": 1 },
    { "id": "dterm-2627",  "name": "D-Term 26/27", "order": 2 }
  ],
  "offerings": [
    {
      "term": "winter-2627",
      "code": "PHIL 380A",
      "catalogCode": "PHIL 380",
      "title": "Special Topic in Philosophy: Intellectual Origins of Antizionism",
      "credits": 3.0,
      "faculty": ["Kraynak"],
      "department": "Philosophy",
      "note": null,
      "sections": []
    }
  ]
}
```

`code` is the offering as printed; `catalogCode` is what the audit reasons
with, so a lettered special topic fills whatever its base code fills. `note`
carries a restriction line where the description has one. `sections` is always
present and always empty from this source — see *Room left deliberately*.

**Uncatalogued offerings.** `LEAD 380A` and `POLR 380A` go in an
`UNCATALOGUED` table in the script, each with a note, rather than passing
through silently. The repo's rule is that a script fails loudly instead of
guessing, and an unknown code is exactly the case that rule is for. They stay
in `offerings.json` with `catalogCode: null` — offered, plannable, and counted
toward a term's credits, but unable to fill a named requirement, and the UI
says why. A new code appearing in a future dump fails the build until someone
either confirms it against a catalog or adds it here.

## Projecting the record forward

`auditDegree(taken, opts)` is already a pure function of the course list, so
the projection needs no change to the audit internals. `lib/plan.ts`:

```ts
projectRecord(taken: TakenCourse[]): TakenCourse[]
```

maps `in-progress` → `completed` and leaves everything else alone. In
particular `incomplete` (graded I) is untouched: that is unfinished work under
an agreed extension, not a course being attempted now, and assuming it passes
would be a different and less safe assumption than the one the feature makes.

Planning a term also projects the terms before it. Planning D-Term means the
record you are measured against is today's, plus this term's in-progress work,
plus everything marked Definitely for Winter — because Definitely means you
intend to take it, and a plan for D-Term that ignored Winter would be
answering the wrong question. Maybe and Considering never project this way.

The projection is **non-destructive**. It is computed for the view and never
written to the saved record, so turning the switch off returns to today's
standing. That also means a projected audit cannot be shared as though it were
real: the share link carries the record and the plan, never the projection.

## The plan

```ts
export type PlanTier = "definitely" | "maybe" | "considering";
/** Keyed "termId:code", so one course can be planned in two terms. */
export type Plan = Record<string, PlanTier>;
```

`plan` joins `SavedState`. It stays separate from the existing `targets`,
which sorts Centers and concentrations into committed/considering — a
different kind of object on a different scale, and merging them would blur
both.

**How a tier counts.** Definitely feeds forward: in plan mode it is treated as
projected-pending, so the requirements it would close show as closing and the
suggestion list stops offering it. Maybe and Considering are shown as what-if
only and never displace a Definitely. This is the rule `targets` already
follows, applied to courses.

**Suggestions.** `suggestNextCourses` takes an optional set of offered codes.
When planning a term it is restricted to that term's offerings; the scoring,
the tiers and the interleaving are untouched. A course that closes two
requirements still outranks one that closes one — the filter only decides who
is eligible, never who wins.

Each term reports its own planned credit total, against the per-term figure
`pacing()` already computes.

## Prerequisite warnings

`lib/prereq.ts`. Of the 174 catalog courses with a prerequisite, 173 are clean
code expressions — `"AMCV 200 or INF 2121"`, `"AMCV 310"`. The single
exception is `PHYS 310: "PHYS 220 MATH 240"`, two codes with no connector and
an implied "and".

Parse into `string[][]` — the same options-of-codes shape `Slot.options`
already uses, where the outer array is alternatives and the inner one is a set
that must all be held. Check against the projected record **plus** every
Definitely in a term at or before the one being planned, so a Winter
Definitely satisfies a D-Term prerequisite.

Anything that does not parse to codes is displayed verbatim and marked as not
checkable, never guessed at. The offerings' own `note` lines are shown the
same way, since "Latin I or equivalent proficiency" is a judgement call and
the app does not make it.

A warning never blocks. It is advice next to a course you have already chosen.

## Share links

One more key in the compact format: `pl=`, as `term:code~tier` joined by `.`,
tiers written `d`, `m` and `c` for definitely, maybe and considering. Those
letters live in their own namespace and are not the `c`/`s` that `f=` uses for
targets, because the two scales are not the same scale. An absent key means an
empty plan, so every existing link keeps working — the same way `f=` was added
for targets.

The projection switch is deliberately not shared. A link carries what is true
plus what is planned, and the receiver projects from their own record.

## UI

- A switch beside the existing "terms remaining" input: *Where you stand
  today* / *Planning Winter 26/27* / *Planning D-Term 26/27*.
- In plan mode, "What to take next" becomes that term's recommendations, each
  row carrying the three tier buttons, above a collapsed "Browse all 58 Winter
  offerings" for anything the ranking did not surface.
- A plan summary per term: the courses at each tier and the credit total.
- The requirements panel shades projected-satisfied differently from actually
  satisfied, and labels it, so the two can never be read as the same thing.

## Testing

Alongside the existing 138 vitest tests.

- **Data**: every `catalogCode` resolves in the catalog or is declared
  uncatalogued; credits agree with the catalog wherever both know a course;
  the terms hold 58 and 5.
- **`projectRecord`**: in-progress becomes completed, incomplete and failed do
  not move, and the input array is not mutated.
- **Prereqs**: `"AMCV 200 or INF 2121"` parses to two alternatives;
  `"PHYS 220 MATH 240"` to one alternative of two codes; prose is reported
  unparseable; a Winter Definitely satisfies a D-Term prerequisite.
- **Suggestions**: the offered filter removes unoffered courses and changes
  nothing else about the ranking.
- **Round trip**: a plan survives encode/decode, and a link written before
  `pl=` existed still decodes.

## Room left deliberately

`Documents/UATX/Spring 2026/Spring Course Schedule for Micah.csv` is a Populi
export of every section offered in a term, carrying meeting times, section
numbers, instructor, seats taken against seats available, and the add/drop
deadline. No Winter 26/27 equivalent has been exported yet.

If one is, schedule-conflict detection becomes possible, along with "this
section is full" and several meeting times for one course — which is most of
what makes a term plannable. That is why every offering carries a `sections`
array that this source always leaves empty. Filling it later is additive and
needs no redesign.

## Not doing

- **Conflict detection.** The PDF has no meeting times. See above.
- **Planning further than the data goes.** Skip-ahead reaches the two terms in
  the download; it does not model a hypothetical third.
- **Editing offerings in the browser.** They are generated data, like the
  catalog, and a correction belongs in the script's override table.
- **Registration.** The app does not know seats, holds, or advisor approval,
  and must not look as though it does.

This remains a study aid, not an official audit.
