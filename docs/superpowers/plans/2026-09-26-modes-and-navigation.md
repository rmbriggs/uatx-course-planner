# Two Modes and Clearer Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the planner into a "Where I stand" mode and a "Plan a term" mode, keep the record in the left sidebar (now with the Build log), gather settings into one menu, and relabel buttons so each says what it does.

**Architecture:** `app/page.tsx` keeps all state and derived data (audit, projection, suggestions) and becomes a thin shell: header, `ModeSwitch`, `Meridian`, sidebar `RecordPanel`, and either `StandView` or `PlanView` in the main column. Mode is the existing `state.planningTerm` (`null` = Where I stand). The two views and `Settings` are new components carved out of today's 870-line page; `SuggestionTable` is shared by both views.

**Tech Stack:** Next 15, React 19, TypeScript, Vitest (node environment, components tested with `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-09-26-modes-and-navigation-design.md`

## Global Constraints

- Layout and wording only: no change to `lib/audit.ts`, `lib/plan.ts`, `lib/prereq.ts`, `lib/storage.ts` behavior, or share-link format.
- Stored values stay `"considering"` in both `Interest` and `PlanTier`; only labels change (Exploring, Backup).
- `planningTerm` is still dropped from share links, so a link opens on Where I stand.
- Work happens in `~/Developer/uatx-course-planner/.claude/worktrees/modes-and-nav` on branch `ui/modes-and-nav`. `node_modules` is a symlink to the main checkout's.
- Match surrounding style: comments explain *why* in full sentences, `fmt()` for credit numbers, CSS tokens from `:root` in `app/globals.css`.
- Run tests with `npx vitest run` from the worktree root; build with `npx next build`.

## Review Focus

- A saved `planningTerm` naming a term no longer in `data/offerings.json` → the page opens on Where I stand, not an empty plan. (Task 2, `knownTerm` test)
- A plan saved or shared before the relabel, holding `"considering"` → shows with **Backup** pressed. (Task 1 test)
- Only one term on file → the switch reads "Plan Winter 26/27" and shows no term select. (Task 2 test)
- A transcript-only status (Withdrawn, Incomplete, Audited) → the status select keeps it rather than snapping to Done. (Task 4 test)
- Plan mode with an empty record → plan, find, suggestions and browse still render. (Task 6 test)

---

### Task 1: Relabel Considering → Exploring / Backup, and the plan search

**Files:**
- Modify: `components/PlanPanel.tsx` (TIERS label, `PlanSearch` label, empty-plan note)
- Modify: `app/page.tsx` (target strip, aiming chip, guidance note, `TIER_LABEL`)
- Modify: `README.md:34-54`
- Test: `components/PlanPanel.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TierButtons` renders labels Definitely / Maybe / Backup; `PlanSearch` label reads `Find a course for {termName(termId)}`.

- [ ] **Step 1: Update the tests to the new labels**

In `components/PlanPanel.test.tsx`, replace the `TierButtons` describe block with:

```tsx
describe("TierButtons", () => {
  it("offers all three tiers and presses the one in force", () => {
    const markup = renderToStaticMarkup(<TierButtons value="maybe" onChange={noop} />);
    expect(text(markup)).toContain("Definitely");
    expect(text(markup)).toContain("Maybe");
    expect(text(markup)).toContain("Backup");
    expect(text(markup)).not.toContain("Considering");
    expect(markup).toContain('data-tier="maybe" aria-pressed="true"');
    expect(markup).toContain('data-tier="definitely" aria-pressed="false"');
  });

  it("shows a plan saved before the relabel as Backup", () => {
    // Saved state and old share links still hold "considering".
    const markup = renderToStaticMarkup(<TierButtons value="considering" onChange={noop} />);
    expect(markup).toMatch(/data-tier="considering" aria-pressed="true"[^>]*>Backup</);
  });
});
```

In the "looking a course up while planning" block, change the search-box test and the three-tiers test:

```tsx
  it("labels the search with the term it searches", () => {
    const markup = renderToStaticMarkup(
      <PlanSearch termId="winter-2627" plan={{}} held={held} onChange={noop} />,
    );
    expect(markup).toContain('id="plan-search"');
    expect(text(markup)).toContain("Find a course for Winter 26/27");
  });

  it("offers the three tiers on a course the term runs", () => {
    const markup = results("linear algebra");
    expect(text(markup)).toContain("MATH 210");
    expect(text(markup)).toContain("Definitely");
    expect(text(markup)).toContain("Maybe");
    expect(text(markup)).toContain("Backup");
  });
```

Add `PlanSearch` to the import on line 3:

```tsx
import { BrowseOfferings, PlanPanel, PlanSearch, PlanSearchResults, TierButtons } from "./PlanPanel";
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/PlanPanel.test.tsx`
Expected: FAIL — "Backup" not found, "Find a course for Winter 26/27" not found.

- [ ] **Step 3: Change the labels**

In `components/PlanPanel.tsx`, the TIERS constant:

```tsx
// "considering" is still the stored value, so plans saved and links shared
// before the relabel keep working; only what the button says changed, to stop
// it colliding with Exploring a concentration.
const TIERS: { id: PlanTier; label: string }[] = [
  { id: "definitely", label: "Definitely" },
  { id: "maybe", label: "Maybe" },
  { id: "considering", label: "Backup" },
];
```

In `PlanSearch`, the label:

```tsx
      <label htmlFor="plan-search" className="eyebrow">
        Find a course for {termName(props.termId)}
      </label>
```

In `PlanPanel`, the empty note:

```tsx
        <p className="note">
          Nothing planned yet. Find a course below, mark one from the suggestions, or browse everything the
          term runs.
        </p>
```

In `app/page.tsx`: the target strip label becomes `{tier === "committed" ? "Committed" : "Exploring"}`; the aiming chip's text `Considering` becomes `Exploring`; the guidance note becomes `Mark one Committed or Exploring above and this list follows it — committing also settles which Center’s Core you need.` (keep the existing `&mdash;`/`&rsquo;` entities); and `TIER_LABEL.considering` becomes `"Exploring"`.

In `README.md`, replace "*Committed* or *Considering*. Committed work weighs as much as a graduation requirement, considering counts" with "*Committed* or *Exploring*. Committed work weighs as much as a graduation requirement, exploring counts", and in the Plans next term bullet replace "Definitely, Maybe or Considering" with "Definitely, Maybe or Backup" and "Maybe and Considering are shown" with "Maybe and Backup are shown".

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add components/PlanPanel.tsx components/PlanPanel.test.tsx app/page.tsx README.md
git commit -m "Call a backup course Backup, and a concentration you are weighing Exploring"
```

---

### Task 2: `knownTerm` and the mode switch

**Files:**
- Modify: `lib/offerings.ts` (add `knownTerm`)
- Test: `lib/offerings.test.ts`
- Create: `components/ModeSwitch.tsx`
- Test: `components/ModeSwitch.test.tsx`

**Interfaces:**
- Consumes: `terms: Term[]` from `lib/offerings.ts`; `Term` from `lib/types.ts` (`{ id, name, order }`).
- Produces:
  - `knownTerm(id: string | null | undefined): string | null`
  - `ModeSwitch(props: { terms: Term[]; planningTerm: string | null; defaultTerm: string; onChange: (termId: string | null) => void })`

- [ ] **Step 1: Write the failing tests**

Append to `lib/offerings.test.ts` (add `knownTerm` to its existing import from `./offerings`):

```ts
describe("knownTerm", () => {
  it("keeps a term that is on file", () => {
    expect(knownTerm("winter-2627")).toBe("winter-2627");
  });

  it("drops a term that is no longer on file, so the page opens on where you stand", () => {
    expect(knownTerm("spring-2526")).toBeNull();
    expect(knownTerm(null)).toBeNull();
    expect(knownTerm(undefined)).toBeNull();
  });
});
```

Create `components/ModeSwitch.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModeSwitch } from "./ModeSwitch";
import { terms } from "@/lib/offerings";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("ModeSwitch", () => {
  it("selects Where I stand when no term is being planned", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms} planningTerm={null} defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(markup).toMatch(/aria-selected="true"[^>]*>Where I stand</);
    expect(markup).toMatch(/aria-selected="false"[^>]*>Plan a term</);
  });

  it("selects Plan a term and the term being planned", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms} planningTerm="dterm-2627" defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(markup).toMatch(/aria-selected="true"[^>]*>Plan a term</);
    expect(markup).toContain('<option value="dterm-2627" selected="">D-Term 26/27</option>');
    expect(text(markup)).toContain("Winter 26/27");
  });

  it("names the only term instead of offering a choice of one", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={terms.slice(0, 1)} planningTerm={null} defaultTerm="winter-2627" onChange={noop} />,
    );
    expect(text(markup)).toContain("Plan Winter 26/27");
    expect(markup).not.toContain("<select");
  });

  it("renders nothing when no term is on file", () => {
    const markup = renderToStaticMarkup(
      <ModeSwitch terms={[]} planningTerm={null} defaultTerm="" onChange={noop} />,
    );
    expect(markup).toBe("");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/offerings.test.ts components/ModeSwitch.test.tsx`
Expected: FAIL — `knownTerm` is not exported; `./ModeSwitch` cannot be resolved.

- [ ] **Step 3: Implement**

Append to `lib/offerings.ts`:

```ts
/**
 * The term to plan, if it is still on file. Saved state can outlive the
 * offerings it was planned against, and a term that has gone should drop the
 * page back to where you stand rather than open an empty plan.
 */
export function knownTerm(id: string | null | undefined): string | null {
  return id && terms.some((t) => t.id === id) ? id : null;
}
```

Create `components/ModeSwitch.tsx`:

```tsx
"use client";

import type { Term } from "@/lib/types";

/**
 * Where I stand, or planning a term. Planning re-projects every number on the
 * page, so it is a mode you visibly enter and leave rather than a setting
 * tucked in the sidebar.
 */
export function ModeSwitch({
  terms,
  planningTerm,
  defaultTerm,
  onChange,
}: {
  terms: Term[];
  planningTerm: string | null;
  /** The term Plan a term opens on when none is being planned. */
  defaultTerm: string;
  onChange: (termId: string | null) => void;
}) {
  if (terms.length === 0) return null;
  const chosen = planningTerm ?? defaultTerm;
  const only = terms.length === 1 ? terms[0] : null;

  return (
    <div className="mode-switch">
      <div role="tablist" aria-label="What the page shows" className="mode-tabs-top">
        <button
          type="button"
          role="tab"
          className="mode-tab"
          aria-selected={planningTerm === null}
          onClick={() => onChange(null)}
        >
          Where I stand
        </button>
        <button
          type="button"
          role="tab"
          className="mode-tab"
          aria-selected={planningTerm !== null}
          onClick={() => onChange(chosen)}
        >
          {only ? `Plan ${only.name}` : "Plan a term"}
        </button>
      </div>
      {!only && (
        <select
          className="mode-term"
          aria-label="Term to plan"
          value={chosen}
          onChange={(e) => onChange(e.target.value)}
        >
          {terms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/offerings.test.ts components/ModeSwitch.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/offerings.ts lib/offerings.test.ts components/ModeSwitch.tsx components/ModeSwitch.test.tsx
git commit -m "Switch between where you stand and planning a term"
```

---

### Task 3: Settings menu

**Files:**
- Create: `components/Settings.tsx`
- Test: `components/Settings.test.tsx`

**Interfaces:**
- Consumes: `PROGRAMS` from `lib/catalog.ts`; `pacing` return type from `lib/audit.ts` (`{ creditsRemaining, creditsPerTerm, typicalLoad, ... }`); `ProgramId` from `lib/types.ts`.
- Produces: `Settings(props: { program: ProgramId; onProgram: (p: ProgramId) => void; termsRemaining: number; onTermsRemaining: (n: number) => void; pace: ReturnType<typeof pacing>; useInferred: boolean; onUseInferred: (on: boolean) => void; inferredCount: number })`

- [ ] **Step 1: Write the failing test**

Create `components/Settings.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Settings } from "./Settings";
import { auditDegree, pacing } from "@/lib/audit";
import type { ProgramId } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const render = (program: ProgramId) =>
  renderToStaticMarkup(
    <Settings
      program={program}
      onProgram={noop}
      termsRemaining={6}
      onTermsRemaining={noop}
      pace={pacing(auditDegree([{ code: "WRIT 120", credits: 3, status: "completed" }]), 6)}
      useInferred
      onUseInferred={noop}
      inferredCount={2}
    />,
  );

describe("Settings", () => {
  it("gathers catalog, terms left and equivalencies in one menu", () => {
    const out = text(render("2026-2027"));
    expect(out).toContain("Settings");
    expect(out).toContain("Catalog");
    expect(out).toContain("Terms left before you graduate");
    expect(out).toContain("Use proposed equivalencies");
    expect(out).toContain("2 of your courses rely on one");
  });

  it("presses the catalog in force", () => {
    const markup = render("2024-2025");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>[^<]*2024/);
    expect(text(markup)).toContain("The 2024-2025 requirements are written in the course codes you took");
  });

  it("states the pace the terms left imply", () => {
    expect(text(render("2026-2027"))).toMatch(/\d+ credits left, so [\d.]+ a term/);
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run components/Settings.test.tsx`
Expected: FAIL — cannot resolve `./Settings`.

- [ ] **Step 3: Implement**

Create `components/Settings.tsx` (content moved from the page's header segmented control and sidebar Planning panel):

```tsx
"use client";

import type { pacing } from "@/lib/audit";
import { PROGRAMS } from "@/lib/catalog";
import type { ProgramId } from "@/lib/types";

/**
 * The three things that change how the audit is measured, kept together.
 * They used to sit in the header, the sidebar and below a dropdown, which
 * made them hard to find and harder to tell apart from the record itself.
 */
export function Settings({
  program,
  onProgram,
  termsRemaining,
  onTermsRemaining,
  pace,
  useInferred,
  onUseInferred,
  inferredCount,
}: {
  program: ProgramId;
  onProgram: (program: ProgramId) => void;
  termsRemaining: number;
  onTermsRemaining: (terms: number) => void;
  pace: ReturnType<typeof pacing>;
  useInferred: boolean;
  onUseInferred: (on: boolean) => void;
  inferredCount: number;
}) {
  const relying = inferredCount > 0 ? ` ${inferredCount} of your courses rely on one.` : "";

  return (
    <details className="settings">
      <summary className="btn">Settings</summary>
      <div className="settings-body panel">
        <div className="panel-body">
          <p className="eyebrow">Catalog</p>
          <div className="segmented" role="group" aria-label="Which catalog to measure against">
            {PROGRAMS.map((prog) => (
              <button
                key={prog.id}
                type="button"
                className="segment"
                aria-pressed={program === prog.id}
                title={prog.blurb}
                onClick={() => onProgram(prog.id)}
              >
                {prog.label}
              </button>
            ))}
          </div>

          <div className="field-row" style={{ marginTop: "1rem" }}>
            <label htmlFor="terms">Terms left before you graduate</label>
            <input
              id="terms"
              type="number"
              min={1}
              max={20}
              value={termsRemaining}
              onChange={(e) => onTermsRemaining(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <p className="settings-note">
            {pace.creditsRemaining} credits left, so {fmt(pace.creditsPerTerm)} a term
            {pace.creditsPerTerm > pace.typicalLoad
              ? " — heavier than the normal 15-credit load."
              : " — within the normal 15-credit load."}
          </p>

          <label className="switch" style={{ marginTop: "1rem" }}>
            <input type="checkbox" checked={useInferred} onChange={(e) => onUseInferred(e.target.checked)} />
            Use proposed equivalencies
          </label>
          <p className="settings-note">
            {program === "2024-2025"
              ? "The 2024-2025 requirements are written in the course codes you took, so the old-to-new equivalencies are not applied. The proposals here are the ones that hold inside the old catalog, between a special-topics number and the course whose content it delivered."
              : "The equivalency document has no table for INF courses, so these are read from the two catalogs’ own course descriptions. Each says why on the mapping table under Record details."}
            {relying}
          </p>
        </div>
      </div>
    </details>
  );
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `npx vitest run components/Settings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Settings.tsx components/Settings.test.tsx
git commit -m "Gather the catalog, terms left and equivalencies into one Settings menu"
```

---

### Task 4: Record sidebar — status select, confirm, labelled search, Build log

**Files:**
- Modify: `components/RecordPanel.tsx`
- Test: `components/RecordPanel.test.tsx` (create)

**Interfaces:**
- Consumes: `BuildLog` from `components/Requirements.tsx` (props `{ log, onAdd, onRemove, onToggle, alsoOnTranscript }`).
- Produces: `RecordPanel(props: { taken: TakenCourse[]; onReplace; onAdd; onRemove; onSetStatus: (index: number, status: CourseStatus) => void; build: React.ComponentProps<typeof BuildLog> })`. `onToggleStatus` is removed. The Build log panel carries `id="build-log"` so the Progress section can link to it.

- [ ] **Step 1: Write the failing test**

Create `components/RecordPanel.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordPanel } from "./RecordPanel";
import type { TakenCourse } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const taken: TakenCourse[] = [
  { code: "WRIT 120", credits: 3, status: "completed", grade: "88", term: "Fall 2025" },
  { code: "MATH 101", credits: 3, status: "withdrawn", grade: "W", term: "Fall 2025" },
];

const markup = renderToStaticMarkup(
  <RecordPanel
    taken={taken}
    onReplace={noop}
    onAdd={noop}
    onRemove={noop}
    onSetStatus={noop}
    build={{ log: [{ credits: 1.5, status: "completed" }], onAdd: noop, onRemove: noop, onToggle: noop, alsoOnTranscript: false }}
  />,
);

describe("RecordPanel", () => {
  it("says what the search tab does", () => {
    expect(text(markup)).toContain("Add a course you've taken");
  });

  it("sets a course's status from a select, not by clicking its label", () => {
    expect(markup).toContain('aria-label="How WRIT 120 counts"');
    expect(markup).toContain('<option value="completed" selected="">Done</option>');
    expect(text(markup)).toContain("88");
  });

  it("keeps a transcript-only status instead of snapping to Done", () => {
    expect(markup).toContain('<option value="withdrawn" selected="">Withdrawn</option>');
  });

  it("carries the Build log, anchored so Progress can link to it", () => {
    expect(markup).toContain('id="build-log"');
    expect(text(markup)).toContain("Build log");
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run components/RecordPanel.test.tsx`
Expected: FAIL — no "Add a course you've taken", no select, no `build-log` (TypeScript prop errors are not checked by Vitest; the assertions fail).

- [ ] **Step 3: Implement**

In `components/RecordPanel.tsx`:

Imports — add `BuildLog`:

```tsx
import { BuildLog } from "./Requirements";
```

Props:

```tsx
interface Props {
  taken: TakenCourse[];
  onReplace: (courses: TakenCourse[], meta?: { csa?: number }) => void;
  onAdd: (course: TakenCourse) => void;
  onRemove: (index: number) => void;
  onSetStatus: (index: number, status: CourseStatus) => void;
  /** Build is logged, not enrolled in, but it is still something you record. */
  build: React.ComponentProps<typeof BuildLog>;
}

export function RecordPanel({ taken, onReplace, onAdd, onRemove, onSetStatus, build }: Props) {
```

Tab label: `{m === "upload" ? "Upload transcript" : "Add a course you've taken"}`.

Search-mode helper line under the label stays; the label itself becomes `Search the 2026-2027 catalog and the old one.` (unchanged).

Wrap the return in a fragment, confirm Remove all, pass `onSetStatus`, and add the Build log panel:

```tsx
  return (
    <>
      <div className="panel">
        <div className="panel-body">
          {/* ...eyebrow, mode tabs, upload/search, message: unchanged... */}

          <RecordList taken={taken} onRemove={onRemove} onSetStatus={onSetStatus} />

          {taken.length > 0 && (
            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  if (window.confirm(`Remove all ${taken.length} courses from your record?`)) onReplace([]);
                }}
              >
                Remove all courses
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="panel" id="build-log" style={{ marginTop: "1rem" }}>
        <div className="panel-body">
          <BuildLog {...build} />
        </div>
      </div>
    </>
  );
```

`RecordList` signature and status control:

```tsx
/** What someone would set by hand. The transcript can also say Incomplete,
 *  Withdrawn or Audited, and a row holding one of those keeps it as an option
 *  rather than being silently turned into Done. */
const SETTABLE: CourseStatus[] = ["completed", "in-progress", "failed", "waived"];

function RecordList({
  taken,
  onRemove,
  onSetStatus,
}: {
  taken: TakenCourse[];
  onRemove: (i: number) => void;
  onSetStatus: (i: number, status: CourseStatus) => void;
}) {
```

and replace the status `<button className={`mark...`}>` with:

```tsx
                  <select
                    className={`mark status-select${STATUS_DISPLAY[course.status].className}`}
                    aria-label={`How ${course.code} counts`}
                    value={course.status}
                    onChange={(e) => onSetStatus(index, e.target.value as CourseStatus)}
                  >
                    {(SETTABLE.includes(course.status) ? SETTABLE : [course.status, ...SETTABLE]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_DISPLAY[s].label}
                      </option>
                    ))}
                  </select>
                  {course.grade && course.grade !== "IP" && <span className="mono grade">{course.grade}</span>}
```

Update the fallback message in `handleFile` from "add your courses with Search instead" to "add your courses one at a time instead".

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/RecordPanel.test.tsx`
Expected: PASS. (`app/page.tsx` still passes `onToggleStatus`; it is rewired in Task 7, and Vitest does not type-check it.)

- [ ] **Step 5: Commit**

```bash
git add components/RecordPanel.tsx components/RecordPanel.test.tsx
git commit -m "Set a course's status from a list, ask before removing everything, and keep the Build log with the record"
```

---

### Task 5: Shared suggestion table and the Where I stand view

**Files:**
- Create: `components/Suggestions.tsx`
- Create: `components/StandView.tsx`
- Test: `components/StandView.test.tsx`

**Interfaces:**
- Consumes: `AuditResult`, `suggestNextCourses`, `SuggestionTier` from `lib/audit.ts`; `getRequirements`, `grading` from `lib/catalog.ts`; `mappedGrants` from `lib/equivalency.ts`; `PillarBlock`, `CenterDetail`, `ConcentrationDetail` from `components/Requirements.tsx`; `OfferedChip`.
- Produces:
  - `type Suggested = ReturnType<typeof suggestNextCourses>[number]`
  - `SuggestionTable(props: { next: Suggested[]; planCell?: (code: string) => ReactNode; empty?: string })`
  - `StandView(props: { audit: AuditResult; program: ProgramId; targets: Targets; onTarget: (id: string, tier: Interest) => void; onClearTargets: () => void; next: Suggested[]; csa: number | undefined })`

- [ ] **Step 1: Write the failing test**

Create `components/StandView.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StandView } from "./StandView";
import { auditDegree, suggestNextCourses } from "@/lib/audit";
import type { TakenCourse } from "@/lib/types";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const render = (record: TakenCourse[]) => {
  const audit = auditDegree(record);
  return renderToStaticMarkup(
    <StandView
      audit={audit}
      program="2026-2027"
      targets={{}}
      onTarget={noop}
      onClearTargets={noop}
      next={suggestNextCourses(audit, {}, 10)}
      csa={undefined}
    />,
  );
};

const clean = render([{ code: "WRIT 120", credits: 3, status: "completed" }]);

describe("StandView", () => {
  it("lays out Progress, Concentrations and Take next, in that order", () => {
    const at = (id: string) => clean.indexOf(`id="${id}"`);
    expect(at("progress")).toBeGreaterThan(-1);
    expect(at("concentrations")).toBeGreaterThan(at("progress"));
    expect(at("next")).toBeGreaterThan(at("concentrations"));
  });

  it("links to each section from the jump bar", () => {
    expect(clean).toContain('href="#progress"');
    expect(clean).toContain('href="#concentrations"');
    expect(clean).toContain('href="#next"');
  });

  it("leaves out Record details when there is nothing to show", () => {
    expect(clean).not.toContain('href="#record-details"');
    expect(clean).not.toContain('id="record-details"');
  });

  it("shows Record details when a course is not counting", () => {
    const markup = render([
      { code: "WRIT 120", credits: 3, status: "completed" },
      { code: "MATH 101", credits: 3, status: "failed", grade: "40" },
    ]);
    expect(markup).toContain('href="#record-details"');
    expect(text(markup)).toContain("Not counting toward your degree");
  });

  it("offers Committed and Exploring, and no plan buttons", () => {
    expect(text(clean)).toContain("Exploring");
    expect(text(clean)).not.toContain("Considering");
    expect(clean).not.toContain("tier-buttons");
  });

  it("points Polaris Build at the log in the record", () => {
    expect(clean).toContain('href="#build-log"');
    expect(clean).not.toContain("build-add");
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run components/StandView.test.tsx`
Expected: FAIL — cannot resolve `./StandView`.

- [ ] **Step 3: Create `components/Suggestions.tsx`**

```tsx
import type { ReactNode } from "react";
import type { SuggestionTier, suggestNextCourses } from "@/lib/audit";
import { OfferedChip } from "./OfferedChip";

export type Suggested = ReturnType<typeof suggestNextCourses>[number];

/** "considering" is stored; Exploring is what the concentration button says. */
const TIER_LABEL: Record<SuggestionTier, string> = {
  required: "Required",
  committed: "Committed",
  considering: "Exploring",
  open: "Optional",
};

/**
 * What to take next, as a table. Where I stand shows it plain; planning a term
 * adds a column of plan buttons, which is the only difference between them.
 */
export function SuggestionTable({
  next,
  planCell,
  empty = "Nothing left to suggest — every requirement you are tracking is met.",
}: {
  next: Suggested[];
  planCell?: (code: string) => ReactNode;
  empty?: string;
}) {
  if (next.length === 0) return <p className="note">{empty}</p>;

  return (
    <table className="next-table">
      <thead>
        <tr>
          <th style={{ width: "6rem" }}>Course</th>
          <th>Title</th>
          <th style={{ width: "4rem" }}>Credits</th>
          <th>Counts toward</th>
          {planCell && <th style={{ width: "12rem" }}>Plan it</th>}
        </tr>
      </thead>
      <tbody>
        {next.map((c) => (
          <tr key={c.code}>
            <td className="mono">{c.code}</td>
            <td>
              {c.title} <OfferedChip code={c.code} />
            </td>
            <td className="mono">{c.credits}</td>
            <td className="why">
              <span className="tier-chip" data-tier={c.tier}>
                {TIER_LABEL[c.tier]}
              </span>{" "}
              {c.forWhat.slice(0, 3).join("; ")}
              {c.forWhat.length > 3 ? ` +${c.forWhat.length - 3} more` : ""}
            </td>
            {planCell && <td>{planCell(c.code)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Create `components/StandView.tsx`**

Move, from `app/page.tsx`, the concentration/center card rendering, the degree requirements pillars, the excluded / waived / mappings sections, `statusLabel`, `INTEREST_ORDER` and `fmt`. The full file:

```tsx
"use client";

import { useCallback, useMemo, useState } from "react";
import { CenterDetail, ConcentrationDetail, PillarBlock } from "./Requirements";
import { SuggestionTable, type Suggested } from "./Suggestions";
import type { AuditResult } from "@/lib/audit";
import { getRequirements, grading } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import type { Interest, ProgramId, Targets } from "@/lib/types";

/** Committed first, then exploring, then everything else. */
const INTEREST_ORDER: Record<string, number> = { committed: 0, considering: 1, none: 2 };

/** "considering" stays the stored value so saved targets and links still read. */
const INTEREST_LABEL: Record<Interest, string> = { committed: "Committed", considering: "Exploring" };

/**
 * The page as it opens: how far along the degree is, which Centers and
 * concentrations are closest, what to take next, and the fine print on how the
 * record was counted. Always today's record — planning a term is its own view.
 */
export function StandView({
  audit,
  program,
  targets,
  onTarget,
  onClearTargets,
  next,
  csa,
}: {
  audit: AuditResult;
  program: ProgramId;
  targets: Targets;
  onTarget: (id: string, tier: Interest) => void;
  onClearTargets: () => void;
  next: Suggested[];
  csa: number | undefined;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [openCenter, setOpenCenter] = useState<string | null>(null);
  const requirements = getRequirements(program);
  const isLegacyProgram = program === "2024-2025";

  // What the student is aiming at floats to the top of every grid; within a
  // tier the closest to done leads.
  const byInterest = useCallback(
    (a: { id: string; percent: number; name: string }, b: { id: string; percent: number; name: string }) =>
      INTEREST_ORDER[targets[a.id] ?? "none"] - INTEREST_ORDER[targets[b.id] ?? "none"] ||
      b.percent - a.percent ||
      a.name.localeCompare(b.name),
    [targets],
  );

  const ranked = useMemo(() => [...audit.concentrations].sort(byInterest), [audit, byInterest]);
  const centers = useMemo(() => [...audit.centers].sort(byInterest), [audit, byInterest]);

  // The 2024-2025 program requires electing a Center, so its concentrations are
  // grouped by the Center that offers them rather than shown as a flat list.
  const byCenter = useMemo(() => {
    const map = new Map<string, typeof ranked>();
    for (const c of ranked) map.set(c.center, [...(map.get(c.center) ?? []), c]);
    return [...map.entries()];
  }, [ranked]);

  const aimingCount = Object.keys(targets).length;
  const aiming = useMemo(() => {
    const named = (tier: Interest) =>
      [...audit.centers, ...audit.concentrations].filter((x) => targets[x.id] === tier).map((x) => x.name);
    return { committed: named("committed"), considering: named("considering") };
  }, [audit, targets]);

  const targetStrip = (id: string) => (
    <div className="target-row" role="group" aria-label="How seriously you are pursuing this">
      {(["committed", "considering"] as Interest[]).map((tier) => (
        <button
          key={tier}
          type="button"
          className="target-btn"
          data-tier={tier}
          aria-pressed={targets[id] === tier}
          onClick={() => onTarget(id, tier)}
        >
          {INTEREST_LABEL[tier]}
        </button>
      ))}
    </div>
  );

  // A block can ask for courses, for credits, or for both, and saying "courses"
  // for a credit total is simply wrong.
  const remainingLabel = (b: { remainingCourseCount: number; remainingCredits: number }) => {
    const parts: string[] = [];
    if (b.remainingCourseCount > 0)
      parts.push(`${b.remainingCourseCount} ${b.remainingCourseCount === 1 ? "course" : "courses"}`);
    if (b.remainingCredits > 0) parts.push(`${fmt(b.remainingCredits)} credits`);
    return parts.length ? `${parts.join(" + ")} left` : "Nothing left";
  };

  const card = (
    c: {
      id: string;
      name: string;
      percent: number;
      creditsEarned: number;
      creditsInProgress: number;
      creditsRequired: number;
      satisfied: boolean;
      remainingCourseCount: number;
      remainingCredits: number;
    },
    isOpen: boolean,
    toggle: () => void,
    variant?: string,
  ) => (
    <div key={c.id} className="conc-cell" data-tier={targets[c.id] ?? "none"}>
      <button type="button" className="conc" data-open={isOpen} aria-expanded={isOpen} onClick={toggle}>
        <div className="conc-top">
          <span className="conc-name">{c.name}</span>
          <span className="conc-pct" data-zero={c.percent === 0}>
            {c.percent}%
          </span>
        </div>
        <div className="bar">
          <i className="earned" style={{ width: `${(c.creditsEarned / c.creditsRequired) * 100}%` }} />
          <i className="progress" style={{ width: `${(c.creditsInProgress / c.creditsRequired) * 100}%` }} />
        </div>
        <div className="conc-meta">
          <span className="mono">
            {fmt(c.creditsEarned)}/{c.creditsRequired} cr
          </span>
          <span>{c.satisfied ? "Complete" : remainingLabel(c)}</span>
        </div>
        {variant && <span className="conc-variant">{variant}</span>}
      </button>
      {targetStrip(c.id)}
    </div>
  );

  const renderCard = (c: (typeof ranked)[number]) =>
    card(c, open === c.id, () => setOpen(open === c.id ? null : c.id));
  const renderCenterCard = (b: (typeof audit.centers)[number]) =>
    card(
      b,
      openCenter === b.id,
      () => setOpenCenter(openCenter === b.id ? null : b.id),
      b.note ? `as printed under ${b.publishedUnder[0]}` : undefined,
    );

  const pillarName = (id: string) => audit.pillars.find((p) => p.id === id)?.name ?? id;
  const mappings = mappedGrants(audit.normalization);
  const hasDetails = audit.excluded.length > 0 || audit.waived.courses.length > 0 || mappings.length > 0;

  return (
    <div className="stack stand">
      <nav className="jump-bar" aria-label="Sections">
        <a href="#progress">Progress</a>
        <a href="#concentrations">Concentrations</a>
        <a href="#next">Take next</a>
        {hasDetails && <a href="#record-details">Record details</a>}
      </nav>

      <section id="progress" className="section">
        <div className="section-head">
          <h2>Progress</h2>
          <span className="aside">180 credits across three pillars</span>
        </div>

        {/* PillarBlock for Intellectual Foundations: copy verbatim from app/page.tsx lines 590-610. */}
        {/* PillarBlock for the major: copy verbatim from app/page.tsx lines 612-640. */}
        {/* PillarBlock for Polaris: copy verbatim from app/page.tsx lines 642-698, replacing the
            <BuildLog ... /> element (lines 691-697) with the link below. */}
        <a href="#build-log" className="more build-link">
          Log Build credits in your record
        </a>

        <div className="note" style={{ marginTop: "0.8rem" }}>
          <strong>Course Score Average</strong> —{" "}
          {csa === undefined
            ? `graduation needs a cumulative CSA of at least ${grading.minimumCsa}. Upload a transcript and yours is read automatically.`
            : csa >= grading.minimumCsa
              ? `yours is ${csa}, above the ${grading.minimumCsa} needed to graduate.`
              : `yours is ${csa}, below the ${grading.minimumCsa} needed to graduate.`}
        </div>
      </section>

      <div id="concentrations" className="stack">
        {/* The Centers section: copy verbatim from app/page.tsx lines 430-445. */}
        {/* The concentrations section: copy from app/page.tsx lines 447-475, with the h2 text
            {isLegacyProgram ? "Concentrations (optional)" : "Concentrations"}
            in place of "Where you stand". */}
      </div>

      <section id="next" className="section">
        <div className="section-head">
          <h2>What to take next</h2>
          <span className="aside">
            {aimingCount > 0 ? "Weighted by what you are aiming at" : "Ranked by how many open requirements each one closes"}
          </span>
        </div>
        {/* The aiming note / guidance note: copy verbatim from app/page.tsx lines 486-513, with
            the chip text "Exploring", and onClick={onClearTargets} on the Clear button. */}
        <SuggestionTable next={next} />
      </section>

      {hasDetails && (
        <section id="record-details" className="section">
          <div className="section-head">
            <h2>Record details</h2>
            <span className="aside">How your record was read</span>
          </div>
          {/* Three subsections, each a <div className="subsection"> whose section-head uses <h3>:
              - "Not counting toward your degree": app/page.tsx lines 710-735 body
              - "Waived": app/page.tsx lines 737-771 body
              - "How your old courses were counted": app/page.tsx lines 773-817 body
              Each keeps its existing `{... .length > 0 && (...)}` guard. */}
        </section>
      )}
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case "failed":
      return "Failed - retake";
    case "withdrawn":
      return "Withdrawn";
    case "audit":
      return "Audited";
    case "incomplete":
      return "Incomplete";
    case "waived":
      return "Waived";
    default:
      return status;
  }
}

function fmt(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
```

The `{/* copy verbatim ... */}` markers are *moves*, not placeholders: each names the exact
lines of the pre-change `app/page.tsx` (commit `a03bf81`) to paste in place, with only the
listed substitutions. Inside the pasted code, `state.csa` → `csa`, `state.targets` → `targets`,
`update({ targets: {} })` → `onClearTargets()`, and the removed `planningTerm` projection note
(lines 583-587) is dropped — this view never projects. Delete each marker comment once its code
is pasted.

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run components/StandView.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/Suggestions.tsx components/StandView.tsx components/StandView.test.tsx
git commit -m "Give where you stand a view of its own, with a jump bar"
```

---

### Task 6: The Plan a term view

**Files:**
- Modify: `components/PlanPanel.tsx` (remove `<PlanSearch>` from inside `PlanPanel`)
- Create: `components/PlanView.tsx`
- Test: `components/PlanView.test.tsx`; update `components/PlanPanel.test.tsx`

**Interfaces:**
- Consumes: `PlanPanel`, `PlanSearch`, `BrowseOfferings`, `TierButtons`, `offeringFor` from `components/PlanPanel.tsx`; `SuggestionTable`, `Suggested` from Task 5; `offeringKey`, `termName` from `lib/offerings.ts`.
- Produces: `PlanView(props: { termId: string; plan: Plan; held: Set<string>; next: Suggested[]; aiming: boolean; onPlan: (key: string, tier: PlanTier | null) => void })`

- [ ] **Step 1: Write the failing test**

Create `components/PlanView.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanView } from "./PlanView";
import { auditDegree, suggestNextCourses } from "@/lib/audit";
import { offeredCatalogCodes } from "@/lib/offerings";
import { heldCodes } from "@/lib/prereq";

const noop = () => {};
const text = (markup: string) =>
  markup.replace(/<!--.*?-->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// An empty record: planning before a transcript is uploaded is a real case.
const audit = auditDegree([]);
const markup = renderToStaticMarkup(
  <PlanView
    termId="winter-2627"
    plan={{}}
    held={heldCodes([])}
    next={suggestNextCourses(audit, {}, 10, offeredCatalogCodes("winter-2627"))}
    aiming={false}
    onPlan={noop}
  />,
);

describe("PlanView", () => {
  it("lays out the plan, the search, suggestions and browse, in that order", () => {
    const out = text(markup);
    const at = (s: string) => out.indexOf(s);
    expect(at("Your plan for Winter 26/27")).toBeGreaterThan(-1);
    expect(at("Find a course for Winter 26/27")).toBeGreaterThan(at("Your plan for Winter 26/27"));
    expect(at("Suggested for Winter 26/27")).toBeGreaterThan(at("Find a course for Winter 26/27"));
    expect(at("Browse all")).toBeGreaterThan(at("Suggested for Winter 26/27"));
  });

  it("puts plan buttons on every suggestion", () => {
    expect(markup).toContain("tier-buttons");
    expect(text(markup)).toContain("Plan it");
  });

  it("leaves out everything that belongs to where you stand", () => {
    expect(markup).not.toContain('id="progress"');
    expect(markup).not.toContain('id="concentrations"');
    expect(markup).not.toContain("jump-bar");
  });
});
```

In `components/PlanPanel.test.tsx`, the "labels the search with the term it searches" test from Task 1 already renders `PlanSearch` directly, so no change is needed there. Add to the `PlanPanel` describe block:

```tsx
  it("leaves the search to the view around it", () => {
    const markup = renderToStaticMarkup(<PlanPanel termId="winter-2627" plan={{}} held={held} onChange={noop} />);
    expect(markup).not.toContain('id="plan-search"');
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/PlanView.test.tsx components/PlanPanel.test.tsx`
Expected: FAIL — cannot resolve `./PlanView`; PlanPanel still contains `plan-search`.

- [ ] **Step 3: Implement**

In `components/PlanPanel.tsx`, delete the line `<PlanSearch termId={termId} plan={plan} held={held} onChange={onChange} />` from `PlanPanel`.

Create `components/PlanView.tsx`:

```tsx
"use client";

import { BrowseOfferings, offeringFor, PlanPanel, PlanSearch, TierButtons } from "./PlanPanel";
import { SuggestionTable, type Suggested } from "./Suggestions";
import { offeringKey, termName } from "@/lib/offerings";
import type { Plan, PlanTier } from "@/lib/types";

/**
 * Planning one term: what you have picked, a way to find anything else the
 * term runs, what the audit suggests from it, and the whole list. Everything
 * here measures the record as it will stand when the term begins.
 */
export function PlanView({
  termId,
  plan,
  held,
  next,
  aiming,
  onPlan,
}: {
  termId: string;
  plan: Plan;
  /** Codes held once the record is projected to the start of this term. */
  held: Set<string>;
  next: Suggested[];
  /** Whether any Center or concentration is marked, which reorders suggestions. */
  aiming: boolean;
  onPlan: (key: string, tier: PlanTier | null) => void;
}) {
  const name = termName(termId);
  // A suggestion names "PHIL 380"; the term runs it as "PHIL 380A", and the
  // plan is keyed by what the term prints.
  const keyFor = (code: string) => offeringKey(termId, offeringFor(termId, code)?.code ?? code);

  return (
    <div className="stack">
      <PlanPanel termId={termId} plan={plan} held={held} onChange={onPlan} />

      <section className="section">
        <PlanSearch termId={termId} plan={plan} held={held} onChange={onPlan} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Suggested for {name}</h2>
          <span className="aside">
            {aiming ? "Weighted by what you are aiming at" : "Ranked by how many open requirements each one closes"}
          </span>
        </div>
        <SuggestionTable
          next={next}
          empty={`Nothing ${name} runs closes a requirement you still need.`}
          planCell={(code) => (
            <TierButtons value={plan[keyFor(code)] ?? null} onChange={(tier) => onPlan(keyFor(code), tier)} />
          )}
        />
      </section>

      <BrowseOfferings termId={termId} plan={plan} onChange={onPlan} />
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add components/PlanPanel.tsx components/PlanPanel.test.tsx components/PlanView.tsx components/PlanView.test.tsx
git commit -m "Give planning a term a view of its own"
```

---

### Task 7: Rewire the page, style the new parts, and review in a browser

**Files:**
- Modify: `app/page.tsx` (rewrite to the shell below)
- Modify: `app/globals.css` (append new rules; drop `.masthead` bottom border)

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: the finished page.

- [ ] **Step 1: Rewrite `app/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Meridian } from "@/components/Meridian";
import { ModeSwitch } from "@/components/ModeSwitch";
import { PlanView } from "@/components/PlanView";
import { RecordPanel } from "@/components/RecordPanel";
import { Settings } from "@/components/Settings";
import { StandView } from "@/components/StandView";
import { auditDegree, buildLogAsCourses, pacing, suggestNextCourses } from "@/lib/audit";
import { getRequirements } from "@/lib/catalog";
import { mappedGrants } from "@/lib/equivalency";
import { knownTerm, offeredCatalogCodes, terms, termName } from "@/lib/offerings";
import { projectFor } from "@/lib/plan";
import { heldCodes } from "@/lib/prereq";
import { decodeState, emptyState, encodeState, loadLocal, saveLocal, type SavedState } from "@/lib/storage";
import type { Interest, PlanTier, TakenCourse } from "@/lib/types";

export default function Page() {
  const [state, setState] = useState<SavedState>(emptyState);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  // The term Plan a term reopens on after a trip back to where you stand. Not
  // saved: it only has to outlast the switch, not a reload.
  const [lastTerm, setLastTerm] = useState<string | null>(null);

  // A shared link wins over whatever this browser had saved, so a link always
  // shows the sender's plan.
  useEffect(() => {
    const fromLink = window.location.search ? decodeState(window.location.search) : null;
    setState(fromLink ?? loadLocal() ?? emptyState);
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) saveLocal(state);
  }, [state, ready]);

  const update = useCallback((patch: Partial<SavedState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setTaken = useCallback(
    (taken: TakenCourse[], meta?: { csa?: number }) => {
      update(meta && meta.csa !== undefined ? { taken, csa: meta.csa } : { taken });
    },
    [update],
  );

  const requirements = getRequirements(state.program);
  const isLegacyProgram = state.program === "2024-2025";

  const record = useMemo(
    () => [...state.taken, ...buildLogAsCourses(state.buildLog, state.program)],
    [state.taken, state.buildLog, state.program],
  );

  const trueAudit = useMemo(
    () => auditDegree(record, { useInferred: state.useInferred, program: state.program }),
    [record, state.useInferred, state.program],
  );

  const planningTerm = knownTerm(state.planningTerm);

  /** The record as it will stand when the term being planned begins. */
  const projectedRecord = useMemo(
    () => (planningTerm ? projectFor(record, state.plan, planningTerm) : record),
    [record, state.plan, planningTerm],
  );

  /**
   * Everything that measures the degree reads this, so the whole page moves
   * together rather than half of it projecting and half of it not. The record
   * panel is driven by state.taken, so what you actually took stays truthful
   * either way, and a label under the meridian says when this is a projection.
   */
  const audit = useMemo(
    () =>
      planningTerm
        ? auditDegree(projectedRecord, { useInferred: state.useInferred, program: state.program })
        : trueAudit,
    [planningTerm, projectedRecord, state.useInferred, state.program, trueAudit],
  );

  /** Only what the term runs is worth suggesting while planning it. */
  const offered = useMemo(() => (planningTerm ? offeredCatalogCodes(planningTerm) : null), [planningTerm]);
  const held = useMemo(() => heldCodes(projectedRecord), [projectedRecord]);
  const next = useMemo(
    () => suggestNextCourses(audit, state.targets, 10, offered),
    [audit, state.targets, offered],
  );

  /** Pressing the tier a course already has takes it out of the plan. */
  const setPlanTier = useCallback((key: string, tier: PlanTier | null) => {
    setState((prev) => {
      const plan = { ...prev.plan };
      if (tier === null || plan[key] === tier) delete plan[key];
      else plan[key] = tier;
      return { ...prev, plan };
    });
  }, []);

  /** Pressing the tier a target already has clears it. */
  const setTarget = useCallback((id: string, tier: Interest) => {
    setState((prev) => {
      const targets = { ...prev.targets };
      if (targets[id] === tier) delete targets[id];
      else targets[id] = tier;
      return { ...prev, targets };
    });
  }, []);

  const addBuild = useCallback((credits: number, label: string) => {
    setState((prev) => ({
      ...prev,
      buildLog: [...prev.buildLog, { credits, label: label || undefined, status: "completed" }],
    }));
  }, []);

  const removeBuild = useCallback((index: number) => {
    setState((prev) => ({ ...prev, buildLog: prev.buildLog.filter((_, i) => i !== index) }));
  }, []);

  const toggleBuild = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      buildLog: prev.buildLog.map((e, i) =>
        i === index ? { ...e, status: e.status === "completed" ? "in-progress" : "completed" } : e,
      ),
    }));
  }, []);

  // Build credit the course record earns on its own, which logged credits are
  // then counted on top of. Asking the audit rather than matching course codes
  // is what catches the mapped cases: an old POL 1110 arrives as Build credit
  // through the equivalencies without ever naming a Build course.
  const buildOnTranscript = useMemo(
    () =>
      state.taken.length > 0 &&
      auditDegree(state.taken, { useInferred: state.useInferred, program: state.program }).polaris
        .buildCreditsEarned > 0,
    [state.taken, state.useInferred, state.program],
  );

  const changeMode = (termId: string | null) => {
    if (termId) setLastTerm(termId);
    update({ planningTerm: termId });
  };

  const inferredCount = mappedGrants(audit.normalization).filter((m) => m.via === "inferred").length;
  const hasCourses = record.length > 0;
  const planIndex = planningTerm ? terms.findIndex((t) => t.id === planningTerm) : -1;

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <h1>UATX Degree Audit</h1>
          <p className="sub">
            {isLegacyProgram
              ? "Bachelor of Arts in Liberal Studies, 2024-2025 catalog. Elect a Center, then complete its Foundations and Core."
              : "Bachelor of Arts in Liberal Studies, 2026-2027 catalog. Old-catalog courses count through the published equivalencies."}
          </p>
        </div>
        <div className="masthead-actions">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}?${encodeState(state)}`;
              try {
                await navigator.clipboard.writeText(url);
              } catch {
                window.prompt("Copy this link", url);
              }
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }}
            disabled={!hasCourses}
          >
            {copied ? "Link copied" : "Copy share link"}
          </button>
          <Settings
            program={state.program}
            onProgram={(program) => update({ program })}
            termsRemaining={state.termsRemaining}
            onTermsRemaining={(termsRemaining) => update({ termsRemaining })}
            pace={pacing(audit, state.termsRemaining)}
            useInferred={state.useInferred}
            onUseInferred={(useInferred) => update({ useInferred })}
            inferredCount={inferredCount}
          />
        </div>
      </header>

      <ModeSwitch
        terms={terms}
        planningTerm={planningTerm}
        defaultTerm={lastTerm ?? terms[0]?.id ?? ""}
        onChange={changeMode}
      />

      <Meridian audit={audit} termsRemaining={state.termsRemaining} />
      {planningTerm && (
        <p className="note note-projecting">
          Projected to the start of {termName(planningTerm)} — assuming you pass what you are taking now
          {planIndex > 0 ? ", and what you marked Definitely for an earlier term" : ""}. This is not where you
          stand today.
        </p>
      )}

      <div className="columns">
        <aside>
          <RecordPanel
            taken={state.taken}
            onReplace={setTaken}
            onAdd={(course) => setTaken([...state.taken, course])}
            onRemove={(i) => setTaken(state.taken.filter((_, n) => n !== i))}
            onSetStatus={(i, status) => setTaken(state.taken.map((c, n) => (n === i ? { ...c, status } : c)))}
            build={{
              log: state.buildLog,
              onAdd: addBuild,
              onRemove: removeBuild,
              onToggle: toggleBuild,
              alsoOnTranscript: buildOnTranscript,
            }}
          />
        </aside>

        <div>
          {planningTerm ? (
            <PlanView
              termId={planningTerm}
              plan={state.plan}
              held={held}
              next={next}
              aiming={Object.keys(state.targets).length > 0}
              onPlan={setPlanTier}
            />
          ) : !hasCourses ? (
            <div className="empty">
              <h2>Add your courses to see where you stand</h2>
              <p style={{ maxWidth: "32rem", margin: "0 auto" }}>
                Upload your UATX transcript and every course is read, mapped through the old-catalog equivalencies, and
                measured against all eight concentrations at once.
              </p>
            </div>
          ) : (
            <StandView
              audit={audit}
              program={state.program}
              targets={state.targets}
              onTarget={setTarget}
              onClearTargets={() => update({ targets: {} })}
              next={next}
              csa={state.csa}
            />
          )}
        </div>
      </div>

      <footer className="footer">
        <p>
          Built from the {requirements.source} and the UATX course equivalency tables. This is a study aid, not an
          official audit — confirm anything that matters with your advisor.
        </p>
      </footer>
    </main>
  );
}
```

- [ ] **Step 2: Append the new styles to `app/globals.css`**

In the `.masthead` rule, delete `border-bottom: 1px solid var(--line-strong);` (the mode switch now draws the line). Then append:

```css
/* ------------------------------------------------------------- mode switch */
/* Two modes, not two settings: tabs with a brass underline, the way the
   meridian marks credit earned. */
.mode-switch {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  border-bottom: 1px solid var(--line-strong);
}

.mode-tabs-top {
  display: flex;
}

.mode-tab {
  appearance: none;
  border: 0;
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  background: none;
  padding: 0.7rem 1rem 0.6rem;
  font-family: var(--font-display), ui-serif, Georgia, serif;
  font-size: var(--step-1);
  color: var(--slate);
  cursor: pointer;
}

.mode-tab:first-child {
  padding-left: 0;
}

.mode-tab:hover {
  color: var(--ink);
}

.mode-tab[aria-selected="true"] {
  color: var(--ink);
  border-bottom-color: var(--brass);
}

.mode-term {
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--step--1);
}

.note-projecting {
  margin-top: 1rem;
}

/* ---------------------------------------------------------------- settings */
.settings {
  position: relative;
}

.settings > summary {
  list-style: none;
  cursor: pointer;
}

.settings > summary::-webkit-details-marker {
  display: none;
}

.settings[open] > summary {
  background: var(--ink);
  color: #fff;
}

.settings-body {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  z-index: 20;
  width: min(24rem, calc(100vw - 2rem));
  box-shadow: 0 8px 24px rgba(16, 23, 32, 0.12);
}

.settings-note {
  margin: 0.35rem 0 0;
  font-size: var(--step--1);
  color: var(--slate-light);
}

/* ---------------------------------------------------------------- jump bar */
.stack > * + * {
  margin-top: 2.6rem;
}

.jump-bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.2rem;
  padding: 0.65rem 0;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  font-family: var(--font-mono), ui-monospace, monospace;
  font-size: var(--step--1);
}

.jump-bar a {
  color: var(--slate);
  text-decoration: none;
}

.jump-bar a:hover {
  color: var(--ink);
  text-decoration: underline;
}

/* Land below the sticky bar rather than under it. */
.stand [id],
#build-log {
  scroll-margin-top: 3.5rem;
}

.stack > .jump-bar + * {
  margin-top: 1.4rem;
}

.subsection + .subsection {
  margin-top: 1.8rem;
}

.section-head h3 {
  font-size: var(--step-1);
}

.build-link {
  display: inline-block;
  margin-top: 0.6rem;
}

/* ----------------------------------------------------------- record status */
.status-select {
  appearance: none;
  cursor: pointer;
  background: none;
  padding-right: 0.5rem;
}

.grade {
  font-size: var(--step--1);
  color: var(--slate);
}
```

- [ ] **Step 3: Test and build**

Run: `npx vitest run && npx tsc --noEmit && npx next build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 4: Review in a browser**

Start the dev server in the background: `npx next dev -p 3137`.

Make a share link that loads a real record: write a throwaway `lib/__share.test.ts` that prints
`encodeState({ ...emptyState, taken: parseTranscript(SAMPLE_TRANSCRIPT_WITH_FAILURES).rows })`
(imports: `encodeState`, `emptyState` from `./storage`; `parseTranscript` from `./transcript`;
`SAMPLE_TRANSCRIPT_WITH_FAILURES` from `./__fixtures__/sample-transcript`), run it with
`npx vitest run lib/__share.test.ts`, copy the printed query, then delete the file.

Screenshot with headless Chrome (`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=<out>.png --window-size=<w>,<h> <url>`) at 1280×2000 and 390×2400:
- `http://localhost:3137/?<query>` — Where I stand.
- Plan a term: share links always open on Where I stand, so drive the page instead — use a
  Playwright script if `npx playwright` is available, clicking the "Plan a term" tab and the
  Settings summary before each shot; otherwise take the Where I stand shots and ask the user to
  click through the dev server themselves.

Check against the spec: mode switch visible under the title; progress bar labelled when planning; sidebar holds upload, list with status selects, Build log; Settings opens a menu with catalog, terms left, equivalencies; jump bar sticks while scrolling; no horizontal scroll at 390px. Fix anything off in CSS and re-shoot.

- [ ] **Step 5: Commit and push**

```bash
git add app/page.tsx app/globals.css
git commit -m "Open on where you stand, plan a term as its own mode, keep the record on the left"
git push -u origin ui/modes-and-nav
```
