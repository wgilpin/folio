# Epic 02 — Topic Seeding API & Read Workbench UI

**Phase:** 01 Tracer Bullet: Seed, Read, and Manual Block Workbench
**Goal:** Build the LLM topic seeding service, Hono document API routes, and React Workbench UI to seed a topic and read rendered Concept Blocks with Mermaid diagrams and a Sidebar Table of Contents.
**Done criteria covered:** DC-4, DC-5

## Behaviour

When the user opens the Workbench on an empty workspace, they see an editorial Seed Topic prompt (`#FAF8F5` paper canvas, `#18181B` ink). Submitting a topic calls `POST /api/doc/seed`, which uses the Vercel AI SDK (`generateObject` with `SeedResultSchema`, or an injected generator in tests) to create 4–8 Concept Blocks, saves `index.md` and `.folio/notebook.json`, and renders the Concept Blocks (Markdown prose + Mermaid diagrams) alongside the collapsible left `SidebarTree` showing the document title, Current Doc ToC, and active `.env` model name.

## Acceptance criteria

- **AC-1** — Given an empty workspace, when `GET /api/doc` is requested, then it returns `{ document: null, blocks: [], toc: [], modelId }` with status `200`.
- **AC-2** — Given a topic prompt posted to `POST /api/doc/seed`, when the seed generator returns a title and 4–8 concept block Markdown strings, then `index.md` and `.folio/notebook.json` are written to disk and the endpoint returns the saved `document`, `blocks`, and `toc`.
- **AC-3** — Given an empty workspace in the React Workbench, when the user types a topic prompt and submits the Seed form, then the UI calls `POST /api/doc/seed` and renders each returned `ConceptBlockCard` and the `SidebarTree` Table of Contents items.
- **AC-4** — Given a Concept Block containing a fenced `mermaid` code block, when rendered in `ConceptBlockCard`, then the prose renders as formatted HTML and the Mermaid block renders inside a dedicated diagram container (`data-testid="mermaid-diagram"`).

## Tests

- `src/server/__tests__/api.test.ts` — `GET /api/doc returns null document on empty workspace` (covers AC-1)
- `src/server/__tests__/api.test.ts` — `POST /api/doc/seed generates 4-8 blocks and persists index.md and .folio/notebook.json` (covers AC-2)
- `src/client/__tests__/Workbench.test.tsx` — `renders empty seed state, submits topic prompt, and displays Concept Blocks, Mermaid diagram container, and Sidebar ToC` (covers AC-3, AC-4)

## Files

- `index.html`
- `src/server/llm.ts`
- `src/server/app.ts`
- `src/server/index.ts`
- `src/client/main.tsx`
- `src/client/App.tsx`
- `src/client/components/SidebarTree.tsx`
- `src/client/components/SeedModal.tsx`
- `src/client/components/ConceptBlockCard.tsx`
- `src/client/components/MermaidDiagram.tsx`
- `src/server/__tests__/api.test.ts`
- `src/client/__tests__/Workbench.test.tsx`

## Out of scope

- Inline cell Q&A chats, multi-cell `Integrate`, and manual block edit/split/merge/delete controls (covered in Epic 03).

## Notes

- Apply the exact tokens from [design.md](../../design.md): `#FAF8F5` background, `#FFFFFF` card surface, `#F3EFEA` sidebar surface, `#E4DFD7` border, `#18181B` ink, `#65635E` muted text, `#1D4ED8` primary cobalt, and serif prose (`Newsreader`, `Charter`, `Georgia`).
