# Epic 01 — Global Learner Profile Store, Depth-Calibrated LLM Prompts & One-Click Prerequisite Sub-Document Seeding API

**Phase:** 05 Cross-Workspace Learner Profile & Interactive Prerequisite Chips
**Goal:** Persist a cross-workspace `LearnerProfile` (`~/.folio/profile.json`), store structured `prerequisites` on `DocumentNode`, thread `LearnerProfile` into `seedGenerator` and `branchGenerator` to calibrate explanation depth, and add `GET /api/profile`, `PUT /api/profile/topics`, and `POST /api/prerequisites/seed`.
**Done criteria covered:** DC-1, DC-2, DC-3

## Behaviour

1. **Schemas (`src/shared/schema.ts`)**:
   - `TopicFamiliaritySchema = z.enum(['unseen', 'learning', 'known'])` (`TopicFamiliarity`).
   - `LearnerProfileSchema = z.object({ topics: z.record(z.string(), TopicFamiliaritySchema).default({}) })` (`LearnerProfile`).
   - `DocumentNodeSchema` gains `prerequisites: z.array(z.string()).default([])`.
   - `SeedResultSchema` gains `prerequisites: z.array(z.string()).optional()`.
2. **Global Learner Profile Store (`src/server/profile.ts`)**:
   - `LearnerProfileStore` takes `profilePath: string` (defaulting to `path.join(os.homedir(), '.folio', 'profile.json')`).
   - `loadProfile(): Promise<LearnerProfile>` reads and parses `profilePath` (returning `{ topics: {} }` if missing).
   - `saveProfile(profile: LearnerProfile): Promise<void>` creates parent directories and writes `profilePath`.
   - `setTopicStatus(topic: string, status: TopicFamiliarity): Promise<LearnerProfile>` updates `profile.topics[topic.trim()] = status` and saves.
3. **Prerequisite Extraction & Store (`src/server/markdown.ts`, `src/server/store.ts`)**:
   - `extractPrerequisitesFromBlock0(markdown: string): string[]` extracts clean prerequisite topic names from bullet lines (`- **Topic**: ...` or `- Topic: ...` or `- Topic`) in Block 0 when explicit `seedResult.prerequisites` are not provided.
   - `WorkspaceStore.saveDocument` and `branchDocumentFromChat` accept/populate `prerequisites: string[]` on `DocumentNode`.
   - `WorkspaceStore.branchPrerequisiteDocument(parentDocId: string, topic: string, seedResult: SeedResult): Promise<LoadedDocument>` creates a child document seeded from `seedResult` linked to `blk_00` (or `blocks[0].id` if `blk_00` is absent) of `parentDocId`, appends `[→ Deep dive: <Child Title>](<child-slug>.md)` to that block in the parent `.md` file, and registers the parent-child relationship in `.folio/notebook.json`.
4. **LLM Calibration (`src/server/llm.ts`)**:
   - `formatLearnerProfilePrompt(profile?: LearnerProfile): string` formats known and learning topics for system prompts so the LLM pitches explanations at the right depth (diving straight into formalism when prerequisites are `known`, or building from intuition when `unseen`).
   - `SeedGeneratorOptions` and `BranchGenerator` input gain optional `learnerProfile?: LearnerProfile`.
5. **Routes (`src/server/app.ts`)**:
   - `CreateAppOptions` gains optional `profilePath?: string`.
   - All document responses (`GET /api/doc`, `POST /api/doc/seed`, block mutations, `integrate`, `branch`, `accept`, `reject`, `POST /api/workspaces/switch`) include `profile: LearnerProfile`.
   - `GET /api/profile` returns `{ profile }`.
   - `PUT /api/profile/topics` accepts `{ topic: string, status: TopicFamiliarity }`, updates `profileStore`, and returns `{ profile }`.
   - `POST /api/prerequisites/seed` accepts `{ topic: string, parentDocId?: string }`:
     - Enforces the synchronous `pendingEdits` gate on `parentDocId` (returns `409` if `pendingEdits` is non-empty).
     - Loads `profile`, calls `seedGenerator(topic, { modelId, reasoningEffort, pedagogicalPrompt, learnerProfile: profile })`, creates the linked child document via `store.branchPrerequisiteDocument(parentDocId, topic, seedResult)`, sets `topic` to `'learning'` in `profileStore` if not already `'known'`, and returns the full document response (`{ document, blocks, toc, documents, activeChat, pendingEdits, settings, workspaceDir, workspaces, profile, modelId }`).

