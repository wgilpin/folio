# Epic 02 — Cell `Done` Check-Off UI, Document Progress Counter & Central Ability Record Editor UI

**Phase:** 07 Unified Learner Ability Record & Cell Done Tracking
**Goal:** Add a non-hiding **Done** check-off toggle and completed badge to every `ConceptBlockCard`, display a `<done>/<total> blocks done` progress counter in the Workbench header, and provide a Central Learner Ability Record editor in the Notebook Sidebar.
**Done criteria covered:** DC-4, DC-5

## Behaviour

Every `ConceptBlockCard` renders a **`Done`** check-off toggle button in its action footer (`aria-label="Mark block <blockId> as done"` when incomplete, `aria-label="Unmark block <blockId> as done"` when completed). Clicking it calls `PUT /api/blocks/:id/done` and marks the card as completed **in place without hiding or collapsing its Markdown prose**, displaying a subtle `✓ Done` status pill and `#15803D` completed accent while keeping all prose, equations, and diagrams readable. The Workbench document header shows a completion badge (`<doneCount>/<totalCount> blocks done`). In the Notebook Sidebar, a **Learner Ability Record** section lets the user edit their `Learner Background` (`aria-label="Learner Background"`) and `Standing Learning Instructions` (`aria-label="Standing Learning Instructions"`), save them via `PUT /api/profile` (`aria-label="Save learner ability record"`), and view their engaged sources with completed block counts.

## Acceptance criteria

- **AC-1** — Given a loaded document in the Workbench, when the user clicks the **`Done`** toggle button (`aria-label="Mark block blk_01 as done"`) on `blk_01`, then the Workbench calls `PUT /api/blocks/blk_01/done` with `{ done: true, docId }`, `blk_01` remains visible in place with its full Markdown content and a completed indicator (`aria-label="Unmark block blk_01 as done"`), and the document header progress badge updates to reflect the completed block count (e.g. `1/3 blocks done`).
- **AC-2** — Given the Notebook Sidebar with a loaded `LearnerProfile`, when the user edits `Learner Background` (`aria-label="Learner Background"`) and `Standing Learning Instructions` (`aria-label="Standing Learning Instructions"`) and clicks `Save Ability Record` (`aria-label="Save learner ability record"`), then `PUT /api/profile` is called with `{ background, learningInstructions }` and the sidebar displays the updated ability record and engaged source summaries.

## Tests

- `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `toggles ConceptBlockCard Done status in place without hiding content and updates the document progress badge` (covers AC-1).
- `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `edits and saves Learner Background and Standing Learning Instructions via PUT /api/profile and displays engaged sources` (covers AC-2).

## Files

- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/SidebarTree.tsx`
- `src/client/App.tsx`
- `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` (new)

## Out of scope

- Hiding or collapsing completed cells — the user explicitly specified that checking off a cell as **Done** marks it visually in place without hiding its content.

## Notes

- Use the design tokens from `docs/sdlc/design.md` (`#15803D` on `#DCFCE7` for completed badge/button accents, `#FAF8F5` / `#FFFFFF` surfaces, `#E4DFD7` borders).

## Build note — 2026-10-27

### Tasks done

- Added `onToggleDone` prop, `data-done` attribute, and non-hiding `Done` check-off toggle button (`aria-label="Mark block <id> as done"` / `aria-label="Unmark block <id> as done"`, `aria-pressed`) in `src/client/components/ConceptBlockCard.tsx` while keeping all Markdown prose visible in place.
- Added the **Learner Ability Record** section in `src/client/components/SidebarTree.tsx` with `Learner Background` (`aria-label="Learner Background"`), `Standing Learning Instructions` (`aria-label="Standing Learning Instructions"`), `Save Ability Record` (`aria-label="Save learner ability record"`), and an engaged sources summary list (`<done>/<total> blocks done`).
- Wired `handleToggleBlockDone` (`PUT /api/blocks/:id/done`), the document completion progress badge (`<done>/<total> blocks done`, `aria-label="Document completion progress"`), and `handleUpdateAbilityRecord` (`PUT /api/profile`) in `src/client/App.tsx`.
- Added automated UI tests covering AC-1 and AC-2 in `src/client/__tests__/AbilityRecordAndCellDone.test.tsx`.

### Tests added

- `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `toggles ConceptBlockCard Done status in place without hiding content and updates the document progress badge`
- `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `edits and saves Learner Background and Standing Learning Instructions via PUT /api/profile and displays engaged sources`

### Suite result

- Command: `npm test`
- Result: `Test Files 24 passed (24), Tests 81 passed (81)`
- Typecheck: `npm run typecheck` (`tsc --noEmit`, exit code 0)

### Deviations from the plan

- None.

### Follow-ups

- None.

## Review — 2026-10-27

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `toggles ConceptBlockCard Done status in place without hiding content and updates the document progress badge` | |
| AC-2 | yes | `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `edits and saves Learner Background and Standing Learning Instructions via PUT /api/profile and displays engaged sources` | |

### Drift

None

### Findings

None

