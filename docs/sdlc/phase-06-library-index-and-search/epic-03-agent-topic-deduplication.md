# Epic 03 — Library-Wide Agent Topic Deduplication & Cross-Linking

**Phase:** 06 Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication
**Goal:** Equip seed, prerequisite, and branch flows with library-wide lookup and search so existing topics are reused and cross-linked rather than duplicated, and related library documents/blocks are injected into generator context.
**Done criteria covered:** DC-5, DC-6

## Behaviour

Before generating a document on `POST /api/doc/seed` or `POST /api/prerequisites/seed`, Folio checks `.folio/library.sqlite` across the entire workspace library (not only direct children of the current document) for an existing document matching the requested topic by canonical title, short title, slug, or `topic_links`. If a matching document already exists anywhere in the library, Folio reuses it—linking it into the parent document's `prerequisiteDocIds`, `childDocIds`, and `blk_00` `[→ Deep dive: <Title>](<filename>.md)` when triggered from a prerequisite chip—without invoking `seedGenerator` to create a duplicate `.md` file. When generating a genuinely new document via `seedGenerator`, `branchGenerator`, or `documentBranchGenerator`, Folio queries the library search index for related existing documents and Concept Blocks, passes them as `relatedLibraryDocs` into the generator options so the LLM cross-links and builds on prior material, and automatically binds any newly generated Block 0 `prerequisites` that match existing library documents into `prerequisiteDocIds` and `[→ Deep dive: ...]` links.

## Acceptance criteria

- **AC-1** — Given a workspace where `lagrangian-mechanics.md` already exists as a root document or under another branch in `.folio/library.sqlite`, when `POST /api/prerequisites/seed` is called with `{ topic: 'Lagrangian Mechanics', parentDocId: 'hamiltonian-mechanics' }` (or `POST /api/doc/seed` is called with `{ prompt: 'Lagrangian Mechanics' }`), then Folio reuses `lagrangian-mechanics` without calling `seedGenerator`, records `prerequisiteDocIds['Lagrangian Mechanics'] = 'lagrangian-mechanics'` on `hamiltonian-mechanics`, appends `[→ Deep dive: Lagrangian Mechanics](lagrangian-mechanics.md)` to `blk_00`, and returns the existing document.
- **AC-2** — Given a workspace containing existing documents on related topics in `.folio/library.sqlite`, when `POST /api/doc/seed`, `POST /api/blocks/:id/branch`, or `POST /api/doc/branch` generates a new document whose prompt or chat transcript overlaps with those library topics, then `seedGenerator`, `branchGenerator`, or `documentBranchGenerator` receives `relatedLibraryDocs` containing the matching document titles, filenames, and block summaries, and `formatRelatedLibraryDocsPrompt` instructs the model to cross-link (`[→ Deep dive: <Title>](<filename>.md)`) rather than re-derive covered material.
- **AC-3** — Given a newly seeded or branched document whose generated Block 0 `prerequisites` include a topic that already exists as a document in `.folio/library.sqlite`, when the document is saved, then `WorkspaceStore` automatically populates `prerequisiteDocIds[<topic>] = <existingDocId>` on the new document and appends `[→ Deep dive: <Concise Title>](<existingFilename>)` to `blk_00`.

## Tests

- `src/server/__tests__/agent-deduplication.test.ts` — `POST /api/prerequisites/seed and POST /api/doc/seed reuse and cross-link an existing document anywhere in the library without calling seedGenerator` (proves library-wide topic deduplication and cross-linking; covers AC-1).
- `src/server/__tests__/agent-deduplication.test.ts` — `passes relatedLibraryDocs into seed/branch generators and auto-links matching Block 0 prerequisites to existing library documents` (proves pre-flight retrieval context injection and automatic Block 0 prerequisite cross-linking; covers AC-2, AC-3).

## Files

- `src/shared/schema.ts` (add `RelatedLibraryDocSchema` type for generator context)
- `src/server/llm.ts` (add `relatedLibraryDocs?: RelatedLibraryDoc[]` to `SeedGeneratorOptions`, `BranchGenerator`, and `DocumentBranchGenerator`, plus `formatRelatedLibraryDocsPrompt`)
- `src/server/store.ts` (upgrade `findExistingPrerequisiteDocument` and add `findExistingTopicDocument` + automatic Block 0 prerequisite cross-linking against `.folio/library.sqlite`)
- `src/server/app.ts` (wire pre-flight deduplication and `relatedLibraryDocs` search retrieval into `/api/doc/seed`, `/api/prerequisites/seed`, `/api/blocks/:id/branch`, and `/api/doc/branch`)
- `src/server/__tests__/agent-deduplication.test.ts` (new)

## Out of scope

- Automatic background rewriting of older documents when a new document is seeded.

## Notes

- Direct reuse on `POST /api/doc/seed` should only trigger when the normalized prompt matches an existing document's title, shortTitle, slug, or registered topic key (so a long, specific prompt that merely mentions an existing topic still seeds a new document while receiving the existing document in `relatedLibraryDocs`).
