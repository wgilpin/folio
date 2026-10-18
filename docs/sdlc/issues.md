# Issues — folio

One line per issue, newest last. Status is `open`, `scheduled`, `fixed`,
or `dropped`. This file records issues. It never records stage status.

## ISS-1 — Failed chat prompts clear the user's question input instead of preserving it for retry

**Raised:** 2026-10-18
**Status:** open
**Lands in:** unplanned

`InlineChatDrawer.tsx` clears `input` before awaiting `onSendMessage`, so if `POST /api/blocks/:id/chat` fails, the user must retype their question (`epic-01-bounded-chat-discard` review follow-up).

## ISS-2 — Failed Accept/Reject requests on pending diffs log only to console.error

**Raised:** 2026-10-18
**Status:** open
**Lands in:** unplanned

`handleAcceptEdit` and `handleRejectEdit` in `src/client/App.tsx` log errors to `console.error` instead of surfacing an inline error alert on the pending-diff card (`epic-03-diff-gate-ui` review follow-up).

## ISS-3 — Pass the user's highlighted text selection within a Concept Block to the inline cell chat as the focus

**Raised:** 2026-10-18
**Status:** open
**Lands in:** unplanned

When the user highlights a phrase, term, or equation inside a Concept Block before or while using `InlineChatDrawer` (`ConceptBlockCard.tsx` / `POST /api/blocks/:id/chat`), capture that selection and include it in the bounded cell context as the explicit focus of the question.

## ISS-4 — Pass docId query parameter on DELETE block and DELETE chat calls inside branched sub-documents

**Raised:** 2026-10-18
**Status:** open
**Lands in:** unplanned

`handleDeleteBlock` and `handleDiscardChat` in `src/client/App.tsx` omit `?docId=<document.id>` on `DELETE /api/blocks/:id` and `DELETE /api/blocks/:id/chat` (`epic-02-tree-navigation-ui` review follow-up).
