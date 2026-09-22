# UATX Degree Audit

Enter the courses you have taken and see where you stand against the UATX
2026-2027 Bachelor of Arts in Liberal Studies — all eight concentrations at
once, with old-catalog coursework mapped through the published equivalencies.

A single static page. No accounts, no server, no database: your record lives in
your own browser, and a shareable link carries a plan to someone else who can
then edit their own copy.

## What it does

- **Reads your transcript.** Drop the PDF in and it is parsed in the browser —
  nothing is uploaded. Or search the catalog and add courses one at a time. The
  upload panel tells you where Populi hides the export.
- **Audits against either catalog.** A switch at the top chooses between the
  2026-2027 program (Liberal Studies major with academic concentrations) and the
  2024-2025 one (elect a Center, then its Foundations and Core). The old program
  shows its three Centers and their four concentrations. Its requirements are
  written in old course codes, so nothing is translated when auditing against it.
- **Speaks both catalogs.** Old codes (`ALT 1010`, `STM 2102`, `EPH 1300`) are
  translated into their 2026-2027 counterparts using the university's
  equivalency tables, including the combined cases (`ALT 1100` + `ALT 1120`
  together satisfy `PHIL 130`) and the one-to-many ones (`STM 2102` is both
  `MATH 230` and `MATH 231`).
- **Scores every concentration at once**, sorted by how close you are. Every
  pillar and every concentration group lists its requirements one by one,
  marked done, under way, or still open, and names the course of yours that
  filled each — "Ancient Rome, HIST 115 from your ALT 1010".
- **Reads your grades.** Courses are scored 0-100 and anything below 60 fails,
  so failed work earns no credit and fills no requirement. W, I, AU, U, P and S
  are handled too. Your cumulative CSA is checked against the 73 needed to
  graduate.
- **Follows what you are aiming at.** Mark any Center or concentration
  *Committed* or *Considering*. Committed work weighs as much as a graduation
  requirement, considering counts but never displaces it, and both reorder
  "what to take next" — each suggestion says which tier put it there.
  Committing to a concentration also elects the Center it sits in, which is
  what decides whose Core you owe.
- **Plans next term.** Skip ahead a term and the audit assumes you pass what
  you are taking now, then ranks what to take next against the courses that
  term actually runs rather than the whole catalog. File each one under
  Definitely, Maybe or Considering. Definitely carries forward, so a Winter
  choice counts when you plan D-Term; Maybe and Considering are shown but
  never close anything. A course whose prerequisite you will not hold is
  flagged, and one the catalog states in prose is quoted rather than guessed
  at.
- **Logs Polaris Build.** Build is a credit total rather than a class, so it is
  logged instead of enrolled in: add credits in whatever amounts the work is
  granted, label them, and mark them still under way until they are. The log is
  kept apart from the course record, so re-uploading a transcript cannot wipe a
  term of logging, and it warns you when your record already reports Build
  credit that logged entries would sit on top of.
