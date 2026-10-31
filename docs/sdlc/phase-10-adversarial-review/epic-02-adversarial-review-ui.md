# Epic 02 — One-Click Adversarial Review UI (Document, Cell & Seed/Sidebar Profile)

**Phase:** 10 Falsification-First Adversarial Review (Seed Profile, Cell & Document Audit)
**Goal:** Add one-click **Adversarial Review** buttons at the document level (header and `DocumentChatDrawer`) and cell level (`ConceptBlockCard` and `InlineChatDrawer`), and add the `adversarial-review` option to the pedagogical profile selectors in `SeedModal.tsx` and `SidebarTree.tsx`.
**Done criteria covered:** DC-3, DC-4

## Behaviour

When viewing any notebook in the workbench, the user can click **Adversarial Review** in the document header or inside the `Ask Notebook` drawer (`DocumentChatDrawer`) to run a full-document falsification audit via `POST /api/doc/review`, opening the drawer with the severity-ranked findings and enabling follow-up discussion, **Integrate**, **Branch Doc**, or **Discard**. On any individual Concept Block, the user can click **Adversarial Review** in the block action bar or inside `InlineChatDrawer` to run a bounded `[N-1, N, N+1]` falsification audit via `POST /api/blocks/:id/review`. In addition, the user can choose **Adversarial Spec Review** (`adversarial-review`) in both `SeedModal` and `SidebarTree`.

## Acceptance criteria

- **AC-1** — Given a loaded document in `App`, when the user clicks **Adversarial Review** at the document level (in the document header or inside `DocumentChatDrawer`), then the client sends `POST /api/doc/review` with `{ docId }`, opens `DocumentChatDrawer`, displays the returned adversarial review messages in the drawer, and enables **Integrate**, **Branch Doc**, and **Discard**.
- **AC-2** — Given a Concept Block card in `App`, when the user clicks **Adversarial Review** on the block (in the card action bar or inside `InlineChatDrawer`), then the client sends `POST /api/blocks/:id/review` with `{ docId }`, opens `InlineChatDrawer` for that block, and displays the returned cell-scoped adversarial review messages.
- **AC-3** — Given a document with non-empty `pendingEdits`, when the diff gate is active, then both the document-level and cell-level **Adversarial Review** buttons are disabled.
- **AC-4** — Given `SeedModal` and `SidebarTree`, when the user opens the Pedagogical Style / Pedagogical Profile dropdown (`#seed-pedagogical-profile` or `#sidebar-pedagogical-profile`) and selects `adversarial-review` (*Adversarial Spec Review*), then `PUT /api/settings` is called with `{ activeProfileId: 'adversarial-review' }`.

## Tests

- `src/client/__tests__/AdversarialReview.test.tsx` — `triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate` (covers AC-1, AC-3).
- `src/client/__tests__/AdversarialReview.test.tsx` — `triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer` (covers AC-2, AC-3).
- `src/client/__tests__/AdversarialReview.test.tsx` — `selects Adversarial Spec Review (adversarial-review) in SeedModal and SidebarTree pedagogical profile dropdowns and persists via PUT /api/settings` (covers AC-4).

## Files

- `src/client/App.tsx`
- `src/client/components/DocumentChatDrawer.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/InlineChatDrawer.tsx`
- `src/client/components/SeedModal.tsx`
- `src/client/components/SidebarTree.tsx`
- `src/client/__tests__/AdversarialReview.test.tsx`

## Out of scope

- Backend schema and `/api/doc/review` or `/api/blocks/:id/review` implementation (completed in Epic 01).

## Notes

- Preserve all existing `aria-label`s and `data-testid`s in `App.tsx`, `DocumentChatDrawer.tsx`, `ConceptBlockCard.tsx`, `InlineChatDrawer.tsx`, `SeedModal.tsx`, and `SidebarTree.tsx` so existing UI tests continue to pass without modification.
