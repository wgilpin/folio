# Test plan — Phase 01 Tracer Bullet: Seed, Read, and Manual Block Workbench

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/markdown.test.ts` — `parses and round-trips folio:block markers identically` | automated |
| DC-2 | `src/server/__tests__/markdown.test.ts` — `recovers unmarked external markdown by splitting on ## headings and assigning blk_ IDs` | automated |
| DC-3 | `src/server/__tests__/markdown.test.ts` — `extracts ordered Table of Contents items mapped to owning blockId` | automated |
| DC-4 | `src/server/__tests__/api.test.ts` — `POST /api/doc/seed generates 4-8 blocks and persists index.md and .folio/notebook.json` | automated |
| DC-5 | `src/client/__tests__/Workbench.test.tsx` — `renders empty seed state, submits topic prompt, and displays Concept Blocks, Mermaid diagram container, and Sidebar ToC` | automated |
| DC-6 | `src/client/__tests__/Workbench.test.tsx` — `edits raw Markdown inline on a Concept Block and persists via PUT /api/blocks/:id` | automated |
| DC-7 | `src/client/__tests__/Workbench.test.tsx` & `src/server/__tests__/api.test.ts` — `splits, merges, and deletes Concept Blocks and updates index.md on disk` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

None.

## How to run

`npm test`

## Test data

- Temporary filesystem workspace directories created per test via `fs.mkdtemp` in `os.tmpdir()` so tests never touch a user workspace.
- Injected/mocked `SeedGenerator` function passed to the Hono app factory so HTTP and UI tests run deterministically offline without live LLM API calls.
