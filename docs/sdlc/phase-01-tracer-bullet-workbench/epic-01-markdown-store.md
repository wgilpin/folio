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

---

## Build note — 2026-10-18

**Result:** green

### Tasks done

- Scaffolded TypeScript, Vite, and Vitest project configuration (`package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`).
- Defined shared Zod 4 schemas (`ConceptBlockSchema`, `TocItemSchema`, `DocumentNodeSchema`, `NotebookStateSchema`, `SeedResultSchema`, `IntegrateResultSchema`) in `src/shared/schema.ts`.
- Implemented `parseMarkdownBlocks`, `serializeMarkdownBlocks`, and `extractToc` in `src/server/markdown.ts`, including fallback splitting on top-level `## ` headings outside fenced code blocks when `<!-- folio:block -->` markers are absent.
- Implemented `WorkspaceStore` in `src/server/store.ts` to read and persist `index.md` and `.folio/notebook.json`, normalizing external edits with `<!-- folio:block id="..." -->` delimiters on save.
- Added unit and filesystem integration tests in `src/server/__tests__/markdown.test.ts` and `src/server/__tests__/store.test.ts`.

### Tests added

- `src/server/__tests__/markdown.test.ts` — `parses and round-trips folio:block markers identically`
- `src/server/__tests__/markdown.test.ts` — `recovers unmarked external markdown by splitting on ## headings and assigning blk_ IDs`
- `src/server/__tests__/markdown.test.ts` — `extracts ordered Table of Contents items mapped to owning blockId and ignores headings in code fences`
- `src/server/__tests__/store.test.ts` — `persists index.md and .folio/notebook.json and normalizes external edits on save`

### Suite result

`npm test` — `Test Files 2 passed (2)`, `Tests 4 passed (4)`

### Deviations from the plan

None.

### Follow-ups

- Add block mutation methods (`updateBlock`, `splitBlock`, `mergeBlockWithNext`, `deleteBlock`) to `WorkspaceStore` in Epic 03.

---

## Review — 2026-10-18

**Verdict:** pass

### Acceptance criteria

| AC | Met | Proved by |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/markdown.test.ts` — `parses and round-trips folio:block markers identically` |
| AC-2 | yes | `src/server/__tests__/markdown.test.ts` — `recovers unmarked external markdown by splitting on ## headings and assigning blk_ IDs` & `src/server/__tests__/store.test.ts` — `persists index.md and .folio/notebook.json and normalizes external edits on save` |
| AC-3 | yes | `src/server/__tests__/markdown.test.ts` — `extracts ordered Table of Contents items mapped to owning blockId and ignores headings in code fences` |
| AC-4 | yes | `src/server/__tests__/store.test.ts` — `persists index.md and .folio/notebook.json and normalizes external edits on save` |

### Drift

None.

### Findings

None.

### Follow-ups

None.

