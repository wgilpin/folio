# Epic 01 — Markdown Block Parser, ToC Extractor & Workspace Store

**Phase:** 01 Tracer Bullet: Seed, Read, and Manual Block Workbench
**Goal:** Scaffold the TypeScript/Vitest project and implement the `<!-- folio:block -->` Markdown parser, external-edit fallback, Table of Contents extractor, and local filesystem store.
**Done criteria covered:** DC-1, DC-2, DC-3

## Behaviour

The project runs `npm test` via Vitest and provides a local workspace store (`WorkspaceStore`) backed by `index.md` and `.folio/notebook.json`. Reading a Markdown file with `<!-- folio:block id="..." -->` delimiters returns the exact sequence of Concept Blocks and round-trips back to identical Markdown. Reading a Markdown file that was created or edited externally without markers splits it into Concept Blocks on `## ` headings, assigns stable `blk_...` IDs, extracts an ordered Table of Contents mapped to block IDs, and writes the normalized markers on save.

## Acceptance criteria

- **AC-1** — Given a Markdown string with `<!-- folio:block id="blk_01" -->` and `<!-- folio:block id="blk_02" -->` delimiters (including fenced `mermaid` code blocks), when parsed with `parseMarkdownBlocks` and re-serialized with `serializeMarkdownBlocks`, then the block IDs and contents match and the serialized Markdown equals the normalized input.
- **AC-2** — Given a plain Markdown file with multiple `## ` sections and no `<!-- folio:block -->` comments, when loaded through `WorkspaceStore.loadDocument()`, then each section becomes a `ConceptBlock` with a generated `blk_` ID and saving writes `<!-- folio:block id="..." -->` markers to `index.md`.
- **AC-3** — Given Concept Blocks containing `#`, `##`, and `###` headings (ignoring `#` inside fenced code blocks), when `extractToc(blocks)` runs, then it returns an ordered list of `{ level, text, blockId }` entries matching the document headings.
- **AC-4** — Given a temporary workspace directory, when `WorkspaceStore` saves a document, then `index.md` contains only clean Markdown with block comment delimiters and `.folio/notebook.json` stores the document tree metadata.

## Tests

- `src/server/__tests__/markdown.test.ts` — `parses and round-trips folio:block markers identically` (covers AC-1)
- `src/server/__tests__/markdown.test.ts` — `recovers unmarked external markdown by splitting on ## headings and assigning blk_ IDs` (covers AC-2)
- `src/server/__tests__/markdown.test.ts` — `extracts ordered Table of Contents items mapped to owning blockId and ignores headings in code fences` (covers AC-3)
- `src/server/__tests__/store.test.ts` — `persists index.md and .folio/notebook.json and normalizes external edits on save` (covers AC-2, AC-4)

## Files

- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `src/shared/schema.ts`
- `src/server/markdown.ts`
- `src/server/store.ts`
- `src/server/__tests__/markdown.test.ts`
- `src/server/__tests__/store.test.ts`

## Out of scope

- HTTP server routes, LLM calls, and React UI components (covered in Epic 02 and Epic 03).

## Notes

- Follow [ADR 0001](../../adr/0001-markdown-block-delimiters-and-sidecar.md) for the exact `<!-- folio:block id="<id>" -->` format and `.folio/notebook.json` sidecar separation.
