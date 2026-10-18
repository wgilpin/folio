# Phase 03 — Sub-Document Branching & Ancestor Tree Navigation

**Goal:** Expand the single-document workbench into a hierarchical "live book" by resolving a cell chat via **Branch Doc**, generating a transcript-seeded child `.md` document, linking it from parent cell $N$, rendering the sidebar Document Tree and breadcrumbs, and injecting the full Ancestor ToC chain into cell context.

## Done criteria

- **DC-1** — Calling `POST /api/blocks/:id/branch` on an active cell chat generates a child document (4–8 blocks via `branchGenerator` using the chat transcript and bounded cell context), writes `<child-slug>.md` to the workspace, registers the parent-child relationship (`parentId`, `parentBlockId`, `childDocIds`) in `.folio/notebook.json`, appends a standard Markdown link (`[→ Deep dive: <Child Title>](<child-slug>.md)`) to parent block $N$, and clears `activeChat`.
- **DC-2** — When `pendingEdits` is non-empty for the active document, `POST /api/blocks/:id/branch` rejects with HTTP `409` (`Resolve pending suggested edits first`).
- **DC-3** — `buildBoundedCellContext` for a block inside a child or grandchild document walks the `parentId` chain up to the root document and populates `ancestorTocs` in root-to-parent order, and `GET /api/doc?id=<docId>` returns the full `documents` map alongside `document`, `blocks`, `toc`, `activeChat`, and `pendingEdits`.
- **DC-4** — Clicking **Branch Doc** inside `InlineChatDrawer` calls `POST /api/blocks/:id/branch`, closes the chat drawer, navigates the Workbench to the newly branched child document, and renders `SubDocLinkCard` (`→ Deep dive: <Child Title>`) on the parent block when viewing the parent document.
- **DC-5** — The Workbench renders hierarchical `SidebarTree` document navigation and top-of-page ancestor breadcrumbs so clicking any ancestor breadcrumb, sidebar Document Tree node, or `SubDocLinkCard` loads and displays that document.

## Epics

1. `epic-01-branch-doc-and-ancestor-context` — Transcript-Seeded Sub-Document Branching API, Parent Link Mutation & Multi-Level Ancestor Context (covers DC-1, DC-2, DC-3).
2. `epic-02-tree-navigation-ui` — Branch Doc Action, `SubDocLinkCard`, Hierarchical `SidebarTree` & Breadcrumb Navigation UI (covers DC-4, DC-5; depends on `epic-01-branch-doc-and-ancestor-context`).

## Out of scope

- Runtime UI switching between LLM providers/thinking budgets, customizable pedagogical system prompts, or switching between multiple notebook workspace folders in the UI (Phase 04).
- Global Learner Profile (`~/.folio/profile.json`) and interactive Prerequisite Chips (Phase 05).
