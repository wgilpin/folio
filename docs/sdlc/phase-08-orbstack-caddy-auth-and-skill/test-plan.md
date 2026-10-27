# Test plan — Phase 08 OrbStack Deployment (`folio.teleosis.ai`), Central Caddy Auth & Cross-Mac Folio Skill

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/production-spa-and-deploy.test.ts` — `serves compiled SPA assets, GET /api/health, GET /api/doc/:id/markdown, and enforces optional bearer token auth` | automated |
| DC-2 | `src/server/__tests__/production-spa-and-deploy.test.ts` — `validates OrbStack Dockerfile, docker-compose.yml web-routing config, and Caddy tinyauth + bearer bypass config` | automated |
| DC-3 | `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

No gaps.

## How to run

`npm test`

## Test data

- Temporary workspace directories (`os.tmpdir()`), temporary `clientDistDir` containing a fixture `index.html` and `manifest.json`, and seeded Markdown documents.
- In-process `app.fetch` harness wired into `FolioSkillClient` with `Authorization: Bearer test-teleosis-key`.
