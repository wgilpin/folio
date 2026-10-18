# Epic 01 — Transcript-Seeded Sub-Document Branching API, Parent Link Mutation & Multi-Level Ancestor Context

**Phase:** 03 Sub-Document Branching & Ancestor Tree Navigation
**Goal:** Implement the LLM `BranchGenerator`, `WorkspaceStore.branchDocumentFromChat`, `POST /api/blocks/:id/branch` with 409 gate enforcement, `documents` map in API responses, and multi-level `ancestorTocs` verification.
**Done criteria covered:** DC-1, DC-2, DC-3

## Behaviour

Calling `POST /api/blocks/:id/branch` (with optional `{ docId }`) passes the active ephemeral chat transcript and bounded cell context ($[N-1, N, N+1]$ + Current ToC + Ancestor ToCs) to `branchGenerator` (backed by Vercel AI SDK `generateObject` with `SeedResultSchema`). `WorkspaceStore.branchDocumentFromChat` creates a slugified child `docId` and `<slug>.md` file (deduplicating if a file with that slug already exists), writes the 4–8 generated `ConceptBlock` items (including `blk_00` if Block 0 is Prerequisites), registers the child `DocumentNode` (`parentId: docId`, `parentBlockId: blockId`, `childDocIds: []`) in `.folio/notebook.json`, appends the child `docId` to the parent `DocumentNode.childDocIds`, appends `\n\n[→ Deep dive: <Child Title>](<child-filename>)` to parent block $N$ in the parent `.md` file, and clears `activeChat`. All document API responses (`GET /api/doc`, `POST /api/doc/seed`, block mutations, `integrate`, `branch`, `accept`, `reject`) include `documents: Record<string, DocumentNode>` so the client can render the full Document Tree and breadcrumbs.

## Acceptance criteria

- **AC-1** — Given an active chat on block `blk_02` of `index`, when `POST /api/blocks/blk_02/branch` runs, then `branchGenerator` receives the bounded cell context and chat transcript, a new child `<slug>.md` file is written on disk, `.folio/notebook.json` records the child `DocumentNode` with `parentId: 'index'` and `parentBlockId: 'blk_02'` and adds the child ID to `index.childDocIds`, parent block `blk_02` in `index.md` ends with `[→ Deep dive: <Child Title>](<slug>.md)`, `activeChat` is cleared, and the response returns the newly created child document (`{ document, blocks, toc, documents, activeChat: null, pendingEdits: [], modelId }`).
- **AC-2** — Given `pendingEdits` is non-empty for the active document, when `POST /api/blocks/:id/branch` is called, then the server responds with status `409` and `{ error: 'Resolve pending suggested edits first' }`.
- **AC-3** — Given a root document `index`, a child document branched from `index`, and a grandchild document branched from the child, when `buildBoundedCellContext` is called on a block in the grandchild document, then `ancestorTocs` contains `[rootToc, childToc]` in root-to-parent order and `GET /api/doc?id=<grandchildId>` returns the `documents` map containing all three documents.

## Tests

- `src/server/__tests__/branch-api.test.ts` — `POST /api/blocks/:id/branch creates child .md document, appends markdown link to parent block, updates document tree, and clears activeChat` (covers AC-1)
- `src/server/__tests__/branch-api.test.ts` — `rejects POST /api/blocks/:id/branch with 409 when pendingEdits exist on the parent document` (covers AC-2)
- `src/server/__tests__/branch-api.test.ts` — `buildBoundedCellContext populates root-to-parent ancestorTocs across multi-level branched documents and GET /api/doc returns documents map` (covers AC-3)

## Files

- `src/server/llm.ts`
- `src/server/store.ts`
- `src/server/app.ts`
- `src/server/context.ts`
- `src/server/__tests__/branch-api.test.ts`

## Out of scope

- React UI components (`SubDocLinkCard`, `SidebarTree` hierarchy, breadcrumbs) — covered in Epic 02.

## Build note — 2026-10-18

- **Tasks completed:**
  - Added `BranchGenerator` type and `defaultBranchGenerator` in `src/server/llm.ts` using Vercel AI SDK `generateObject` with `SeedResultSchema`, seeding a child sub-document from bounded cell context and the active ephemeral Q&A transcript.
  - Added `documents: Record<string, DocumentNode>` to `LoadedDocument` and implemented `WorkspaceStore.branchDocumentFromChat` in `src/server/store.ts` with synchronous `pendingEdits` gate enforcement, slugified and deduplicated child `<slug>.md` creation, parent block `[→ Deep dive: <Child Title>](<child-filename>)` link appending, parent/child tree registration in `.folio/notebook.json`, and `activeChat` cleanup.
  - Added `POST /api/blocks/:id/branch` (with HTTP 409 diff-gate enforcement) and included `documents` in document API responses in `src/server/app.ts`.
  - Verified multi-level `ancestorTocs` ordering (`[rootToc, childToc]`) in `buildBoundedCellContext`.
- **Tests added:**
  - `src/server/__tests__/branch-api.test.ts` (3 tests covering AC-1, AC-2, AC-3)
- **Suite result:** 9 test files passed, 21 tests passed (`npm test`).
- **Deviations from plan:** None.

---

## Review — 2026-10-18

**Verdict:** pass

### Pass 1 — Conformance

| Criterion | Met | Test |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/branch-api.test.ts` — `POST /api/blocks/:id/branch creates child .md document, appends markdown link to parent block, updates document tree, and clears activeChat` |
| AC-2 | yes | `src/server/__tests__/branch-api.test.ts` — `rejects POST /api/blocks/:id/branch with 409 when pendingEdits exist on the parent document` |
| AC-3 | yes | `src/server/__tests__/branch-api.test.ts` — `buildBoundedCellContext populates root-to-parent ancestorTocs across multi-level branched documents and GET /api/doc returns documents map` |

### Pass 2 — Drift

- None

### Pass 3 — Correctness

- None
