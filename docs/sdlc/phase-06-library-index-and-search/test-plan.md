# Test plan — Phase 06 Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/sqlite-readme.test.ts` — `migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite` | automated |
| DC-2 | `src/server/__tests__/sqlite-readme.test.ts` — `generates and updates a hierarchical README.md index on seed, branch, block edit, and document delete` | automated |
| DC-3 | `src/server/__tests__/search-api.test.ts` — `GET /api/search returns ranked FTS keyword/LaTeX and semantic Concept Block matches and reflects block updates and deletions` | automated |
| DC-4 | `src/client/__tests__/SidebarSearch.test.tsx` — `searches library blocks from the sidebar, displays matching snippets, and navigates to the target document and block on click` | automated |
| DC-5 | `src/server/__tests__/agent-deduplication.test.ts` — `POST /api/prerequisites/seed and POST /api/doc/seed reuse and cross-link an existing document anywhere in the library without calling seedGenerator` | automated |
| DC-6 | `src/server/__tests__/agent-deduplication.test.ts` — `passes relatedLibraryDocs into seed/branch generators and auto-links matching Block 0 prerequisites to existing library documents` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

No gaps.

## How to run

`npm test`

## Test data

- Temporary workspace directories (`os.tmpdir()`) populated with `.folio/notebook.json` fixtures (for migration testing) and multi-document Markdown trees (`lagrangian-mechanics.md`, `noethers-theorem.md`, `canonical-transformations.md`) with LaTeX expressions and Concept Blocks.
- Deterministic stub generators (`seedGenerator`, `branchGenerator`, `documentBranchGenerator`) and deterministic local embedding/similarity functions for fast, offline test execution.
