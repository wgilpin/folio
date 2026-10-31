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

## Build note — 2026-10-31

### Tasks done
- Added `adversarial-review` option (*Adversarial Spec Review*) to the Pedagogical Style / Pedagogical Profile dropdowns in `src/client/components/SeedModal.tsx` (`#seed-pedagogical-profile`) and `src/client/components/SidebarTree.tsx` (`#sidebar-pedagogical-profile`), persisting via `PUT /api/settings`.
- Added document-level one-click **Adversarial Review** buttons in the notebook header in `src/client/App.tsx` (`data-testid="doc-adversarial-review-btn"`) and inside `src/client/components/DocumentChatDrawer.tsx` (`data-testid="drawer-doc-adversarial-review-btn"`), wiring `handleRunDocAdversarialReview` to `POST /api/doc/review` and opening `DocumentChatDrawer` with the returned thread ready for follow-up chat, **Integrate**, **Branch Doc**, or **Discard**.
- Added cell-level one-click **Adversarial Review** buttons in `src/client/components/ConceptBlockCard.tsx` (`data-testid="cell-adversarial-review-btn-<blockId>"`, wrapped in an inline-flex `<span>` to preserve the direct-child icon button structure expected by existing workbench action-bar tests) and inside `src/client/components/InlineChatDrawer.tsx` (`data-testid="inline-drawer-adversarial-review-btn-<blockId>"`), wiring `handleRunCellAdversarialReview` to `POST /api/blocks/:id/review`.
- Enforced the diff gate (`pendingEdits.length > 0`) on both document-level and cell-level **Adversarial Review** buttons.

### Tests added
- `src/client/__tests__/AdversarialReview.test.tsx`:
  - `triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate` (AC-1, AC-3)
  - `triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer` (AC-2, AC-3)
  - `selects Adversarial Spec Review (adversarial-review) in SeedModal and SidebarTree pedagogical profile dropdowns and persists via PUT /api/settings` (AC-4)

### Suite result
- `npm test`: 30 test files passed, 96 tests passed.

### Deviations from plan
- Wrapped the cell-level `Adversarial Review` button in `ConceptBlockCard.tsx` inside `<span style={{ display: 'inline-flex' }}>` (matching the existing `Done` button pattern) so `Workbench.test.tsx`'s `:scope > button, :scope > div > button` selector for icon buttons remains unaffected.

---

## Review — 2026-10-31

**Verdict:** pass

### Acceptance criteria

| AC | Met | Proved by |
|---|---|---|
| AC-1 | yes | `src/client/__tests__/AdversarialReview.test.tsx` — `triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate` |
| AC-2 | yes | `src/client/__tests__/AdversarialReview.test.tsx` — `triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer` |
| AC-3 | yes | `src/client/__tests__/AdversarialReview.test.tsx` — `triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate` & `triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer` |
| AC-4 | yes | `src/client/__tests__/AdversarialReview.test.tsx` — `selects Adversarial Spec Review (adversarial-review) in SeedModal and SidebarTree pedagogical profile dropdowns and persists via PUT /api/settings` |

### Drift

None

### Findings

None

### Follow-ups

None

