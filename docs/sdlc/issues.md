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
**Status:** scheduled
**Lands in:** phase 06

Flat `.md` storage in the root folder needs an auto-generated hierarchical `README.md` map for external human readers plus full-text and semantic search across Concept Blocks so both the user and the LLM agent can find and cross-link existing topic expansions instead of duplicating them.

## ISS-3 — Replace monolithic `.folio/notebook.json` with a scalable local database (`.folio/library.sqlite`) as document trees and prerequisite graphs grow

**Raised:** 2026-10-19
**Status:** scheduled
**Lands in:** phase 06

As the user builds many documents, deep tree layers, and cross-document `prerequisiteDocIds` / `topicDocIds` edges, `.folio/notebook.json` will grow too large to read/write as a single JSON blob on every request and should be replaced by a local SQLite store (`.folio/library.sqlite`) alongside FTS/vector search in Phase 06.

## ISS-4 — Unified central learner ability record (self-supplied background, learning instructions, and engaged sources) + cell `Done` status toggle

**Raised:** 2026-10-19
**Status:** scheduled
**Lands in:** phase 07

Combine user self-supplied background (e.g., *"I did first year Nat Sci (Physical) at Cambridge."*), persistent learning/style instructions (e.g., *"I am a visual learner. Explain terms as they are introduced"*), and an automatic record of sources/cells engaged with into a single central learner ability record, backed by a per-cell **Done** check-off status on Concept Blocks (checked off visually in place without hiding the cell).

## ISS-5 — Always-on OrbStack deployment (`folio.teleosis.ai`), Caddy central auth (`tinyauth` + bearer token bypass), and cross-Mac Folio Skill

**Raised:** 2026-10-27
**Status:** scheduled
**Lands in:** phase 08

Serve the compiled Vite SPA and `/api/*` from Hono in an always-on OrbStack container (`folio` on `web-routing` with persistent host volume mounts), gate `folio.teleosis.ai` (and other `*.teleosis.ai` apps) in `/Users/will/projects/caddy` via a reusable `(protected)` snippet (`tinyauth` browser SSO + `Authorization: Bearer $TELEOSIS_API_KEY` bypass), and provide a Folio Skill so LLM sessions on any Mac can query the Learner Ability Record, search Concept Blocks, and read documents.
