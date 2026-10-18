# Epic 03 — Pending Diff Gate UI, GateBanner & Integrate Flow

**Phase:** 02 Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate
**Goal:** Wire the `Integrate` action in `InlineChatDrawer` and build `GateBanner` and the `pending-diff` view on `ConceptBlockCard` with `Accept Edit` and `Reject Edit` actions and `Ask Cell` lock enforcement.
**Done criteria covered:** DC-7

## Behaviour

When the user clicks `Integrate` inside `InlineChatDrawer`, the UI calls `POST /api/blocks/:id/integrate`, updates block $N$, renders any newly inserted blocks below it, and closes the chat drawer. If `pendingEdits` is non-empty, `GateBanner` appears at the top of the Workbench showing the count of pending suggested edits and a `Jump to next diff` button, `Ask Cell` buttons on all Concept Blocks are disabled (`title="Resolve pending suggested edits first"`), and each affected block ($N-1$ or $N+1$) renders in its `pending-diff` variant (`2px solid #F59E0B` amber border, the LLM's `reason`, `-` removed lines in `#FEE2E2`/`#B91C1C`, `+` added lines in `#DCFCE7`/`#15803D`, and `Accept Edit` / `Reject Edit` buttons). Clicking `Accept Edit` or `Reject Edit` calls the corresponding endpoint and, once all pending edits are resolved, hides `GateBanner` and re-enables `Ask Cell` across the document.

## Acceptance criteria

- **AC-1** — Given an open `InlineChatDrawer` with at least one Q&A turn on `blk_02`, when the user clicks `Integrate`, then `POST /api/blocks/blk_02/integrate` is called, `blk_02` and any inserted blocks update in the UI, and the chat drawer closes.
- **AC-2** — Given `pendingEdits` has an entry for `blk_03`, when the Workbench renders, then `GateBanner` is visible with the pending edit count, `ConceptBlockCard` for `blk_03` displays the suggested edit `reason`, original (`-`) and proposed (`+`) diff lines, and `Accept Edit` / `Reject Edit` buttons, and `Ask Cell` buttons on all blocks are disabled.
- **AC-3** — Given a `ConceptBlockCard` in `pending-diff` state on `blk_03`, when the user clicks `Accept Edit` (or `Reject Edit`), then `POST /api/edits/:editId/accept` (or `/reject`) is called, `blk_03` updates accordingly, `GateBanner` disappears when `pendingEdits` becomes empty, and `Ask Cell` buttons become enabled again.

## Tests

- `src/client/__tests__/InlineChat.test.tsx` — `integrates chat, renders GateBanner and pending-diff card on adjacent cell, locks Ask Cell buttons, and unlocks after Accept/Reject` (covers AC-1, AC-2, AC-3)

## Files

- `src/client/App.tsx`
- `src/client/components/GateBanner.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/InlineChatDrawer.tsx`
- `src/client/__tests__/InlineChat.test.tsx`

## Out of scope

- Branching a chat into a child sub-document (`Branch Doc` button in `InlineChatDrawer` stays disabled/placeholder until Phase 03).

## Notes

- Follow the exact colour and typography tokens in [design.md](../../design.md): warning/diff `#B45309` text on `#FEF3C7` surface with `#F59E0B` border, removal `#B91C1C` on `#FEE2E2`, addition `#15803D` on `#DCFCE7`, and `aria-label="Accept suggested edit on <blockId>"` / `aria-label="Reject suggested edit on <blockId>"`.
