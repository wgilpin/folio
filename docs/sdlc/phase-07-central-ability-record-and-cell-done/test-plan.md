# Test plan — Phase 07 Unified Learner Ability Record & Cell Done Tracking

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/profile persists background and learningInstructions across workspace switches` | automated |
| DC-2 | `src/server/__tests__/ability-record-done-api.test.ts` — `PUT /api/blocks/:id/done persists cell done status in Markdown delimiters and SQLite and updates engagedSources in LearnerProfile` | automated |
| DC-3 | `src/server/__tests__/ability-record-done-api.test.ts` — `threads unified LearnerProfile (background, learningInstructions, engagedSources) into seed, chat, integrate, and branch generators` | automated |
| DC-4 | `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `toggles ConceptBlockCard Done status in place without hiding content and updates the document progress badge` | automated |
| DC-5 | `src/client/__tests__/AbilityRecordAndCellDone.test.tsx` — `edits and saves Learner Background and Standing Learning Instructions via PUT /api/profile and displays engaged sources` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

No gaps.

## How to run

`npm test`

## Test data

- Temporary workspace directories (`os.tmpdir()`) and temporary `profilePath` (`profile.json`) fixtures.
- Seeded Markdown documents with multiple Concept Blocks (`blk_00`, `blk_01`, `blk_02`) and stub LLM generators (`seedGenerator`, `cellChatGenerator`, `integrateGenerator`, `branchGenerator`, `documentChatGenerator`, `documentIntegrateGenerator`, `documentBranchGenerator`).
