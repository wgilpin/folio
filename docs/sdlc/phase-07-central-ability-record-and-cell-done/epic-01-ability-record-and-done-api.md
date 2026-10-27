# Epic 01 — Central Learner Ability Record, Cell `Done` Persistence & LLM Calibration API

**Phase:** 07 Unified Learner Ability Record & Cell Done Tracking
**Goal:** Extend `LearnerProfile` with self-supplied `background`, `learningInstructions`, and `engagedSources`, persist per-cell `done` status in Markdown block delimiters and `.folio/library.sqlite`, expose `PUT /api/profile` and `PUT /api/blocks/:id/done`, and calibrate all LLM generators with the unified ability record.
**Done criteria covered:** DC-1, DC-2, DC-3

## Behaviour

`LearnerProfile` (`~/.folio/profile.json`) becomes a unified Central Learner Ability Record holding `background` (free-text academic/technical background), `learningInstructions` (standing personal pedagogical instructions), `topics` (`Record<string, TopicFamiliarity>`), and `engagedSources` (an array of `EngagedSourceRecord` items tracking `{ docId, docTitle, workspaceDir, completedBlockIds, completedSectionHeadings, totalBlocks, updatedAt }`). Each `ConceptBlock` gains an optional `done?: boolean` flag persisted both in `.folio/library.sqlite` (`blocks.done`) and on disk in the HTML comment delimiter (`<!-- folio:block id="blk_01" done="true" -->` when `done === true`, and `<!-- folio:block id="blk_01" -->` when false/omitted). Calling `PUT /api/blocks/:id/done` toggles `done` on the target block, synchronizes the document's entry in `profile.engagedSources` (marking the document's topic as `'learning'` when any block is done, and `'known'` when all body blocks are done), and returns the full document + `profile` payload. Every LLM generator (`seedGenerator`, `cellChatGenerator`, `integrateGenerator`, `branchGenerator`, `documentChatGenerator`, `documentIntegrateGenerator`, `documentBranchGenerator`) receives `learnerProfile?: LearnerProfile` and includes `formatLearnerProfilePrompt(learnerProfile)` in its system prompt.

## Acceptance criteria

- **AC-1** — Given an app configured with `profilePath`, when `PUT /api/profile` is called with `{ background: 'First year Nat Sci (Physical) at Cambridge.', learningInstructions: 'I am a visual learner. Explain terms as they are introduced.' }` and the workspace is switched via `POST /api/workspaces/switch`, then `GET /api/profile` and `GET /api/doc` return the persisted `background` and `learningInstructions`.
- **AC-2** — Given a seeded document `lagrangian-mechanics` with blocks `blk_00`, `blk_01`, and `blk_02`, when `PUT /api/blocks/blk_01/done` is called with `{ done: true, docId: 'lagrangian-mechanics' }`, then `blk_01.done` is `true` in the response and across fresh `WorkspaceStore` reloads, `lagrangian-mechanics.md` on disk contains `<!-- folio:block id="blk_01" done="true" -->`, `profile.engagedSources` records `lagrangian-mechanics` with `completedBlockIds: ['blk_01']` and its section heading, and marking the remaining body block `blk_02` as `done: true` promotes the document's topic familiarity in `profile.topics` to `'known'`.
- **AC-3** — Given a populated `LearnerProfile` containing `background`, `learningInstructions`, `topics`, and `engagedSources`, when `POST /api/doc/seed`, `POST /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, `POST /api/blocks/:id/branch`, `POST /api/doc/chat`, `POST /api/doc/integrate`, or `POST /api/doc/branch` is called, then the corresponding generator receives `learnerProfile` and `formatLearnerProfilePrompt(profile)` includes the background, standing learning instructions, known/learning topics, and engaged sources/completed sections.

## Tests

- `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/profile persists background and learningInstructions across workspace switches` (covers AC-1).
- `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/blocks/:id/done persists cell done status in Markdown delimiters and SQLite and updates engagedSources in LearnerProfile` (covers AC-2).
- `src/server/__tests__/ability-record-done-api.test.ts` — `threads unified LearnerProfile (background, learningInstructions, engagedSources) into seed, chat, integrate, and branch generators` (covers AC-3).

## Files

- `src/shared/schema.ts`
- `src/server/markdown.ts`
- `src/server/db.ts`
- `src/server/store.ts`
- `src/server/profile.ts`
- `src/server/llm.ts`
- `src/server/app.ts`
- `src/server/__tests__/ability-record-done-api.test.ts` (new)

## Out of scope

- React UI controls for cell `Done` toggling, document progress badge, and Sidebar Ability Record editing — covered in Epic 02.

## Notes

- Preserve backward compatibility in `parseMarkdownBlocks` and `serializeMarkdownBlocks`: when `block.done` is falsy, serialize `<!-- folio:block id="blk_01" -->` so existing Markdown snapshot tests remain unchanged; when `block.done === true`, serialize `<!-- folio:block id="blk_01" done="true" -->`.
- In `src/server/db.ts`, add `done INTEGER NOT NULL DEFAULT 0` to `blocks` (and run `ALTER TABLE blocks ADD COLUMN done INTEGER NOT NULL DEFAULT 0` inside a `try/catch` in `initializeSchema` so existing `.folio/library.sqlite` databases upgrade seamlessly).

## Build note — 2026-10-27

- **Tasks done:**
  - Extended `ConceptBlockSchema` (`done?: boolean`), added `EngagedSourceRecordSchema`, and extended `LearnerProfileSchema` with `background`, `learningInstructions`, and `engagedSources` in `src/shared/schema.ts`.
  - Updated `parseMarkdownBlocks` and `serializeMarkdownBlocks` in `src/server/markdown.ts` to parse and emit `done="true"` in `<!-- folio:block id="<id>" done="true" -->` delimiters while keeping unmarked blocks backward-compatible.
  - Added `done INTEGER NOT NULL DEFAULT 0` to the `blocks` SQLite table in `src/server/db.ts` (including automatic `ALTER TABLE` migration for existing `.folio/library.sqlite` files) and persisted `done` in `writeStateToSqlite` and `syncDocumentBlocksToSqlite`.
  - Added `WorkspaceStore.setBlockDone` and preserved `done` across block updates, integrations, branches, and accepted pending edits in `src/server/store.ts`.
  - Added `LearnerProfileStore.updateAbilityRecord` and `LearnerProfileStore.recordDocumentEngagement` in `src/server/profile.ts` to record completed blocks/headings per document and promote topic familiarity (`'learning'` when any block is done, `'known'` when all body blocks are done).
  - Updated `formatLearnerProfilePrompt`, added `hasLearnerProfileContent`, and threaded `learnerProfile` into all 7 LLM generators in `src/server/llm.ts` and `src/server/app.ts`, plus exposed `PUT /api/profile` and `PUT /api/blocks/:id/done`.
- **Tests added:**
  - `src/server/__tests__/ability-record-done-api.test.ts` (3 tests covering AC-1, AC-2, AC-3).
- **Suite result:** 23 test files passed (79 tests total), `npm run typecheck` passed with 0 errors.
- **Deviations from plan:** None.

## Review — 2026-10-27

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/profile persists background and learningInstructions across workspace switches` | |
| AC-2 | yes | `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/blocks/:id/done persists cell done status in Markdown delimiters and SQLite and updates engagedSources in LearnerProfile` | |
| AC-3 | yes | `src/server/__tests__/ability-record-done-api.test.ts` — `threads unified LearnerProfile (background, learningInstructions, engagedSources) into seed, chat, integrate, and branch generators` | |

### Drift

None

### Findings

None
