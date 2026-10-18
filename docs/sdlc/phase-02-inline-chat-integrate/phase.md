# Phase 02 — Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate

**Goal:** Deliver the smallest concept proof by adding ephemeral multi-turn Q&A chats on any Concept Block (scoped to Current ToC + $[N-1, N, N+1]$), resolving via **Discard** or **Integrate** (updating cell $N$, inserting new blocks, and staging suggested edits on $N-1$/$N+1$), and enforcing the synchronous **Accept / Reject** diff gate.

## Scope

- **`src/server/context.ts`:** Bounded Context Builder assembling the current document's Table of Contents plus the sliding window of Concept Blocks ($N-1$, $N$, $N+1$) for any target block $N$.
- **`src/server/llm.ts`:** Ephemeral cell Q&A generator (`CellChatGenerator`) and multi-cell structured integration generator (`IntegrateGenerator` using `IntegrateResultSchema` via Vercel AI SDK `generateObject`).
- **`src/server/store.ts`:** Sidecar state persistence for `activeChat` and `pendingEdits`, multi-cell `Integrate` transaction applicator (updating block $N$, inserting new blocks immediately after $N$, filtering and staging `suggestedEdits` restricted to adjacent blocks $N-1$/$N+1$), synchronous edit resolution gate check, and `acceptPendingEdit` / `rejectPendingEdit` operations.
- **`src/server/app.ts`:** Hono API routes for ephemeral cell chat and diff resolution (`POST /api/blocks/:id/chat`, `DELETE /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, `POST /api/edits/:editId/accept`, `POST /api/edits/:editId/reject`, and returning `activeChat` + `pendingEdits` in `GET /api/doc`).
- **`src/client/`:** `InlineChatDrawer`, `GateBanner`, and `ConceptBlockCard` (`chat-open` and `pending-diff` variants, plus disabled `Ask Cell` lock state when `pendingEdits` is non-empty).

## Done criteria

1. **DC-1:** Requesting bounded context for block $N$ returns the current document's Table of Contents and only the sliding window of blocks $[N-1, N, N+1]$ (handling first and last blocks without out-of-bounds errors).
2. **DC-2:** Sending a message to `POST /api/blocks/:id/chat` passes the bounded context ($[N-1, N, N+1]$ + Current ToC) and conversation history to the cell chat generator, persists `activeChat` in `.folio/notebook.json`, and returns the updated thread without modifying `index.md`.
3. **DC-3:** Calling `DELETE /api/blocks/:id/chat` (Discard) clears `activeChat` from `.folio/notebook.json` and leaves `index.md` and all Concept Blocks unchanged.
4. **DC-4:** Calling `POST /api/blocks/:id/integrate` applies `updatedBlockMarkdown` to block $N$ and inserts `insertedBlocksMarkdown` immediately after block $N$ in `index.md`, stages valid adjacent ($N-1$, $N+1$) `suggestedEdits` into `pendingEdits` in `.folio/notebook.json` (dropping any suggested edit outside $[N-1, N+1]$ or identical to current text), and clears `activeChat`.
5. **DC-5:** While `pendingEdits` is non-empty on a document, starting a new cell chat (`POST /api/blocks/:id/chat`) or running `Integrate` returns status `409` (`Resolve pending suggested edits first`), and accepting (`POST /api/edits/:editId/accept`) or rejecting (`POST /api/edits/:editId/reject`) each pending edit updates `index.md` (on accept) and removes the pending edit from `.folio/notebook.json`.
6. **DC-6:** In the Workbench UI, clicking `Ask Cell` on a Concept Block opens `InlineChatDrawer`, allows multi-turn Q&A, and clicking `Discard` closes the drawer without altering the block.
7. **DC-7:** In the Workbench UI, clicking `Integrate` in `InlineChatDrawer` updates block $N$, renders any newly inserted blocks, displays `GateBanner` and the `pending-diff` view on adjacent blocks with `Accept Edit` / `Reject Edit` buttons, disables `Ask Cell` buttons while edits are pending, and unlocks `Ask Cell` once all pending edits are accepted or rejected.

## Not in this phase

- Branching a cell chat into a child sub-document (`Branch Doc`) or multi-document tree navigation (Phase 03).
- Runtime UI model switching or pedagogical prompt profiles (Phase 04).
- Cross-workspace Learner Profile and Block 0 Prerequisite Chips (Phase 05).

## Epics

- `epic-01-bounded-chat-discard.md` — Implement the Bounded Context Builder (`src/server/context.ts`), ephemeral cell chat & discard API routes (`POST /api/blocks/:id/chat`, `DELETE /api/blocks/:id/chat`), and the `InlineChatDrawer` UI with Q&A and Discard.
- `epic-02-integrate-and-diff-gate.md` — Implement the `Integrate` LLM contract, multi-cell store transaction, synchronous `pendingEdits` resolution gate, and the `Accept Edit` / `Reject Edit` API routes.
- `epic-03-diff-gate-ui.md` — Build `GateBanner` and the `pending-diff` variant on `ConceptBlockCard` (showing original vs. proposed diff lines, reason, `Accept Edit` / `Reject Edit` controls, and `Ask Cell` lock state) and wire the `Integrate` button in `InlineChatDrawer`.

## Risks

- **Out-of-bounds or no-op suggested edits from LLM:** Mitigated in `WorkspaceStore.integrateBlockChat` by filtering `suggestedEdits` to only IDs matching $N-1$ or $N+1$ whose `proposedMarkdown.trim()` differs from the current block's Markdown.