## Acceptance criteria

- **AC-1** — Given an app configured with `profilePath`, when `PUT /api/profile/topics` is called with `{ topic: 'Lagrangian Mechanics', status: 'known' }` and the workspace is switched via `POST /api/workspaces/switch`, then `GET /api/profile` and `GET /api/doc` in both workspaces return `profile.topics['Lagrangian Mechanics'] === 'known'`.
- **AC-2** — Given `profile.topics['Lagrangian Mechanics'] === 'known'`, when `POST /api/doc/seed` and `POST /api/blocks/:id/branch` are called, then `seedGenerator` and `branchGenerator` receive `learnerProfile` containing `'Lagrangian Mechanics': 'known'`, and `document.prerequisites` is populated and persisted in `.folio/notebook.json`.
- **AC-3** — Given a seeded root document `index` with `blk_00`, when `POST /api/prerequisites/seed` is called with `{ topic: 'Vector Calculus', parentDocId: 'index' }`, then a child sub-document `vector-calculus.md` (or slugified title) is created on disk, `blk_00` in `index.md` ends with `[→ Deep dive: <Child Title>](<child-slug>.md)`, `profile.topics['Vector Calculus']` becomes `'learning'`, and the response returns the newly created child document.

## Tests

- `src/server/__tests__/profile-prerequisites-api.test.ts` — `GET /api/profile and PUT /api/profile/topics persist topic familiarity across workspace switches` (covers AC-1)
- `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/doc/seed and POST /api/blocks/:id/branch store prerequisites on DocumentNode and pass LearnerProfile to generators` (covers AC-2)
- `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/prerequisites/seed spawns a linked child sub-document from blk_00 and marks the prerequisite topic as learning` (covers AC-3)

## Files

- `src/shared/schema.ts`
- `src/server/profile.ts`
- `src/server/markdown.ts`
- `src/server/llm.ts`
- `src/server/store.ts`
- `src/server/app.ts`
- `src/server/__tests__/profile-prerequisites-api.test.ts`

## Out of scope

- React Prerequisite Chip UI components in `ConceptBlockCard` and `App.tsx` — covered in Epic 02.

## Build note — 2026-10-18

- **Tasks done:**
  - Added `TopicFamiliaritySchema`, `LearnerProfileSchema`, and `prerequisites` fields on `DocumentNodeSchema` and `SeedResultSchema` in `src/shared/schema.ts`.
  - Implemented `LearnerProfileStore` in `src/server/profile.ts` for cross-workspace topic familiarity persistence (`~/.folio/profile.json`).
  - Added `extractPrerequisitesFromBlock0` in `src/server/markdown.ts` and updated `WorkspaceStore.saveDocument`, `branchDocumentFromChat`, and `branchPrerequisiteDocument` in `src/server/store.ts`.
  - Added `formatLearnerProfilePrompt` and `learnerProfile` option threading in `src/server/llm.ts`.
  - Added `GET /api/profile`, `PUT /api/profile/topics`, and `POST /api/prerequisites/seed` routes and included `profile` across document API responses in `src/server/app.ts`.
- **Tests added:**
  - `src/server/__tests__/profile-prerequisites-api.test.ts` (3 tests covering AC-1, AC-2, AC-3).
- **Suite result:** 13 test files passed, 31 tests passed (`npm test`).
- **Deviations from plan:** None.

---

## Review — 2026-10-18

**Verdict:** pass

### Pass 1 — Conformance

| Criterion | Met | Test |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/profile-prerequisites-api.test.ts` — `GET /api/profile and PUT /api/profile/topics persist topic familiarity across workspace switches (AC-1)` |
| AC-2 | yes | `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/doc/seed and POST /api/blocks/:id/branch store prerequisites on DocumentNode and pass LearnerProfile to generators (AC-2)` |
| AC-3 | yes | `src/server/__tests__/profile-prerequisites-api.test.ts` — `POST /api/prerequisites/seed spawns a linked child sub-document from blk_00 and marks the prerequisite topic as learning (AC-3)` |

### Pass 2 — Drift

- None

### Pass 3 — Correctness

- None
