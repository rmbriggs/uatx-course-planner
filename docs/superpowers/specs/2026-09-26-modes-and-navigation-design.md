# Two modes, one sidebar, and buttons that say what they do

The app has grown one feature at a time, and each one landed wherever there was
room. The result reads as scattered: planning a term is a dropdown labelled
"Show me" at the bottom of the sidebar that silently re-projects the whole
page; three sets of look-alike tier buttons share the word "Considering" for
two different things; the Build log hides inside the Polaris pillar; settings
live in three places; and a course's status changes by clicking its label.

This is a layout and wording change only. No audit logic, saved data, or share
link format changes.

## What the student comes for

Mostly "where do I stand?" So the page opens on that, and planning a term
becomes a separate, unmistakable mode rather than a section further down.

## Structure

### Header (both modes)

- Title and catalog subtitle, as now.
- **Copy share link** (was "Copy a link to this plan").
- **Settings** — a disclosure (`<details>`) holding the three settings now
  scattered: catalog (2026-2027 / 2024-2025 segmented control, moved from the
  header), terms left before you graduate (with its pace line), and Use
  proposed equivalencies (with its explanation).
- **Mode switch** below the title: `[Where I stand] [Plan a term]`, with a term
  select beside Plan a term when there is more than one term on file.
  - Where I stand sets `planningTerm` to `null`.
  - Plan a term sets it to the term last planned, else the first term.
  - The switch is a `role="tablist"` with `aria-selected`.
- The Meridian stays under the header. In plan mode it carries a label:
  "Projected to the start of Winter 26/27 — assumes you pass what you are
  taking now [and what you marked Definitely for an earlier term]."

`planningTerm` already lives in saved state and is already dropped from share
links, so a shared link always opens on Where I stand. That stays.

### Left sidebar: Your record (both modes)

- Upload transcript / Add or waive a course tabs, as now. The search tab's
  label becomes **Add a course you've taken**.
- The course list. Each row's status becomes a `<select>` (Done, In progress,
  Failed, Waived; plus the current value if it is one of the transcript-only
  statuses — Incomplete, Withdrawn, Audited) instead of a label you click to
  cycle. The grade stays visible beside it.
- **Remove all courses** asks `window.confirm` first.
- **Build log**, moved here from inside the Polaris pillar. The Polaris
  pillar keeps its "Polaris Build x/y credits" row.

The sidebar's "Planning" panel goes away: its settings move to Settings, and
"Show me" is replaced by the mode switch.

### Main column — Where I stand

A sticky jump bar at the top of the column: *Progress · Concentrations ·
Take next · Record details*. Each link is an in-page anchor; Record details
appears only when that section has anything in it.

1. **Progress** (`#progress`) — the three pillars and CSA (was "Degree
   requirements", same content, minus the Build log).
2. **Concentrations** (`#concentrations`) — Centers and concentrations, as
   now, with Committed / Exploring buttons.
3. **What to take next** (`#next`) — ranked across the whole catalog, no plan
   buttons.
4. **Record details** (`#record-details`) — Waived, Not counting, and How
   your old courses were counted, as sub-sections of one section.

Empty state (no courses): the empty-state message, as now.

### Main column — Plan a term

1. **Your plan for Winter 26/27** — plan groups and credit totals, as now.
2. **Find a course for Winter 26/27** (was "Look up a course").
3. **Suggested for Winter 26/27** — what-to-take-next limited to what the
   term runs, each row with plan buttons.
4. **Browse all N courses Winter 26/27 runs**, as now.

Progress, Concentrations and Record details do not render in plan mode; the
Meridian still shows the projection.

## Wording

| Where | Was | Becomes |
|---|---|---|
| Concentration/Center target buttons | Committed / Considering | Committed / **Exploring** |
| Suggestion chips (`Interest` tier) | Considering | **Exploring** |
| Plan tier buttons and chips | Definitely / Maybe / Considering | Definitely / Maybe / **Backup** |
| Share | Copy a link to this plan | **Copy share link** |
| Record search tab | Search | **Add a course you've taken** |
| Plan search | Look up a course | **Find a course for {term}** |

Only labels change. The stored values (`"considering"` in both `Interest` and
`PlanTier`) stay, so saved state and existing share links keep working.

## Files

- `app/page.tsx` — header, mode switch, settings, jump bar, the two main
  column layouts. Split out of it so it stops growing:
  - `components/Settings.tsx` — the settings disclosure.
  - `components/ModeSwitch.tsx` — the mode switch.
  - `components/StandView.tsx` — the Where I stand main column.
  - `components/PlanView.tsx` — the Plan a term main column.
- `components/RecordPanel.tsx` — tab label, status select, confirm, hosts
  `BuildLog`.
- `components/PlanPanel.tsx` — Backup label, search label.
- `components/Requirements.tsx` — `BuildLog` unchanged, only where it renders.
- `app/globals.css` — mode switch, jump bar, settings, status select.

## Testing

- Update the three `PlanPanel` tests that assert "Considering" to "Backup".
- New render tests (same `renderToStaticMarkup` style as the existing ones):
  - `ModeSwitch` marks the active mode selected and lists the terms.
  - `StandView` renders the four sections and no plan buttons.
  - `PlanView` renders plan, find, suggested and browse, and none of the
    stand sections.
  - Record status renders as a select with the current status chosen.
- `npm test` and `npm run build` pass.
- Screenshots of both modes at desktop and phone width for review before
  merging.

## Out of scope

- Any change to how the audit, suggestions or projection compute.
- Populi CSV sections, meeting times, conflicts.
- Persisting the jump bar position or open settings.
