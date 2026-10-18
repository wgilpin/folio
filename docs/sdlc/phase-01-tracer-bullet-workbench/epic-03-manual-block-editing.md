# Epic 03 — Manual Inline Block Editing, Split, Merge & Delete

**Phase:** 01 Tracer Bullet: Seed, Read, and Manual Block Workbench
**Goal:** Enable direct manual editing of raw Markdown and splitting, merging, and deleting Concept Blocks in both the Hono API and the React Workbench UI.
**Done criteria covered:** DC-6, DC-7

## Behaviour

Every `ConceptBlockCard` exposes manual controls (`Edit MD`, `Split`, `Merge`, `Delete`). Clicking `Edit MD` switches the block into its `editing-raw` variant with a monospace textarea (`JetBrains Mono`) and `Save` / `Cancel` buttons (`Cmd/Ctrl + Enter` to save, `Escape` to cancel). Clicking `Split` divides the block into two separate Concept Blocks (at the cursor/split marker or paragraph boundary); clicking `Merge` combines the block with the immediately following block; clicking `Delete` removes the block. Every manual action persists immediately to `index.md` on disk and refreshes the Sidebar Table of Contents.

## Acceptance criteria

- **AC-1** — Given an existing Concept Block, when `PUT /api/blocks/:id` is called with updated Markdown, then `index.md` on disk is updated for that block and the response returns the updated `blocks` and `toc`.
- **AC-2** — Given a Concept Block with multiple paragraphs (or a split offset), when `POST /api/blocks/:id/split` is called, then the block is replaced by two adjacent `ConceptBlock` items with distinct `blk_` IDs in `index.md`.
- **AC-3** — Given two adjacent Concept Blocks, when `POST /api/blocks/:id/merge` is called on the first block, then the two blocks are combined into a single `ConceptBlock` and the second block ID is removed from `index.md`.
- **AC-4** — Given a document with multiple Concept Blocks, when `DELETE /api/blocks/:id` is called, then that block is removed from `index.md` and the updated block list is returned.
- **AC-5** — Given a rendered `ConceptBlockCard` in the Workbench UI, when the user clicks `Edit MD`, changes the Markdown text, and clicks `Save` (or clicks `Split`, `Merge`, or `Delete`), then the UI updates the rendered Concept Blocks and Table of Contents to match the persisted state.

## Tests

- `src/server/__tests__/api.test.ts` — `PUT /api/blocks/:id updates block markdown on disk and refreshes ToC` (covers AC-1)
- `src/server/__tests__/api.test.ts` — `POST /api/blocks/:id/split, POST /api/blocks/:id/merge, and DELETE /api/blocks/:id mutate blocks in index.md` (covers AC-2, AC-3, AC-4)
- `src/client/__tests__/Workbench.test.tsx` — `edits raw Markdown inline on a Concept Block and persists via PUT /api/blocks/:id` (covers AC-1, AC-5)
- `src/client/__tests__/Workbench.test.tsx` — `splits, merges, and deletes Concept Blocks from the card action bar` (covers AC-2, AC-3, AC-4, AC-5)

## Files

- `src/server/store.ts`
- `src/server/app.ts`
- `src/client/App.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/server/__tests__/api.test.ts`
- `src/client/__tests__/Workbench.test.tsx`

## Out of scope

- Ephemeral inline cell Q&A chats and LLM diff gates (Phase 02).

## Notes

- Preserve keyboard accessibility from [design.md](../../design.md): `Cmd/Ctrl + Enter` saves raw Markdown edits, `Escape` cancels raw Markdown editing, and action buttons carry explicit `aria-label` attributes (`Edit Markdown for <blockId>`, `Split <blockId>`, `Merge <blockId>`, `Delete <blockId>`).
