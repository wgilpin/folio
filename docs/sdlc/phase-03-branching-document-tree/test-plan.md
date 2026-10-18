# Test plan — Phase 03 Sub-Document Branching & Ancestor Tree Navigation

## Coverage

| Criterion | Epic | Kind | Test |
|---|---|---|---|
| DC-1 | `epic-01-branch-doc-and-ancestor-context` | automated | `src/server/__tests__/branch-api.test.ts` — `POST /api/blocks/:id/branch creates child .md document, appends markdown link to parent block, updates document tree, and clears activeChat` |
| DC-2 | `epic-01-branch-doc-and-ancestor-context` | automated | `src/server/__tests__/branch-api.test.ts` — `rejects POST /api/blocks/:id/branch with 409 when pendingEdits exist on the parent document` |
| DC-3 | `epic-01-branch-doc-and-ancestor-context` | automated | `src/server/__tests__/branch-api.test.ts` — `buildBoundedCellContext populates root-to-parent ancestorTocs across multi-level branched documents and GET /api/doc returns documents map` |
| DC-4 | `epic-02-tree-navigation-ui` | automated | `src/client/__tests__/BranchTree.test.tsx` — `branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block` |
| DC-5 | `epic-02-tree-navigation-ui` | automated | `src/client/__tests__/BranchTree.test.tsx` — `navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard` |

## Gaps

None. Every done criterion is covered by an automated test.
