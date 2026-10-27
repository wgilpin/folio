# Phase 08 — OrbStack Deployment (`folio.teleosis.ai`), Central Caddy Auth & Cross-Mac Folio Skill

**Goal:** Package Folio as an always-on OrbStack container (`folio` on `web-routing`, port `4321`) where Hono serves both the compiled Vite SPA (`dist/`) and `/api/*` backed by persistent host volume mounts, add a central `tinyauth` SSO + `Authorization: Bearer $TELEOSIS_API_KEY` bypass snippet (`(protected)`) and `http://folio.teleosis.ai` route, and provide a Folio Skill + CLI/HTTP client so any LLM chat session across Macs can query the Learner Ability Record, search Concept Blocks, and fetch Markdown documents.

## Scope

- **Static SPA Serving, Health Endpoint & Optional Bearer Token Guard (`src/server/app.ts`, `src/server/index.ts`, `public/manifest.json`):** Serve compiled Vite assets (`clientDistDir`) and SPA index fallback from Hono when `clientDistDir` is provided (or when `dist/index.html` exists), expose `GET /api/health` and `GET /api/doc/:id/markdown` (returning raw standalone Markdown for a document), bind `0.0.0.0` (configurable via `HOST`) in production, add optional `FOLIO_API_KEY` / `TELEOSIS_API_KEY` bearer token validation middleware when configured, and include a PWA `manifest.json` so `folio.teleosis.ai` can be installed to the macOS Dock.
- **OrbStack Container & Central Caddy Auth Templates (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/caddy/Caddyfile.folio`, `deploy/caddy/docker-compose.tinyauth.yml`):** Provide a production Node 24 container (`Dockerfile` + `docker-compose.yml` joining external `web-routing` network with persistent volume mounts for workspace and `~/.folio/profile.json`), plus the central Caddy `(protected)` snippet (`@browser` `forward_auth tinyauth:3000` + `Authorization: Bearer {$TELEOSIS_API_KEY}` bypass) and `http://folio.teleosis.ai` dynamic upstream block.
- **Cross-Mac Folio Skill & Programmatic Client (`src/skill/folio-client.ts`, `skills/folio/SKILL.md`, `skills/folio/scripts/folio-query.mjs`):** Provide a typed programmatic client (`FolioSkillClient`) and zero-dependency CLI script (`folio-query.mjs`) + `SKILL.md` so any agent or LLM chat session across Macs can fetch the Learner Ability Record (`profile`), search Concept Blocks (`search`), list documents (`docs`), and retrieve standalone Markdown (`doc <id>`) using `FOLIO_URL` (`https://folio.teleosis.ai` or `http://127.0.0.1:4321`) and `TELEOSIS_API_KEY`.

## Done criteria

1. **DC-1** — When `createApp` is configured with `clientDistDir` (and optional `apiKey`), `GET /api/health` returns `{ status: 'ok' }`, `GET /api/doc/:id/markdown` returns the document's raw standalone Markdown and title, non-API routes serve static assets and SPA `index.html` fallback from `clientDistDir`, and when `apiKey` is set on the server, `/api/*` requests (except `/api/health`) require `Authorization: Bearer <apiKey>` unless authenticated via proxy headers.
2. **DC-2** — `Dockerfile` and `docker-compose.yml` define the `folio` container on the external `web-routing` network (port `4321`, `HOST=0.0.0.0`, persistent volume mounts for workspace and profile), and `deploy/caddy/Caddyfile.folio` + `deploy/caddy/docker-compose.tinyauth.yml` (and `/Users/will/projects/caddy/Caddyfile` if writable) define the `(protected)` snippet (`tinyauth` `forward_auth` + `Authorization: Bearer {$TELEOSIS_API_KEY}` bypass) and `http://folio.teleosis.ai` dynamic upstream (`name folio`, `port 4321`, `refresh 10s`).
3. **DC-3** — `FolioSkillClient` (`src/skill/folio-client.ts`), `skills/folio/scripts/folio-query.mjs`, and `skills/folio/SKILL.md` allow any LLM session across Macs to query `getAbilityRecord()`, `searchLibrary(query, mode)`, `listDocuments()`, and `getDocumentMarkdown(docId)` with `Authorization: Bearer <token>` against Folio.

## Not in this phase

- Multi-tenant user accounts, persistent inline chat histories, or code execution kernels.

## Epics

1. `epic-01-spa-server-container-and-caddy.md` — Hono static SPA serving, `GET /api/health` & `GET /api/doc/:id/markdown`, optional bearer auth middleware, PWA manifest, `Dockerfile` + `docker-compose.yml` (`web-routing`), and central Caddy `(protected)` + `http://folio.teleosis.ai` config (covers DC-1, DC-2).
2. `epic-02-cross-mac-folio-skill.md` — `FolioSkillClient` (`src/skill/folio-client.ts`), CLI query runner (`skills/folio/scripts/folio-query.mjs`), and `skills/folio/SKILL.md` for cross-Mac LLM sessions (covers DC-3; depends on Epic 01).

Epics run sequentially (`epic-01` → `epic-02`); Epic 02 consumes the `/api/doc/:id/markdown` and `/api/profile` endpoints with bearer token support added in Epic 01.

## Risks

- **Caddy single-file bind mount inode staleness:** Editing `/Users/will/projects/caddy/Caddyfile` directly does not reload a running container unless `docker cp` + `caddy reload` is run. Mitigation: keep canonical validated templates in `deploy/caddy/` inside the Folio repo and test their structure automatically without running `docker` during automated test runs.
