# Test plan — Phase 02 Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/context.test.ts` — `builds bounded context with current ToC and [N-1, N, N+1] sliding window including boundary blocks` | automated |
| DC-2 | `src/server/__tests__/chat-api.test.ts` — `POST /api/blocks/:id/chat scopes context to [N-1, N, N+1] and persists activeChat in .folio/notebook.json without mutating index.md` | automated |
| DC-3 | `src/server/__tests__/chat-api.test.ts` — `DELETE /api/blocks/:id/chat discards activeChat and leaves index.md untouched` | automated |
| DC-4 | `src/server/__tests__/integrate-api.test.ts` — `POST /api/blocks/:id/integrate updates block N, inserts new blocks after N, stages valid N-1/N+1 suggestedEdits, and drops out-of-window edits` | automated |
| DC-5 | `src/server/__tests__/integrate-api.test.ts` — `enforces 409 synchronous edit resolution gate when pendingEdits exist and resolves via accept and reject endpoints` | automated |
| DC-6 | `src/client/__tests__/InlineChat.test.tsx` — `opens InlineChatDrawer via Ask Cell, sends Q&A messages, and discards chat without altering blocks` | automated |
| DC-7 | `src/client/__tests__/InlineChat.test.tsx` — `integrates chat, renders GateBanner and pending-diff card on adjacent cell, locks Ask Cell buttons, and unlocks after Accept/Reject` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

None.

## How to run

`npm test`

## Test data

- Temporary filesystem workspace directories (`fs.mkdtemp` in `os.tmpdir()`) seeded with 4 Concept Blocks (`blk_01` through `blk_04`).
- Injected `cellChatGenerator` and `integrateGenerator` functions passed to `createApp` so HTTP and UI tests run deterministically offline without live LLM calls.
