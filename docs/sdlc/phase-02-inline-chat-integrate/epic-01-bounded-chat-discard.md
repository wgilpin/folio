# Epic 01 — Bounded Context Builder, Ephemeral Cell Chat & Discard

**Phase:** 02 Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate
**Goal:** Build the `[N-1, N, N+1]` + ToC bounded context builder, ephemeral cell Q&A and Discard API endpoints, and `InlineChatDrawer` UI component.
**Done criteria covered:** DC-1, DC-2, DC-3, DC-6

## Behaviour

Clicking `Ask Cell` on any `ConceptBlockCard` opens `InlineChatDrawer` anchored inside that block (`chat-open` variant with `2px solid #1D4ED8` border). Submitting a question calls `POST /api/blocks/:id/chat`, which builds the bounded context (`currentToc` + `previousBlock` $N-1$, `targetBlock` $N$, `nextBlock` $N+1$), calls the LLM `cellChatGenerator`, persists `activeChat` in `.folio/notebook.json` (so it survives a browser refresh), and returns the assistant's reply without modifying `index.md`. Clicking `Discard` calls `DELETE /api/blocks/:id/chat`, clearing `activeChat` and closing the drawer while leaving `index.md` untouched.

## Acceptance criteria

- **AC-1** — Given a document with blocks `blk_01`..`blk_04`, when `buildBoundedCellContext(store, 'index', 'blk_02')` runs, then it returns the document's `toc`, `previousBlock` (`blk_01`), `targetBlock` (`blk_02`), and `nextBlock` (`blk_03`), and returns `null` for `previousBlock` on `blk_01` and `null` for `nextBlock` on `blk_04`.
- **AC-2** — Given a seeded workspace, when `POST /api/blocks/blk_02/chat` is called with `{ message }`, then the server passes the bounded context and prior messages to `cellChatGenerator`, saves `activeChat` in `.folio/notebook.json`, leaves `index.md` unchanged, and returns `{ activeChat }`.
- **AC-3** — Given an active chat on `blk_02`, when `DELETE /api/blocks/blk_02/chat` is called, then `activeChat` in `.folio/notebook.json` is set to `null` and `index.md` remains unchanged.
- **AC-4** — Given a rendered `ConceptBlockCard` in the Workbench UI, when the user clicks `Ask Cell`, sends a question in `InlineChatDrawer`, and then clicks `Discard`, then the assistant's reply is displayed during the chat and the drawer closes on `Discard` without mutating the block.

## Tests

- `src/server/__tests__/context.test.ts` — `builds bounded context with current ToC and [N-1, N, N+1] sliding window including boundary blocks` (covers AC-1)
- `src/server/__tests__/chat-api.test.ts` — `POST /api/blocks/:id/chat scopes context to [N-1, N, N+1] and persists activeChat in .folio/notebook.json without mutating index.md` (covers AC-2)
- `src/server/__tests__/chat-api.test.ts` — `DELETE /api/blocks/:id/chat discards activeChat and leaves index.md untouched` (covers AC-3)
- `src/client/__tests__/InlineChat.test.tsx` — `opens InlineChatDrawer via Ask Cell, sends Q&A messages, and discards chat without altering blocks` (covers AC-4)

## Files

- `src/server/context.ts`
- `src/server/llm.ts`
- `src/server/store.ts`
- `src/server/app.ts`
- `src/client/App.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/InlineChatDrawer.tsx`
- `src/server/__tests__/context.test.ts`
- `src/server/__tests__/chat-api.test.ts`
- `src/client/__tests__/InlineChat.test.tsx`

## Out of scope

- Multi-cell `Integrate` mutations and `pendingEdits` diff resolution gate (covered in Epic 02 and Epic 03).

## Notes

- `GET /api/doc` should also include `activeChat` and `pendingEdits` from `.folio/notebook.json` so refreshing the browser restores an open ephemeral chat.
