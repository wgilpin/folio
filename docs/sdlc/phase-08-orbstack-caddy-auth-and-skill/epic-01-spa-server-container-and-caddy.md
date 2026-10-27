# Epic 01 — Production SPA Server, Raw Markdown Endpoint, OrbStack Container & Caddy Auth Config

**Phase:** 08 OrbStack Deployment (`folio.teleosis.ai`), Central Caddy Auth & Cross-Mac Folio Skill
**Goal:** Serve compiled Vite SPA assets and `/api/*` from a single Hono server, add `GET /api/health`, `GET /api/doc/:id/markdown`, and optional Bearer token authentication, and ship the OrbStack `Dockerfile`, `docker-compose.yml`, and Caddy `tinyauth` + Bearer bypass configuration.
**Done criteria covered:** DC-1, DC-2

## Behaviour

`createApp` accepts optional `clientDistDir?: string` and `apiKey?: string`.
- `GET /api/health` returns `200` `{ status: 'ok' }` (always public for container healthchecks).
- When `apiKey` (or `process.env.FOLIO_API_KEY`) is non-empty, `/api/*` requests (except `/api/health`) check `Authorization: Bearer <apiKey>` or a trusted proxy header (`Remote-User` from `tinyauth`), returning `401 { error: 'Unauthorized' }` if neither matches. When `apiKey` is unset, local requests remain open as before.
- `GET /api/doc/:id/markdown` (and `GET /api/doc/markdown?id=<docId>`) returns `200` `{ docId, title, filename, markdown, blocks, doneCount, totalBlocks }` where `markdown` is the clean standalone Markdown (without `<!-- folio:block -->` HTML comments when `?clean=true`, or the raw on-disk `.md` file by default).
- When `clientDistDir` is configured, non-`/api/*` `GET` requests serve static files from `clientDistDir` (with appropriate `Content-Type` for `.html`, `.js`, `.css`, `.json`, `.svg`, `.png`, `.ico`) and fall back to `index.html` for SPA client routing.
- `src/server/index.ts` binds to `process.env.HOST ?? '127.0.0.1'` (`0.0.0.0` in Docker), auto-detects `dist/` when present, and passes `apiKey: process.env.FOLIO_API_KEY`.
- `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `public/manifest.json`, `deploy/caddy/Caddyfile.folio`, and `deploy/caddy/docker-compose.tinyauth.yml` configure the `folio` container on `web-routing` (port `4321`) and the central Caddy `(protected)` snippet (`tinyauth` `forward_auth` + `Authorization: Bearer {$TELEOSIS_API_KEY}` bypass) + `http://folio.teleosis.ai` block.

## Acceptance criteria

- **AC-1** — Given `createApp({ workspaceDir, clientDistDir, apiKey: 'secret-token' })` with a seeded document `hamiltonian-mechanics`, when `GET /api/health` is called without a token it returns `200 { status: 'ok' }`; when `GET /api/doc/hamiltonian-mechanics/markdown` is called without auth it returns `401`; when called with `Authorization: Bearer secret-token` (or `Remote-User: will`) it returns `200` with the document's `title`, `filename`, and standalone `markdown`; and when `GET /` or `GET /manifest.json` is called it serves the SPA `index.html` and PWA `manifest.json` from `clientDistDir`.
- **AC-2** — Given the repository's deployment files (`Dockerfile`, `docker-compose.yml`, `deploy/caddy/Caddyfile.folio`, `deploy/caddy/docker-compose.tinyauth.yml`), when inspected by the test suite, `docker-compose.yml` defines service `folio` on external network `web-routing` with port `4321` and persistent volume mounts, and `deploy/caddy/Caddyfile.folio` defines the `(protected)` snippet (`forward_auth` to `tinyauth:3000` with `Authorization` `Bearer {$TELEOSIS_API_KEY}` bypass) and `http://folio.teleosis.ai` with `dynamic a { name folio; port 4321; refresh 10s }`.

## Tests

- `src/server/__tests__/production-spa-and-deploy.test.ts` — `serves compiled SPA assets, GET /api/health, GET /api/doc/:id/markdown, and enforces optional bearer token auth` (covers AC-1).
- `src/server/__tests__/production-spa-and-deploy.test.ts` — `validates OrbStack Dockerfile, docker-compose.yml web-routing config, and Caddy tinyauth + bearer bypass config` (covers AC-2).

## Files

- `src/server/app.ts`
- `src/server/index.ts`
- `index.html`
- `public/manifest.json` (new)
- `Dockerfile` (new)
- `docker-compose.yml` (new)
- `.dockerignore` (new)
- `deploy/caddy/Caddyfile.folio` (new)
- `deploy/caddy/docker-compose.tinyauth.yml` (new)
- `src/server/__tests__/production-spa-and-deploy.test.ts` (new)

## Out of scope

- Running `docker compose up` or `docker exec proxy caddy reload` during the automated test suite.
- The Cross-Mac Folio Skill and client library — covered in Epic 02.

## Build note — 2026-10-27

### Tasks done
- Extended `CreateAppOptions` in `src/server/app.ts` with `clientDistDir?: string` and `apiKey?: string`.
- Added public `GET /api/health` returning `200 { status: 'ok' }` and optional Bearer token / `Remote-User` proxy header authentication middleware on `/api/*`.
- Added `GET /api/doc/:id/markdown` and `GET /api/doc/markdown?id=<docId>` returning raw or clean (`?clean=true`) standalone Markdown along with block metadata and `doneCount` / `totalBlocks`.
- Added production SPA static asset serving and `index.html` client-routing fallback when `clientDistDir` is configured, and updated `src/server/index.ts` to bind `process.env.HOST ?? '127.0.0.1'` and auto-detect `dist/index.html`.
- Added PWA manifest `public/manifest.json` and linked it in `index.html`.
- Created OrbStack deployment & central Caddy auth files: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `deploy/caddy/Caddyfile.folio`, and `deploy/caddy/docker-compose.tinyauth.yml`.

### Tests added
- `src/server/__tests__/production-spa-and-deploy.test.ts` — `serves compiled SPA assets, GET /api/health, GET /api/doc/:id/markdown, and enforces optional bearer token auth`
- `src/server/__tests__/production-spa-and-deploy.test.ts` — `validates OrbStack Dockerfile, docker-compose.yml web-routing config, and Caddy tinyauth + bearer bypass config`

### Suite result
- `npm test`: `Test Files 25 passed (25) | Tests 83 passed (83)`
- `npm run typecheck`: `tsc --noEmit` (0 errors)

### Deviations from the plan
- None.

### Follow-ups deferred
- Cross-Mac Folio Skill (`FolioSkillClient`, CLI, and `SKILL.md`) — covered in Epic 02.

## Review — 2026-10-27

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/server/__tests__/production-spa-and-deploy.test.ts` — `serves compiled SPA assets, GET /api/health, GET /api/doc/:id/markdown, and enforces optional bearer token auth` | |
| AC-2 | yes | `src/server/__tests__/production-spa-and-deploy.test.ts` — `validates OrbStack Dockerfile, docker-compose.yml web-routing config, and Caddy tinyauth + bearer bypass config` | |

### Drift

None

### Findings

None
