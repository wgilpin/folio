# Issues — folio

One line per issue, newest last. Status is `open`, `scheduled`, `fixed`,
or `dropped`. This file records issues. It never records stage status.

## ISS-1 — Persist configurable Root Folder and save seeded root documents as `<topic-slug>.md` without overwriting

**Raised:** 2026-10-19
**Status:** fixed 2026-10-19
**Lands in:** fixed on main

Persisted the user-configured Root Folder (`workspaceDir` and `workspaces`) in `~/.folio/profile.json` across restarts, updated `POST /api/doc/seed` (`store.seedRootDocument`) to save every seeded topic as `<topic-slug>.md` (`parentId: null`) rather than overwriting `index.md`, and added collapsible multi-layer tree nodes in `SidebarTree.tsx`. Proved by `src/server/__tests__/api.test.ts` and `src/server/__tests__/settings-workspace-api.test.ts`.

## ISS-2 — Add hierarchical topic index (`README.md`), full-text search, semantic search, and agent topic deduplication

**Raised:** 2026-10-19
**Status:** fixed 2026-10-27
**Lands in:** phase 06 (fixed on main)

Flat `.md` storage in the root folder needs an auto-generated hierarchical `README.md` map for external human readers plus full-text and semantic search across Concept Blocks so both the user and the LLM agent can find and cross-link existing topic expansions instead of duplicating them.

## ISS-3 — Replace monolithic `.folio/notebook.json` with a scalable local database (`.folio/library.sqlite`) as document trees and prerequisite graphs grow

**Raised:** 2026-10-19
**Status:** fixed 2026-10-27
**Lands in:** phase 06 (fixed on main)

As the user builds many documents, deep tree layers, and cross-document `prerequisiteDocIds` / `topicDocIds` edges, `.folio/notebook.json` will grow too large to read/write as a single JSON blob on every request and should be replaced by a local SQLite store (`.folio/library.sqlite`) alongside FTS/vector search in Phase 06.

## ISS-4 — Unified central learner ability record (self-supplied background, learning instructions, and engaged sources) + cell `Done` status toggle

**Raised:** 2026-10-19
**Status:** fixed 2026-10-27
**Lands in:** phase 07 (fixed on main)

Combine user self-supplied background (e.g., *"I did first year Nat Sci (Physical) at Cambridge."*), persistent learning/style instructions (e.g., *"I am a visual learner. Explain terms as they are introduced"*), and an automatic record of sources/cells engaged with into a single central learner ability record, backed by a per-cell **Done** check-off status on Concept Blocks (checked off visually in place without hiding the cell).

## ISS-5 — Always-on OrbStack deployment (`folio.teleosis.ai`), Caddy central auth (`tinyauth` + bearer token bypass), and cross-Mac Folio Skill

**Raised:** 2026-10-27
**Status:** fixed 2026-10-27
**Lands in:** phase 08 (fixed on main)

Serve the compiled Vite SPA and `/api/*` from Hono in an always-on OrbStack container (`folio` on `web-routing` with persistent host volume mounts), gate `folio.teleosis.ai` (and other `*.teleosis.ai` apps) in `/Users/will/projects/caddy` via a reusable `(protected)` snippet (`tinyauth` browser SSO + `Authorization: Bearer $TELEOSIS_API_KEY` bypass), and provide a Folio Skill so LLM sessions on any Mac can query the Learner Ability Record, search Concept Blocks, and read documents.

## ISS-6 — Remove or hide vestigial `Root Folder` (`/data/workspace`) switcher in the Notebook Sidebar

**Raised:** 2026-10-28
**Status:** fixed 2026-10-28
**Lands in:** phase 09 (fixed on main)

`SidebarTree.tsx` renders a `ROOT FOLDER` (`/data/workspace`) text input and `Switch Workspace` button at the top of the sidebar, which is vestigial now that all notebooks live in a single unified library inside the OrbStack container.

## ISS-7 — Add a Download MD button in the notebook header to download the active notebook as clean Markdown without block comments

**Raised:** 2026-11-01
**Status:** fixed 2026-11-01
**Lands in:** fixed on main

Added a **Download MD** (`doc-download-md-btn`) button in the notebook header of `src/client/App.tsx` that downloads the active notebook as `<document.filename>` with `<!-- folio:block ... -->` comments stripped out. Proved by `src/client/__tests__/AdversarialReview.test.tsx` (`downloads clean Markdown without block comments when Download MD is clicked in the notebook header`).

## ISS-8 — Render Mermaid charts as SVG diagrams instead of falling back to raw text

**Raised:** 2026-11-02
**Status:** fixed 2026-11-02
**Lands in:** fixed on main

Normalized unquoted Mermaid `subgraph` headers and node labels containing parentheses, colons, or special characters via `sanitizeMermaidCode` in `src/client/components/MermaidDiagram.tsx`, added unique per-render diagram IDs and SVG `getBBox` fallback support, and added Mermaid syntax formatting rules in `src/server/llm.ts`. Proved by `src/client/__tests__/Workbench.test.tsx` (`renders Mermaid flowchart with unquoted subgraph titles containing parentheses and colons as an SVG diagram instead of raw pre text`).


