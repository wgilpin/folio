# Epic 02 — Interactive Block 0 Prerequisite Chips (`✓ I know this` & `↳ Seed Prerequisite`) UI

**Phase:** 05 Cross-Workspace Learner Profile & Interactive Prerequisite Chips
**Goal:** Render interactive Prerequisite Chips inside Block 0 (`blk_00`) of any document, allowing the user to toggle topic familiarity (`✓ I know this`) in their global Learner Profile or spawn a linked prerequisite sub-document in one click (`↳ Seed Prerequisite`).
**Done criteria covered:** DC-4, DC-5

## Behaviour

When rendering Block 0 (`block.id === 'blk_00'`) in `ConceptBlockCard`, if `prerequisites` (passed from `document.prerequisites`, or extracted from `blk_00` bullets as fallback) is non-empty, `ConceptBlockCard` renders a `Prerequisite Chips` bar (`data-testid="prerequisite-chips-bar"`):
- For each prerequisite `topic`:
  - Displays the topic name and current status badge (`known` vs `learning` vs `unseen`).
  - Renders a **`✓ I know this`** toggle button (`aria-label={isKnown ? `Unmark ${topic} as known` : `Mark ${topic} as known`}`, text `✓ I know this`) that calls `onTogglePrerequisiteKnown(topic, isKnown ? 'unseen' : 'known')` $\rightarrow$ `PUT /api/profile/topics` and updates `profile` in `App.tsx`.
  - Renders a **`↳ Seed Prerequisite`** button (`aria-label={`Seed prerequisite ${topic}`}`, text `↳ Seed Prerequisite`, disabled while seeding or when `isChatLocked` is true) that calls `onSeedPrerequisite(topic)` $\rightarrow$ `POST /api/prerequisites/seed` with `{ topic, parentDocId: document.id }` and navigates the Workbench into the newly generated child sub-document.

## Acceptance criteria

- **AC-1** — Given a document whose `blk_00` has prerequisites `['Lagrangian Mechanics', 'Symplectic Geometry']`, when the Workbench renders `blk_00`, then interactive Prerequisite Chips appear for both topics, and clicking `Mark Lagrangian Mechanics as known` (`✓ I know this`) sends `PUT /api/profile/topics` with `{ topic: 'Lagrangian Mechanics', status: 'known' }` and updates the chip state to known.
- **AC-2** — Given a document whose `blk_00` has prerequisite `'Symplectic Geometry'`, when the user clicks `Seed prerequisite Symplectic Geometry` (`↳ Seed Prerequisite`), then the client sends `POST /api/prerequisites/seed` with `{ topic: 'Symplectic Geometry', parentDocId: 'index' }` and switches the Workbench view into the newly created child sub-document.

## Tests

- `src/client/__tests__/PrerequisiteChips.test.tsx` — `renders Prerequisite Chips in blk_00 and toggles topic known status via PUT /api/profile/topics` (covers AC-1)
- `src/client/__tests__/PrerequisiteChips.test.tsx` — `seeds a prerequisite sub-document from blk_00 via POST /api/prerequisites/seed and navigates to the new child document` (covers AC-2)

## Files

- `src/client/components/ConceptBlockCard.tsx`
- `src/client/App.tsx`
- `src/client/__tests__/PrerequisiteChips.test.tsx`

## Out of scope

- Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

## Build note — 2026-10-18

- **Tasks done:**
  - Extended `ConceptBlockCard` (`src/client/components/ConceptBlockCard.tsx`) with `prerequisites`, `learnerProfile`, `seedingPrerequisiteTopic`, `onTogglePrerequisiteKnown`, and `onSeedPrerequisite` props, plus `extractPrerequisiteTopicsFromMarkdown` fallback parsing for `blk_00`.
  - Rendered the interactive `Prerequisite Chips` bar (`data-testid="prerequisite-chips-bar"`) inside `blk_00` showing each prerequisite topic, its familiarity status badge (`unseen` / `learning` / `known`), the `✓ I know this` toggle button, and the `↳ Seed Prerequisite` action button.
  - Updated `App` (`src/client/App.tsx`) to track `profile` (`LearnerProfile`) and `seedingPrerequisiteTopic`, wire `PUT /api/profile/topics` for toggling topic familiarity, and wire `POST /api/prerequisites/seed` to create and switch into the child prerequisite sub-document.
- **Tests added:**
  - `src/client/__tests__/PrerequisiteChips.test.tsx` — `renders Prerequisite Chips in blk_00 and toggles topic known status via PUT /api/profile/topics` (AC-1)
  - `src/client/__tests__/PrerequisiteChips.test.tsx` — `seeds a prerequisite sub-document from blk_00 via POST /api/prerequisites/seed and navigates to the new child document` (AC-2)
- **Suite result:** 14 test files passed, 33 tests passed (`npm test`).
- **Deviations from plan:** None.

---

## Review — 2026-10-18

**Verdict:** pass

### Pass 1 — Conformance

| Criterion | Met | Test |
|---|---|---|
| AC-1 | yes | `src/client/__tests__/PrerequisiteChips.test.tsx` — `renders Prerequisite Chips in blk_00 and toggles topic known status via PUT /api/profile/topics` |
| AC-2 | yes | `src/client/__tests__/PrerequisiteChips.test.tsx` — `seeds a prerequisite sub-document from blk_00 via POST /api/prerequisites/seed and navigates to the new child document` |

### Pass 2 — Drift

- None

### Pass 3 — Correctness

- None
