# Epic 02 — Branch Doc Action, SubDocLinkCard, Hierarchical SidebarTree & Breadcrumb Navigation UI

**Phase:** 03 Sub-Document Branching & Ancestor Tree Navigation
**Goal:** Enable the `Branch Doc` button in `InlineChatDrawer`, build `SubDocLinkCard` inside `ConceptBlockCard`, and add hierarchical Document Tree navigation in `SidebarTree` plus ancestor breadcrumbs at the top of the Workbench.
**Done criteria covered:** DC-4, DC-5

## Behaviour

Inside `InlineChatDrawer`, the `Branch Doc` button (`aria-label="Branch chat from <blockId> into sub-document"`) is enabled whenever `messages.length > 0` and no request is in flight. Clicking `Branch Doc` calls `POST /api/blocks/:id/branch` with `{ docId }`, shows `Branching sub-document...` while in flight, closes the chat drawer, and switches the Workbench to the newly created child document. At the top of the Workbench, an ancestor breadcrumb bar (`aria-label="Document Breadcrumbs"`) renders the chain from root to the current document (e.g., `Hamiltonian Mechanics / Canonical Transformations`) where ancestor titles are clickable buttons that load that document via `GET /api/doc?id=<docId>`. In `SidebarTree`, the `Document Tree` section renders the full hierarchical tree of documents from `documents` (`aria-label="Open document <Title>"`), highlighting the active document and indenting child documents under their parents. In `ConceptBlockCard`, any block that has branched child documents (via `parentBlockId === block.id` in `documents` or trailing `[→ Deep dive: <Title>](<filename>)` links) renders a `SubDocLinkCard` (`data-testid="subdoc-link-card-<childDocId>"`) at the bottom of the card; clicking it navigates directly to that child document.

## Acceptance criteria

- **AC-1** — Given an open `InlineChatDrawer` with at least one Q&A turn on `blk_02`, when the user clicks `Branch Doc`, then `POST /api/blocks/blk_02/branch` is called, the chat drawer closes, and the Workbench displays the newly branched child document with an ancestor breadcrumb linking back to the parent document.
- **AC-2** — Given a workspace with a root document (`index`) and a branched child document (`canonical-transformations`) linked from `blk_02`, when the user views the child document and clicks the root document in the `Document Breadcrumbs` bar (or in `SidebarTree`), then `GET /api/doc?id=index` is called, the root document renders, and `blk_02` displays a `SubDocLinkCard` (`→ Deep dive: Canonical Transformations`).
- **AC-3** — Given `blk_02` displays a `SubDocLinkCard` for `Canonical Transformations`, when the user clicks that `SubDocLinkCard` (or clicks `Canonical Transformations` in `SidebarTree`), then `GET /api/doc?id=canonical-transformations` is called and the Workbench navigates to the child document.

## Tests

- `src/client/__tests__/BranchTree.test.tsx` — `branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block` (covers AC-1, AC-2)
- `src/client/__tests__/BranchTree.test.tsx` — `navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard` (covers AC-2, AC-3)

## Files

- `src/client/components/SubDocLinkCard.tsx`
- `src/client/components/InlineChatDrawer.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/SidebarTree.tsx`
- `src/client/App.tsx`
- `src/client/__tests__/BranchTree.test.tsx`

## Out of scope

- Runtime UI model selector and pedagogical profile switcher (Phase 04).

## Notes

- Strip or hide raw `[→ Deep dive: ...](...md)` lines from the rendered Markdown prose inside `ConceptBlockCard` when `SubDocLinkCard` renders them as structured interactive cards, while keeping the raw Markdown link intact in `.md` on disk and in `Edit MD` mode.

## Build note — 2026-10-18

**Tasks done:**
- Enabled the `Branch Doc` button (`aria-label="Branch chat from <blockId> into sub-document"`) inside `InlineChatDrawer.tsx` whenever `messages.length > 0` and no request is in flight, displaying `Branching sub-document...` while branching.
- Created `SubDocLinkCard.tsx` (`data-testid="subdoc-link-card-<childDocId>"`, `aria-label="Open sub-document <Title>"`) to render interactive `→ Deep dive: <Title>` cards at the bottom of parent Concept Blocks while stripping duplicate raw deep-dive links from the rendered prose view in `ConceptBlockCard.tsx`.
- Updated `SidebarTree.tsx` to render the hierarchical `Document Tree` starting from root documents and recursively indenting child documents with clickable `Open document <Title>` buttons.
- Updated `App.tsx` to track `documents`, handle `POST /api/blocks/:id/branch` and `GET /api/doc?id=<docId>`, pass `childDocuments` to `ConceptBlockCard`, and render the `Document Breadcrumbs` bar (`data-testid="document-breadcrumbs"`) at the top of the Workbench.

**Tests added:**
- `src/client/__tests__/BranchTree.test.tsx` — `branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block` (covers AC-1, AC-2)
- `src/client/__tests__/BranchTree.test.tsx` — `navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard` (covers AC-2, AC-3)

**Suite result:**
- 10 test files passed, 23 tests passed (`npm test`).

**Deviations from plan:**
- None.

---

## Review — 2026-10-18

**Verdict:** pass with follow-ups

### Pass 1 — Conformance

| Criterion | Met | Test |
|---|---|---|
| AC-1 | yes | `src/client/__tests__/BranchTree.test.tsx` — `branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block` |
| AC-2 | yes | `src/client/__tests__/BranchTree.test.tsx` — `branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block`, `navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard` |
| AC-3 | yes | `src/client/__tests__/BranchTree.test.tsx` — `navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard` |

### Pass 2 — Drift

- None

### Pass 3 — Correctness

- `src/client/App.tsx:185` — `handleDeleteBlock` and `handleDiscardChat` omit `?docId=<document.id>` query parameter when operating inside a branched child document (`follow-up`).
