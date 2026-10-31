# Test plan — Phase 10 Falsification-First Adversarial Review

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/adversarial-review-api.test.ts` — `accepts activeProfileId: "adversarial-review" in PUT /api/settings and includes 6-step falsification-first instructions in resolvePedagogicalPrompt and ADVERSARIAL_REVIEW_INSTRUCTIONS` | automated |
| DC-2 | `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/doc/review audits full document context plus saved raw sourceAttachment when present, persists activeChat (blockId: null), and enforces 409 pendingEdits gate` & `POST /api/blocks/:id/review audits bounded [N-1, N, N+1] cell context without sourceAttachment, persists activeChat (blockId: id), and enforces 409 pendingEdits gate` | automated |
| DC-3 | `src/client/__tests__/AdversarialReview.test.tsx` — `triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate` & `triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer` | automated |
| DC-4 | `src/client/__tests__/AdversarialReview.test.tsx` — `selects Adversarial Spec Review (adversarial-review) in SeedModal and SidebarTree pedagogical profile dropdowns and persists via PUT /api/settings` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

None.

## How to run

`npm test`

## Test data

- Temporary workspace directories (`os.tmpdir()`) with seeded Markdown Concept Blocks (`<!-- folio:block id="blk_..." -->`) and saved `.folio/attachments/<docId>/<filename>` source files.
- Mocked `documentChatGenerator` and `cellChatGenerator` callbacks in server tests verifying passed `context`, `source`, `pedagogicalPrompt`, and `messages`.
- Mocked `fetch` in React Testing Library (`@testing-library/react`) tests for `App`, `DocumentChatDrawer`, `ConceptBlockCard`, `SeedModal`, and `SidebarTree`.
