# Epic 01 — BYOM Model & Reasoning Controls, Pedagogical Prompt Profiles & Dynamic Workspace Switching API

**Phase:** 04 BYOM Model Controls, Pedagogical Profiles & Workspace Switcher
**Goal:** Persist BYOM model ID, reasoning effort (`low` | `medium` | `high`), and pedagogical system prompt profile in `.folio/notebook.json`, thread them through all four LLM generators (`seed`, `chat`, `integrate`, `branch`), and add `GET /api/workspaces` and `POST /api/workspaces/switch` so the server can switch active notebook folders on the fly.
**Done criteria covered:** DC-1, DC-2

## Behaviour

`.folio/notebook.json` gains an optional `settings` object (`NotebookSettingsSchema`) with:
- `modelId`: `string` (defaults to `options.modelId ?? getActiveModelId()`)
- `reasoningEffort`: `'low' | 'medium' | 'high'` (defaults to `'high'`)
- `activeProfileId`: `'intuitive-physical' | 'rigorous-derivation' | 'custom'` (defaults to `'intuitive-physical'`)
- `customSystemPrompt`: `string` (defaults to `''`)

Built-in pedagogical profiles provide distinct system instructions:
- `intuitive-physical`: Emphasizes physical/geometric intuition, concrete analogies, and plain-English explanation before introducing formalism.
- `rigorous-derivation`: Emphasizes step-by-step mathematical derivations, explicit assumptions, boundary conditions, and formal precision.
- `custom`: Uses `customSystemPrompt` (falling back to `intuitive-physical` if empty).

`PUT /api/settings` updates any subset of `{ modelId, reasoningEffort, activeProfileId, customSystemPrompt }` in `.folio/notebook.json` and returns `{ settings, modelId }`. All document API responses (`GET /api/doc`, `POST /api/doc/seed`, block mutations, `integrate`, `branch`, `accept`, `reject`) include `settings` and `workspaceDir` alongside `modelId: settings.modelId`. When `POST /api/doc/seed`, `POST /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, or `POST /api/blocks/:id/branch` runs, the server resolves `settings` from `store` and passes `modelId`, `reasoningEffort`, and the resolved `pedagogicalPrompt` into `seedGenerator`, `cellChatGenerator`, `integrateGenerator`, and `branchGenerator`.

`GET /api/workspaces` returns `{ workspaceDir, workspaces: string[] }` (tracking visited workspaces in memory starting with the initial `workspaceDir`). `POST /api/workspaces/switch` accepts `{ workspaceDir: string }`, validates it is a non-empty path, creates the directory if needed, switches the server's active `WorkspaceStore` instance to that path, records it in `workspaces`, and returns the full document response (`{ document, blocks, toc, documents, activeChat, pendingEdits, settings, workspaceDir, workspaces, modelId }`).

## Acceptance criteria

- **AC-1** — Given a workspace, when `PUT /api/settings` is called with `{ modelId: 'openai:o3', reasoningEffort: 'high', activeProfileId: 'rigorous-derivation', customSystemPrompt: 'Always use tensor index notation.' }`, then `.folio/notebook.json` persists `settings` and `GET /api/doc` returns the updated `settings` and `modelId: 'openai:o3'`.
- **AC-2** — Given updated `settings` (or `activeProfileId: 'custom'` with a custom prompt), when `POST /api/doc/seed`, `POST /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, and `POST /api/blocks/:id/branch` are called, then each generator receives `{ modelId, reasoningEffort, pedagogicalPrompt }` matching the active settings.
- **AC-3** — Given two workspace directories `workspaceA` (with seeded `index.md`) and `workspaceB` (empty or with its own `index.md`), when `POST /api/workspaces/switch` is called with `{ workspaceDir: workspaceB }`, then the server switches its active store to `workspaceB`, returns `workspaceDir: workspaceB` and `workspaces` containing both paths, and subsequent `GET /api/doc` and block mutations operate on `workspaceB` without modifying `workspaceA`.

## Tests

- `src/server/__tests__/settings-workspace-api.test.ts` — `PUT /api/settings persists modelId, reasoningEffort, and pedagogical profile in .folio/notebook.json and forwards them to seed, chat, integrate, and branch generators` (covers AC-1, AC-2)
- `src/server/__tests__/settings-workspace-api.test.ts` — `POST /api/workspaces/switch dynamically switches the active workspace folder and returns its loaded document and settings` (covers AC-3)

## Files

- `src/shared/schema.ts`
- `src/server/llm.ts`
- `src/server/store.ts`
- `src/server/app.ts`
- `src/server/__tests__/settings-workspace-api.test.ts`

## Out of scope

- React UI controls in `SidebarTree` and `App.tsx` — covered in Epic 02.

## Build note — 2026-10-18

- **Tasks done:**
  - Added `ReasoningEffortSchema`, `PedagogicalProfileIdSchema`, and `NotebookSettingsSchema` to `src/shared/schema.ts` and attached optional `settings` to `NotebookStateSchema`.
  - Added `PEDAGOGICAL_PROFILES` and `resolvePedagogicalPrompt` to `src/server/llm.ts` and updated `SeedGenerator`, `CellChatGenerator`, `IntegrateGenerator`, and `BranchGenerator` (plus their default implementations) to accept `modelId`, `reasoningEffort`, and `pedagogicalPrompt`.
  - Added `getSettings` and `updateSettings` to `WorkspaceStore` in `src/server/store.ts` and included `settings` in `LoadedDocument`.
  - Added `PUT /api/settings`, `GET /api/workspaces`, and `POST /api/workspaces/switch` in `src/server/app.ts` and threaded `settings`, `workspaceDir`, `workspaces`, and `modelId` through all document/block/chat/integrate/branch/edit routes.
- **Tests added:**
  - `src/server/__tests__/settings-workspace-api.test.ts` (2 integration tests covering AC-1, AC-2, and AC-3)
- **Suite result:** 11 test files passed (25 tests total).
- **Deviations from plan:** Updated `src/server/__tests__/api.test.ts` assertions to account for `settings`, `workspaceDir`, and `workspaces` in `GET /api/doc` and options object passed to `seedGenerator`.

---

## Review — 2026-10-18

**Verdict:** pass

### Pass 1 — Conformance

| Criterion | Met | Test |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/settings-workspace-api.test.ts` — `PUT /api/settings persists modelId, reasoningEffort, and pedagogical profile in .folio/notebook.json and forwards them to seed, chat, integrate, and branch generators` |
| AC-2 | yes | `src/server/__tests__/settings-workspace-api.test.ts` — `PUT /api/settings persists modelId, reasoningEffort, and pedagogical profile in .folio/notebook.json and forwards them to seed, chat, integrate, and branch generators` |
| AC-3 | yes | `src/server/__tests__/settings-workspace-api.test.ts` — `POST /api/workspaces/switch dynamically switches the active workspace folder and returns its loaded document and settings` |

### Pass 2 — Drift

- None

### Pass 3 — Correctness

- None