- **Paces the rest of the degree.** Tell it how many terms you have left and it
  reports the credits per term you need to average.

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 201 tests
npm run build
```

## Deploying

`main` is connected to the Vercel project, so a push deploys to production; a
push to any other branch gets its own preview URL. `npx vercel deploy --prod
--yes` still works if you want to ship without a commit.

Every push and pull request runs `.github/workflows/ci.yml`: the tests, a
production build, and a check that `data/` still reproduces from its sources.
The data tests are what make an edit to `data/*.json` safe to accept from
someone who cannot run the suite themselves — they check that every requirement
names a course that exists, that the pillars still sum to 180, and that
Foundations still adds to 57.

## Where the data comes from

Both catalogs are image-only PDFs with no text layer, so the course data was
produced by OCR and is committed to `data/`. The site never reads the PDFs.

| File | Contents |
| --- | --- |
| `data/courses.json` | 506 current + 235 legacy courses: code, title, credits, prerequisites |
| `data/equivalencies.json` | 123 rules: the equivalency tables, 14 clearly labelled inferred ones, 3 that refine an official rule, and 3 scoped to the old catalog alone |
| `data/requirements.json` | 2026-2027: Intellectual Foundations, the major's credit floors, 8 concentrations, Polaris |
| `data/requirements-2024.json` | 2024-2025: Intellectual Foundations, 3 Centers, 4 concentrations, Polaris |
| `data/offerings.json` | 63 courses Winter 26/27 and D-Term 26/27 actually run: the code the catalog knows each by, credits, faculty, department |

Regenerate with `npm run data` (once: `pip install -r scripts/requirements.txt`),
which runs five scripts in `scripts/`:

1. `extract_courses.py` parses the OCR text of both catalogs.
2. `extract_equivalencies.py` turns the equivalency `.docx` tables into rules.
3. `build_requirements.py` and `build_requirements_2024.py` emit the two
   programs' requirements and check every course code they name actually exists.
4. `extract_offerings.py` parses the term's course descriptions into the
   offerings file, and checks each code against the catalog.

The output is reproducible: regenerating from the committed sources produces
`data/` byte for byte, and CI fails if it ever stops doing so. So a hand-edit to
a generated file works and deploys, but is lost the next time anyone regenerates
— a correction that needs to survive belongs in the script's `OVERRIDES` table.

The term's offerings come from a different kind of source. *Winter and D-Term
26/27 Course Descriptions* has a real text layer, so no OCR is needed, but
turning the PDF into `data/raw/offerings_winter_dterm_2627.txt` is a manual
step and `npm run data` does not do it:

```bash
pdftotext -layout "Winter and D-Term 2026 - Course Descriptions.pdf" \
  data/raw/offerings_winter_dterm_2627.txt
```

`extract_offerings.py` then parses that dump, and declares its exceptions
rather than smoothing them over. Two of the 63 courses, `LEAD 380A` and
`POLR 380A`, are in no catalog at all: they stay plannable and count toward
the term's credits, but fill no named requirement, and each says why.
`PHIL 410` runs at 1.5 credits where the catalog gives Great Philosophers 3,
which is recorded the same way. A code in neither the catalog nor those
tables fails the build instead of being guessed at.

The OCR itself (`scripts/ocr.swift`, `scripts/reflow.py`) used Apple's Vision
framework across all 335 pages, keeping bounding boxes so the multi-column
requirement tables could be reconstructed rather than scrambled.

Each script fails loudly instead of guessing. Equivalency prose it cannot parse
confidently has to be hand-encoded in an `OVERRIDES` table, and the credit
arithmetic reconciles independently: Foundations sums to 57, every
concentration to 18 lower + 18 upper, Polaris to 27, and the pillars to 180.

## Two things worth knowing

**Credits and satisfaction are tracked separately.** Credits always come from
what you actually earned, so the totals match your transcript; requirement
satisfaction comes from the course your work maps to. That is why a 4.5-credit
`STM 2102` stays worth 4.5 credits even though it maps to two 1.5-credit
courses.

**A failed course looks exactly like one in progress on a transcript** — both
show 0.00 earned credits. Status is therefore read from the grade column
against the catalog's scale (pp. 19-20), not from the credit column. A D
(60-72) is "poor" by the catalog's own descriptor but still passes, so it is
not treated as a failure.

**Inferred mappings are marked and optional.** Fourteen mappings are implied by the
two catalogs but not stated in the equivalency document — for example the
catalog's own `Prerequisite: AMCV 200 or INF 2121` implies those two are
interchangeable. They are on by default, labelled "Provisional" wherever they
affect a result, and can be switched off.

The 2024-2025 catalog contradicts itself in a few places, naming courses by
numbers its own description section does not use (`EPH 1610`, `EPH 1810`,
`POL 3150`). Those are matched by title in `build_requirements_2024.py`, and
each correction is recorded on the requirement that uses it.

Two codes in the equivalency document do not exist in the 2026-2027 catalog and
are corrected in `extract_equivalencies.py`, with the correction recorded on the
rule: `LAW 380` is now `LAWS 380`, and the document's "HIST 380 Special Topic in
History (1.5)" is `HIST 379` (the catalog gives `HIST 380` to Postmodernism and
Postcolonialism).

This is a study aid, not an official audit. Confirm anything that matters with
your advisor.
