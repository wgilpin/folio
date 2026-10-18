# Phase 05 — Cross-Workspace Learner Profile & Interactive Prerequisite Chips

**Goal:** Persist a global Learner Profile (`~/.folio/profile.json`) tracking topic familiarity across all workspaces and render structured Prerequisite Chips in Block 0 (`blk_00`) with one-click **`↳ Seed Prerequisite`** sub-document generation and **`✓ I know this`** level toggles that calibrate the depth of newly seeded documents.

## Done criteria

- **DC-1** — `LearnerProfileStore` persists topic familiarity (`Record<string, 'unseen' | 'learning' | 'known'>`) in a global JSON file (`profilePath`, defaulting to `~/.folio/profile.json` and configurable via `CreateAppOptions.profilePath`), `GET /api/profile` returns `{ profile }`, and `PUT /api/profile/topics` with `{ topic, status }` updates and persists that topic's familiarity across workspaces.
- **DC-2** — `SeedResultSchema` accepts optional `prerequisites: z.array(z.string()).optional()`, `DocumentNode` stores `prerequisites: string[]` (populated from `seedResult.prerequisites` or extracted from `blk_00` markdown bullets), and `POST /api/doc/seed` and `POST /api/blocks/:id/branch` pass the current `LearnerProfile` into `seedGenerator` and `branchGenerator` so known topics calibrate explanation depth.
- **DC-3** — Calling `POST /api/prerequisites/seed` with `{ topic, parentDocId? }` generates a child sub-document for `topic` via `seedGenerator` (calibrated with the current `LearnerProfile`), links it to `blk_00` (or the first block) of `parentDocId` with `[→ Deep dive: <Child Title>](<child-slug>.md)`, updates `topic` to `'learning'` in the Learner Profile (unless already `'known'`), and returns the newly created child document state.
- **DC-4** — In `ConceptBlockCard` for Block 0 (`blk_00`), each prerequisite topic renders an interactive Prerequisite Chip with a **`✓ I know this`** toggle button (`aria-label="Mark <topic> as known"`) that calls `PUT /api/profile/topics` and updates the chip's known state in the UI.
- **DC-5** — In `ConceptBlockCard` for Block 0 (`blk_00`), clicking **`↳ Seed Prerequisite`** (`aria-label="Seed prerequisite <topic>"`) on a prerequisite chip calls `POST /api/prerequisites/seed` and switches the Workbench view into the newly seeded prerequisite sub-document.

## Epics

1. `epic-01-learner-profile-and-prereq-seed-api` — Global Learner Profile Store, Depth-Calibrated LLM Prompts & One-Click Prerequisite Sub-Document Seeding API (covers DC-1, DC-2, DC-3).
2. `epic-02-prerequisite-chips-ui` — Interactive Block 0 Prerequisite Chips (`✓ I know this` & `↳ Seed Prerequisite`) UI (covers DC-4, DC-5; depends on `epic-01-learner-profile-and-prereq-seed-api`).

## Out of scope

- Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.
