# Phase 07 — Unified Learner Ability Record & Cell Done Tracking

**Goal:** Consolidate learner context into a single central record of ability (`~/.folio/profile.json` / library store) that combines: (1) user self-supplied background (e.g., *"I did first year Nat Sci (Physical) at Cambridge."*), (2) standing personal learning instructions (e.g., *"I am a visual learner. Explain terms as they are introduced"*), and (3) a ledger of documents, Concept Blocks, and sources actually engaged with—driven by adding a **Done** check-off status to every Concept Block cell (visually marking the cell as completed in place without hiding its content).

## Scope

- **Shared Schemas (`src/shared/schema.ts`):** Extend `ConceptBlockSchema` with optional `done?: boolean`, add `EngagedSourceRecordSchema`, and extend `LearnerProfileSchema` with `background: string`, `learningInstructions: string`, and `engagedSources: EngagedSourceRecord[]`.
- **Markdown Delimiter & SQLite Block Store (`src/server/markdown.ts`, `src/server/db.ts`, `src/server/store.ts`):** Parse and serialize `<!-- folio:block id="<id>" done="true" -->` attributes on Markdown delimiters, store `done` in `.folio/library.sqlite` (`blocks.done`), and add `WorkspaceStore.setBlockDone(blockId, done, docId)`.
- **Central Learner Ability Record & LLM Calibration (`src/server/profile.ts`, `src/server/llm.ts`, `src/server/app.ts`):** Add `PUT /api/profile` and `PUT /api/blocks/:id/done`, record engaged documents and completed block headings in `LearnerProfileStore`, and pass `learnerProfile` (including `background`, `learningInstructions`, `topics`, and `engagedSources`) into all LLM generators (`Seed`, `Ask Cell`, `Integrate`, `Branch Doc`, and `Ask Notebook`).
- **Workbench Cell Done & Ability Record UI (`src/client/components/ConceptBlockCard.tsx`, `src/client/components/SidebarTree.tsx`, `src/client/App.tsx`):** Add a non-hiding **Done** toggle button and completed visual state on every `ConceptBlockCard`, render a document progress counter (`<done>/<total> blocks done`) in the Workbench header, and provide a Learner Ability Record editor in the Notebook Sidebar for `background`, `learningInstructions`, and engaged source history.

## Done criteria

1. **DC-1** — `LearnerProfileStore` (`~/.folio/profile.json`) persists `background` (`string`), `learningInstructions` (`string`), `topics` (`Record<string, TopicFamiliarity>`), and `engagedSources` (`EngagedSourceRecord[]`), and calling `PUT /api/profile` with `{ background, learningInstructions, topics? }` updates and returns the unified `profile` across workspaces.
2. **DC-2** — Calling `PUT /api/blocks/:id/done` with `{ done: boolean, docId?: string }` persists `done` on the target `ConceptBlock` in both `.folio/library.sqlite` and the `.md` delimiter (`<!-- folio:block id="<id>" done="true" -->`), updates `profile.engagedSources` with the document's completed block IDs and section headings (setting the document's topic status to `'learning'` when partially done and `'known'` when all body blocks are done), and returns the updated document and `profile`.
3. **DC-3** — Calling any LLM endpoint (`POST /api/doc/seed`, `POST /api/prerequisites/seed`, `POST /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, `POST /api/blocks/:id/branch`, `POST /api/doc/chat`, `POST /api/doc/integrate`, `POST /api/doc/branch`) passes the unified `LearnerProfile` into the generator, and `formatLearnerProfilePrompt(profile)` formats `background`, `learningInstructions`, `topics`, and `engagedSources` for the system prompt.
4. **DC-4** — Every `ConceptBlockCard` renders a **`Done`** check-off toggle button (`aria-label="Mark block <id> as done"` / `aria-label="Unmark block <id> as done"`) that calls `PUT /api/blocks/:id/done`, keeps the block's full Markdown prose visible in place with a completed visual state, and updates the document completion progress indicator (`<done>/<total> blocks done`).
5. **DC-5** — The Notebook Sidebar renders a **Learner Ability Record** editor where the user can edit and save their `Learner Background` (`aria-label="Learner Background"`) and `Standing Learning Instructions` (`aria-label="Standing Learning Instructions"`) via `PUT /api/profile` and view their engaged sources.

## Not in this phase

- Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.
- OrbStack container deployment, Caddy `forward_auth`, and the cross-Mac Folio Skill (scheduled for Phase 08).

## Epics

1. `epic-01-ability-record-and-done-api.md` — Unified `LearnerProfile` schema & store (`background`, `learningInstructions`, `engagedSources`), per-cell `done` persistence (`<!-- folio:block id="..." done="true" -->` + SQLite), `PUT /api/profile` & `PUT /api/blocks/:id/done` routes, and LLM generator calibration across all actions (covers DC-1, DC-2, DC-3).
2. `epic-02-ability-record-and-done-ui.md` — Non-hiding cell `Done` toggle & completed badge on `ConceptBlockCard`, document progress counter in `App.tsx`, and Learner Ability Record editor in `SidebarTree.tsx` (covers DC-4, DC-5; depends on Epic 01).

Epics run sequentially (`epic-01` → `epic-02`); none are independent because Epic 02 calls the `PUT /api/blocks/:id/done` and `PUT /api/profile` endpoints introduced in Epic 01.

## Risks

- **Preserving `done` state when a block's Markdown is edited or integrated:** Editing or integrating a block must preserve its existing `done` flag unless explicitly toggled. Mitigation: `parseMarkdownBlocks`, `serializeMarkdownBlocks`, `updateBlock`, and `integrateBlockChat` carry `done?: boolean` on `ConceptBlock`.
