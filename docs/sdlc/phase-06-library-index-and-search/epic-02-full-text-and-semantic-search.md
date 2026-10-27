# Epic 02 — Concept Block Full-Text & Semantic Search API and Sidebar Search UI

**Phase:** 06 Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication
**Goal:** Index all Concept Blocks and documents in `.folio/library.sqlite` for instant keyword/LaTeX full-text search and semantic similarity search via `GET /api/search`, and add an interactive Library Search panel in the Notebook Sidebar.
**Done criteria covered:** DC-3, DC-4

## Behaviour

Every Concept Block saved in `.folio/library.sqlite` is indexed with its document ID, block ID, section heading, raw Markdown (preserving LaTeX notation), full-text search tokens (SQLite FTS5), and a normalized semantic embedding vector. Calling `GET /api/search?q=<query>&mode=<hybrid|fts|semantic>` searches across all documents and Concept Blocks in the active workspace and returns ranked matches (`{ docId, docTitle, blockId, heading, snippet, score, matchType }`). In the React Workbench, the Notebook Sidebar includes a Search input (`aria-label="Search library"`); typing a query displays matching Concept Block results with document titles and snippets, and clicking any result loads that document and scrolls smoothly to `#block-<blockId>`.

## Acceptance criteria

- **AC-1** — Given multiple seeded documents in `.folio/library.sqlite` containing prose and LaTeX formulas (e.g. `\mathcal{L} = T - V` and `Noether's theorem`), when `GET /api/search?q=...` is called in `fts` or `hybrid` mode, then it returns ranked matches with the matching `docId`, `docTitle`, `blockId`, `heading`, and a text `snippet`.
- **AC-2** — Given Concept Blocks indexed in `.folio/library.sqlite`, when `GET /api/search?q=...&mode=semantic` (or `hybrid` with a conceptual paraphrase that shares domain semantics) is called, then it ranks conceptually related blocks using cosine similarity over stored block embeddings, and updating or deleting a block immediately updates or removes its search index entry.
- **AC-3** — Given the Workbench UI with documents loaded, when the user types a search query into the Sidebar search input (`aria-label="Search library"`) and clicks a returned search result, then the Workbench fetches `/api/doc?id=<docId>` (if not already on that document) and scrolls to the target Concept Block (`#block-<blockId>`).

## Tests

- `src/server/__tests__/search-api.test.ts` — `GET /api/search returns ranked FTS keyword/LaTeX and semantic Concept Block matches and reflects block updates and deletions` (proves keyword, LaTeX, and semantic search plus index synchronization on block edit/delete; covers AC-1, AC-2).
- `src/client/__tests__/SidebarSearch.test.tsx` — `searches library blocks from the sidebar, displays matching snippets, and navigates to the target document and block on click` (proves sidebar search input, result list rendering, document switching, and block scrolling; covers AC-3).

## Files

- `src/shared/schema.ts` (add `SearchResultItemSchema`, `SearchResponseSchema`, and `SearchModeSchema`)
- `src/server/search.ts` (new — SQLite FTS5 + semantic vector indexing and hybrid ranking)
- `src/server/db.ts` (add `blocks_fts` virtual table and embedding column/storage)
- `src/server/store.ts` (keep block search index synchronized on save, update, split, merge, integrate, and delete)
- `src/server/app.ts` (add `GET /api/search` route)
- `src/client/components/SidebarTree.tsx` (add Library Search input and result cards)
- `src/client/App.tsx` (handle selecting a search result: switch document and scroll to `blockId`)
- `src/server/__tests__/search-api.test.ts` (new)
- `src/client/__tests__/SidebarSearch.test.tsx` (new)

## Out of scope

- Agent pre-flight deduplication and `relatedLibraryDocs` prompt context injection — covered in Epic 03.

## Notes

- Provide a deterministic local feature-hashing / n-gram semantic vector embedder by default (with optional pluggable provider embeddings) so semantic and hybrid search work offline with zero latency and deterministic test behavior.
