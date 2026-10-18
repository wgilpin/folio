# Epic 02 — Multi-Cell Integrate Engine & Synchronous Diff Resolution Gate

**Phase:** 02 Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate
**Goal:** Implement the LLM `Integrate` generator, multi-cell store transaction (`updatedBlockMarkdown`, `insertedBlocksMarkdown`, `suggestedEdits`), synchronous `409` edit resolution gate, and `Accept` / `Reject` API endpoints.
**Done criteria covered:** DC-4, DC-5

## Behaviour

Calling `POST /api/blocks/:id/integrate` passes the active ephemeral chat transcript and the bounded context ($[N-1, N, N+1]$ + Current ToC) to `integrateGenerator` (backed by Vercel AI SDK `generateObject` with `IntegrateResultSchema`). `WorkspaceStore.integrateBlockChat` atomically updates block $N$ (when `updatedBlockMarkdown` is non-null), inserts any `insertedBlocksMarkdown` as new `ConceptBlock` items immediately below block $N$ in `index.md`, filters `suggestedEdits` to valid adjacent blocks ($N-1$ or $N+1$) whose proposed text differs from current text, stages those into `pendingEdits` in `.folio/notebook.json`, and clears `activeChat`. While `pendingEdits` is non-empty for the document, `POST /api/blocks/:id/chat` and `POST /api/blocks/:id/integrate` reject with HTTP `409`. Calling `POST /api/edits/:editId/accept` applies `proposedMarkdown` to the target block in `index.md` and removes the pending edit; calling `POST /api/edits/:editId/reject` removes the pending edit without changing `index.md`.

## Acceptance criteria

- **AC-1** — Given an active chat on block $N$ (`blk_02`), when `POST /api/blocks/blk_02/integrate` runs and `integrateGenerator` returns `updatedBlockMarkdown`, `insertedBlocksMarkdown`, and `suggestedEdits` for `blk_01` / `blk_03`, then `blk_02` is updated and new blocks are inserted immediately after `blk_02` in `index.md`, `activeChat` is cleared, and `pendingEdits` is persisted in `.folio/notebook.json`.
- **AC-2** — Given `integrateGenerator` returns a `suggestedEdit` targeting a block outside $[N-1, N+1]$ (e.g. `blk_04` when integrating `blk_02`) or with `proposedMarkdown` identical to the block's current Markdown, when `POST /api/blocks/blk_02/integrate` runs, then that invalid/no-op edit is dropped and not added to `pendingEdits`.
- **AC-3** — Given a document with at least one entry in `pendingEdits`, when `POST /api/blocks/:id/chat` or `POST /api/blocks/:id/integrate` is called, then the server responds with status `409` and `{ error: 'Resolve pending suggested edits first' }`.
- **AC-4** — Given a pending suggested edit `edit_01` targeting `blk_03`, when `POST /api/edits/edit_01/accept` is called, then `blk_03` in `index.md` is updated to `proposedMarkdown` and `edit_01` is removed from `pendingEdits`; when `POST /api/edits/edit_01/reject` is called instead, `blk_03` in `index.md` is unchanged and `edit_01` is removed from `pendingEdits`.

## Tests

- `src/server/__tests__/integrate-api.test.ts` — `POST /api/blocks/:id/integrate updates block N, inserts new blocks after N, stages valid N-1/N+1 suggestedEdits, and drops out-of-window edits` (covers AC-1, AC-2)
- `src/server/__tests__/integrate-api.test.ts` — `enforces 409 synchronous edit resolution gate when pendingEdits exist and resolves via accept and reject endpoints` (covers AC-3, AC-4)

## Files

- `src/server/llm.ts`
- `src/server/store.ts`
- `src/server/app.ts`
- `src/server/__tests__/integrate-api.test.ts`

## Out of scope

- React UI components for `GateBanner` and inline diff accept/reject cards (covered in Epic 03).

## Notes

- Ensure `Integrate` system prompt in `src/server/llm.ts` explicitly instructs the model to leave `suggestedEdits` empty unless a factual contradiction, duplicate explanation, or broken transition was introduced in $N-1$ or $N+1$.
