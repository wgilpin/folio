# Phase 06 — Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication

**Goal:** Migrate growing tree/topic/prerequisite graph metadata from monolithic `.folio/notebook.json` into a scalable local SQLite store (`.folio/library.sqlite`), maintain an auto-generated hierarchical `README.md` index on disk for external human readers, index all Concept Blocks and documents for instant full-text and semantic search, and equip the seed/branch/prerequisite generators with library-wide retrieval so the agent reuses and cross-links existing expansions instead of duplicating topics.

## Scope

- **Backend SQLite Store & Indexer (`src/server/db.ts`, `src/server/store.ts`, `src/server/readme.ts`):** Replace monolithic `.folio/notebook.json` reads/writes with `.folio/library.sqlite` (via Node 24's built-in `node:sqlite`), automatically migrate legacy `.folio/notebook.json` workspaces on first open, and regenerate `<workspace>/README.md` whenever the document tree or document blocks change.
- **Full-Text & Semantic Search (`src/server/search.ts`, `src/server/app.ts`, `src/shared/schema.ts`):** Index all Concept Blocks and document metadata into SQLite FTS5 and semantic vector embeddings, and expose `GET /api/search?q=<query>&mode=<hybrid|fts|semantic>`.
- **Workbench Sidebar Search UI (`src/client/components/SidebarTree.tsx`, `src/client/App.tsx`):** Add a library search input and results list in the Notebook Sidebar that navigates to the selected document and scrolls to the matching Concept Block.
- **Agent Pre-Flight Retrieval & Deduplication (`src/server/llm.ts`, `src/server/store.ts`, `src/server/app.ts`):** Reuse and cross-link existing library documents on `POST /api/doc/seed` and `POST /api/prerequisites/seed` when a matching topic already exists in `.folio/library.sqlite`, and inject top related library documents/blocks (`relatedLibraryDocs`) into seed and branch generators while auto-linking matching Block 0 prerequisites.

## Done criteria

1. **DC-1** — Opening a workspace with an existing `.folio/notebook.json` automatically migrates all documents, parent-child edges, prerequisite/topic mappings, active chats, pending suggested edits, and settings into `.folio/library.sqlite`, and all subsequent reads and mutations persist in `.folio/library.sqlite` without requiring `.folio/notebook.json`.
2. **DC-2** — Seeding, branching, updating, or deleting a document writes `<workspace>/README.md` containing a hierarchical Markdown map of all root documents and nested child sub-documents with relative `[Title](<filename>.md)` links and section/prerequisite summaries.
3. **DC-3** — Calling `GET /api/search?q=<query>` returns ranked Concept Block and document matches (`{ docId, docTitle, blockId, heading, snippet, score, matchType }`) from `.folio/library.sqlite` across both keyword/LaTeX full-text queries and semantic similarity queries, reflecting block edits and deletions immediately.
4. **DC-4** — Entering a query in the Notebook Sidebar search box renders matching documents and Concept Block snippets, and clicking a result opens that document in the Workbench and scrolls to the target Concept Block.
5. **DC-5** — Calling `POST /api/prerequisites/seed` or `POST /api/doc/seed` for a topic that already matches an existing document anywhere in `.folio/library.sqlite` reuses and cross-links the existing document (updating `prerequisiteDocIds` and `[→ Deep dive: ...]` links when triggered from a prerequisite) without calling `seedGenerator` to create a duplicate `.md` file.
6. **DC-6** — Seeding or branching a new topic whose prompt, chat transcript, or Block 0 prerequisites overlap with existing documents in `.folio/library.sqlite` passes the top matching library summaries (`relatedLibraryDocs`) into `seedGenerator` / `branchGenerator` / `documentBranchGenerator` and automatically links matching Block 0 prerequisites in `prerequisiteDocIds` and block Markdown.

## Not in this phase

- Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.
- Per-cell `Done` check-off tracking and the unified central Learner Ability Record (scheduled for Phase 07).

## Epics

1. `epic-01-sqlite-store-and-readme.md` — Migrate `.folio/notebook.json` to `.folio/library.sqlite` with automatic legacy migration and maintain the hierarchical `<workspace>/README.md` library index (covers DC-1, DC-2).
2. `epic-02-full-text-and-semantic-search.md` — Index Concept Blocks in `.folio/library.sqlite` for full-text and semantic search via `GET /api/search` and add the Sidebar Search UI (covers DC-3, DC-4; depends on Epic 01).
3. `epic-03-agent-topic-deduplication.md` — Add library-wide topic deduplication, cross-linking, and pre-flight `relatedLibraryDocs` context injection across seed, prerequisite, and branch flows (covers DC-5, DC-6; depends on Epic 01 and Epic 02).

Epics run sequentially (`epic-01` → `epic-02` → `epic-03`); none are independent because Epic 02 indexes blocks into the SQLite store introduced in Epic 01, and Epic 03 queries the search index from Epic 02 for agent deduplication and context injection.

## Risks

- **SQLite synchronization with external `.md` file edits:** If a user edits a `.md` file directly in an external editor, the cached blocks in `.folio/library.sqlite` could go stale. Mitigation: `loadDocument` re-parses the `.md` file on disk and upserts its current blocks and headings into `.folio/library.sqlite`.
- **Over-aggressive deduplication when seeding distinct sub-angles:** A user might seed a broad topic and later seed a distinct sub-topic that shares one keyword. Mitigation: Exact/canonical title, slug, or registered topic-map match triggers direct document reuse (DC-5), while partial/semantic overlap passes existing documents as `relatedLibraryDocs` context for cross-linking rather than blocking generation (DC-6).
