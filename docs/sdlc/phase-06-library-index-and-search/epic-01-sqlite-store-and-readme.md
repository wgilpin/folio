# Epic 01 — SQLite Library Store Migration & Auto-Generated Hierarchical `README.md` Index

**Phase:** 06 Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication
**Goal:** Replace monolithic `.folio/notebook.json` persistence with a local `.folio/library.sqlite` database (including automatic migration from existing `.folio/notebook.json` files) and maintain an auto-generated hierarchical `<workspace>/README.md` index on disk.
**Done criteria covered:** DC-1, DC-2

## Behaviour

When Folio opens a workspace, `WorkspaceStore` initializes `.folio/library.sqlite` using Node's built-in `node:sqlite` (`DatabaseSync`) with relational tables for `documents`, `blocks`, `topic_links`, `pending_edits`, `active_chat`, and `settings`. If `.folio/notebook.json` exists and `.folio/library.sqlite` has not yet been migrated, `WorkspaceStore` imports all documents, prerequisites, topic mappings, pending edits, active chats, and settings into `.folio/library.sqlite` and renames `.folio/notebook.json` to `.folio/notebook.json.bak` so all subsequent operations run against SQLite. Whenever a document is seeded, branched, saved, or deleted, Folio automatically writes `<workspace>/README.md` with a clean hierarchical tree of all root documents and their nested sub-documents, relative Markdown links (`[Title](<filename>.md)`), and section/prerequisite summaries for external readers in GitHub, Obsidian, or VS Code.

## Acceptance criteria

- **AC-1** — Given a workspace containing a populated `.folio/notebook.json` (with documents, `prerequisiteDocIds`, `topicDocIds`, `pendingEdits`, `activeChat`, and `settings`), when `WorkspaceStore` loads or mutates the workspace, then `.folio/library.sqlite` is created and populated with the full state, `.folio/notebook.json` is archived to `.folio/notebook.json.bak`, and `GET /api/doc` returns the exact migrated state from `.folio/library.sqlite`.
- **AC-2** — Given a fresh workspace backed by `.folio/library.sqlite`, when documents are seeded, branched, edited, and had pending edits accepted/rejected via the API, then all document tree nodes, Concept Blocks, pending edits, active chats, and settings persist across new `WorkspaceStore` instances using `.folio/library.sqlite`.
- **AC-3** — Given a workspace where root and child documents are seeded, branched, updated, or deleted, when `<workspace>/README.md` is read from disk, then it contains a hierarchical Markdown index listing every root document and nested child sub-document with relative `[Title](<filename>.md)` links and its Table of Contents headings, and deleted documents are removed from `README.md`.

## Tests

- `src/server/__tests__/sqlite-readme.test.ts` — `migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite` (proves legacy JSON-to-SQLite migration and full state round-tripping; covers AC-1, AC-2).
- `src/server/__tests__/sqlite-readme.test.ts` — `generates and updates a hierarchical README.md index on seed, branch, block edit, and document delete` (proves automatic `README.md` generation and synchronization; covers AC-3).

## Files

- `src/server/db.ts` (new — SQLite schema initialization, migration from `.folio/notebook.json`, and typed data access helpers)
- `src/server/readme.ts` (new — pure/filesystem generator for `<workspace>/README.md`)
- `src/server/store.ts` (wire `WorkspaceStore` to `.folio/library.sqlite` and trigger `README.md` regeneration on document/block changes)
- `src/server/__tests__/sqlite-readme.test.ts` (new)

## Out of scope

- Full-text and semantic search endpoints (`GET /api/search`) and Sidebar Search UI — covered in Epic 02.
- Pre-flight agent deduplication across non-child documents and `relatedLibraryDocs` prompt injection — covered in Epic 03.

## Notes

- Use Node 24's built-in `node:sqlite` (`DatabaseSync`) so no native C++ addon compilation (`better-sqlite3`) is required.
- Ensure `README.md` itself is never treated as a user Concept Block document when scanning or resolving document slugs.

---

## Build note — 2026-10-27

**Result:** green

### Tasks done

- Created `src/server/db.ts` using Node 24's built-in `node:sqlite` (`DatabaseSync`) with relational tables for `documents`, `blocks`, `topic_links`, `pending_edits`, `active_chat`, and `settings`, automatic migration from `.folio/notebook.json` to `.folio/library.sqlite` (archiving `.folio/notebook.json` to `.folio/notebook.json.bak`), and block table synchronization.
- Created `src/server/readme.ts` to generate and write a hierarchical `<workspace>/README.md` library index with relative `[Title](<filename>.md)` links, prerequisite summaries, and body Table of Contents section headings, plus `isReservedReadmeSlug` to guard `resolveDocId` from resolving `README.md` as a user document.
- Wired `WorkspaceStore` in `src/server/store.ts` to persist and load all state through `.folio/library.sqlite`, synchronize document blocks in SQLite, and regenerate `<workspace>/README.md` whenever documents or blocks are seeded, branched, updated, integrated, accepted, or deleted.
- Updated legacy Phase 1–5 tests that previously read `.folio/notebook.json` directly on disk to inspect persisted state via `WorkspaceStore.loadState()`.

### Tests added

- `src/server/__tests__/sqlite-readme.test.ts` — `migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite`
- `src/server/__tests__/sqlite-readme.test.ts` — `generates and updates a hierarchical README.md index on seed, branch, block edit, and document delete`

### Suite result

- `npm test` — `Test Files  19 passed (19)`, `Tests  72 passed (72)`
- `npm run typecheck` — `tsc --noEmit` (0 errors)

### Deviations from the plan

- Updated 6 earlier server test files (`api.test.ts`, `chat-api.test.ts`, `integrate-api.test.ts`, `profile-prerequisites-api.test.ts`, `settings-workspace-api.test.ts`, `store.test.ts`) that previously read `.folio/notebook.json` directly from disk after mutations to read state via `WorkspaceStore.loadState()` now that `.folio/library.sqlite` replaces `.folio/notebook.json`, and added missing `updatedBlocks: []` in `doc-chat-api.test.ts` so `npm run typecheck` passes with zero errors.

### Follow-ups

- None.

---

## Review — 2026-10-27

**Verdict:** pass

### Acceptance criteria

| AC | Met | Proved by |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/sqlite-readme.test.ts` — `migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite` |
| AC-2 | yes | `src/server/__tests__/sqlite-readme.test.ts` — `migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite` |
| AC-3 | yes | `src/server/__tests__/sqlite-readme.test.ts` — `generates and updates a hierarchical README.md index on seed, branch, block edit, and document delete` |

### Drift

None

### Findings

None

### Follow-ups

None

