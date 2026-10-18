# Phase 01 — Tracer Bullet: Seed, Read, and Manual Block Workbench

**Goal:** Prove the full stack end-to-end by seeding a single Markdown document (`index.md`) via LLM, parsing and persisting `<!-- folio:block -->` delimiters (including fallback recovery for externally edited Markdown), rendering Concept Blocks with Mermaid diagrams, and editing/splitting/merging/deleting blocks manually.

## Scope

- **`src/shared/schema.ts`:** Core Zod 4 schemas for `ConceptBlock`, `TocItem`, `DocumentNode`, `NotebookState`, and `SeedResultSchema`.
- **`src/server/markdown.ts`:** Block parser (`parseMarkdownBlocks`), serializer (`serializeMarkdownBlocks`), external-edit fallback recovery (splitting unmarked Markdown on `## ` headings and assigning block IDs), and dynamic Table of Contents extractor (`extractToc`).
- **`src/server/store.ts`:** Workspace filesystem store managing `index.md` and `.folio/notebook.json`, plus atomic block mutation helpers (update, split, merge with next, delete).
- **`src/server/llm.ts` & `src/server/app.ts`:** Vercel AI SDK 7 topic seeding (`seedDocument`) and Hono 4 HTTP routes (`GET /api/doc`, `POST /api/doc/seed`, `PUT /api/blocks/:id`, `POST /api/blocks/:id/split`, `POST /api/blocks/:id/merge`, `DELETE /api/blocks/:id`).
- **`src/client/`:** Editorial React 19 + Vite 8 workbench (`SidebarTree` with Current Doc ToC and `+ Seed` trigger, `SeedModal`, and `ConceptBlockCard` with Markdown + Mermaid rendering and manual `Edit MD` / `Split` / `Merge` / `Delete` actions).

## Done criteria

1. **DC-1:** A Markdown file containing `<!-- folio:block id="..." -->` markers parses into an ordered list of Concept Blocks with matching IDs and round-trips back to identical Markdown on disk.
2. **DC-2:** A Markdown file edited externally without `<!-- folio:block -->` markers splits on `## ` headings, receives generated `blk_...` IDs, and persists those markers on the next save.
3. **DC-3:** Headings (`#`, `##`, `###`) inside a document's Concept Blocks extract into an ordered Table of Contents with heading level, text, and owning `blockId`.
4. **DC-4:** Submitting a topic prompt to `POST /api/doc/seed` invokes the LLM seed schema (`4–8` blocks), writes `index.md` with `<!-- folio:block -->` delimiters and `.folio/notebook.json` to the workspace directory, and returns the document and ToC.
5. **DC-5:** Opening the Workbench UI when the workspace is empty shows the Seed Topic prompt, and submitting a prompt renders the generated Concept Blocks, Mermaid diagram blocks, and Sidebar Table of Contents.
6. **DC-6:** Clicking `Edit MD` on a Concept Block opens a raw Markdown textarea, and saving updates the block in the UI and persists the updated `index.md` on disk.
7. **DC-7:** Clicking `Split`, `Merge`, or `Delete` on a Concept Block splits the block into two blocks, merges it with the following block, or removes it, updating both the UI and `index.md` on disk.

## Not in this phase

- Ephemeral inline cell Q&A chats (`InlineChatDrawer`).
- LLM multi-cell `Integrate` pass or `pendingEdits` synchronous diff gate.
- Child sub-document branching or multi-document tree navigation.
- Runtime UI switching between LLM providers or pedagogical prompt profiles.

## Epics

- `epic-01-markdown-store.md` — Scaffold the TypeScript/Vite/Hono/Vitest project and implement the `<!-- folio:block -->` Markdown parser, external-edit fallback, ToC extractor, and filesystem workspace store.
- `epic-02-seed-and-read-ui.md` — Add the LLM topic seed service, Hono document API routes, and the React Workbench UI to seed and render Concept Blocks, Mermaid diagrams, and the Sidebar ToC.
- `epic-03-manual-block-editing.md` — Add server endpoints and `ConceptBlockCard` UI controls for manual inline raw Markdown editing, block splitting, merging, and deletion.

## Risks

- **Mermaid DOM API in headless tests:** Mermaid's SVG renderer uses browser layout APIs absent in `jsdom`; isolate Mermaid rendering behind a clean component wrapper that degrades gracefully in test environments while verifying diagram block rendering.
- **Missing API key during local or automated runs:** The LLM adapter must support a deterministic stub/injected generator for tests and return a clear, non-crashing error payload (`400`/`502`) when no provider API key is configured in `.env`.
