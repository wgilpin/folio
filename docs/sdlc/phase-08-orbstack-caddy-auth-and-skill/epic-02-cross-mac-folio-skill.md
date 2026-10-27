# Epic 02 — Cross-Mac Folio Skill & Programmatic Client (`FolioSkillClient` + `skills/folio/SKILL.md`)

**Phase:** 08 OrbStack Deployment (`folio.teleosis.ai`), Central Caddy Auth & Cross-Mac Folio Skill
**Goal:** Provide a typed `FolioSkillClient`, a zero-dependency CLI script (`skills/folio/scripts/folio-query.mjs`), and an agent skill (`skills/folio/SKILL.md`) so any LLM chat session across Macs can query the Learner Ability Record, search Concept Blocks, list documents, and read standalone Markdown from `folio.teleosis.ai`.
**Done criteria covered:** DC-3

## Behaviour

`FolioSkillClient` (`src/skill/folio-client.ts`) connects to a Folio instance (`baseUrl`, defaulting to `process.env.FOLIO_URL ?? 'https://folio.teleosis.ai'`, and `apiKey`, defaulting to `process.env.TELEOSIS_API_KEY ?? process.env.FOLIO_API_KEY`) and sends `Authorization: Bearer <apiKey>` on every request. It provides:
1. `getAbilityRecord()`: fetches `GET /api/profile` and returns the unified `LearnerProfile` (`background`, `learningInstructions`, `topics`, `engagedSources`) plus a formatted markdown summary via `formatAbilityRecordSummary(profile)`.
2. `searchLibrary(query, mode = 'hybrid', limit = 10)`: fetches `GET /api/search?q=...&mode=...&limit=...` and returns matching Concept Blocks across the library.
3. `listDocuments()`: fetches `GET /api/doc` and returns the full document tree (`documents`, active `document`, `workspaceDir`).
4. `getDocumentMarkdown(docId, options = { clean: true })`: fetches `GET /api/doc/:id/markdown?clean=true` and returns `{ docId, title, filename, markdown, doneCount, totalBlocks }`.

`skills/folio/SKILL.md` documents the Folio Skill with YAML frontmatter (`name: folio`, `description: ...`) and step-by-step instructions and `curl` / `node skills/folio/scripts/folio-query.mjs` commands so any Claude Code, Antigravity, or CLI agent session on any Mac can calibrate itself to the user's Learner Ability Record and search or read their Folio reference library.

## Acceptance criteria

- **AC-1** — Given a running Folio Hono app protected with `apiKey: 'teleosis-secret'` and a seeded library containing a Learner Ability Record (`background`, `learningInstructions`, `topics`, `engagedSources`) and Concept Blocks, when `FolioSkillClient` is initialized with `apiKey: 'teleosis-secret'`, then `getAbilityRecord()`, `searchLibrary('Hamiltonian')`, `listDocuments()`, and `getDocumentMarkdown('hamiltonian-mechanics', { clean: true })` all succeed and return the expected profile, search hits, document list, and clean standalone Markdown (stripped of `<!-- folio:block -->` comments).
- **AC-2** — Given `skills/folio/SKILL.md` and `skills/folio/scripts/folio-query.mjs`, when inspected and invoked in tests, `SKILL.md` contains valid frontmatter (`name: folio`, `description`) and documents `FOLIO_URL` (`https://folio.teleosis.ai`) + `TELEOSIS_API_KEY` usage for reading the Learner Ability Record, searching Concept Blocks, and fetching document Markdown.

## Tests

- `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md` (covers AC-1, AC-2).

## Files

- `src/skill/folio-client.ts` (new)
- `skills/folio/SKILL.md` (new)
- `skills/folio/scripts/folio-query.mjs` (new)
- `src/server/__tests__/folio-skill.test.ts` (new)

## Out of scope

- Mutating Concept Blocks from external read-only skill queries unless explicitly calling Folio's existing REST API.

## Build note — 2026-10-27

### Tasks done

- Implemented `FolioSkillClient` and `formatAbilityRecordSummary` in `src/skill/folio-client.ts` supporting `getAbilityRecord()`, `searchLibrary()`, `listDocuments()`, and `getDocumentMarkdown()` with `Authorization: Bearer <apiKey>` and configurable `baseUrl` (`https://folio.teleosis.ai` default).
- Added zero-dependency Node ESM CLI helper `skills/folio/scripts/folio-query.mjs` (`profile`, `search`, `docs`, `doc <docId>`).
- Created cross-Mac agent skill `skills/folio/SKILL.md` with YAML frontmatter (`name: folio`, `description`) and CLI / `curl` reference for `folio.teleosis.ai` and `$TELEOSIS_API_KEY`.
- Added automated integration test in `src/server/__tests__/folio-skill.test.ts` covering AC-1 and AC-2.

### Tests added

- `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md`

### Suite result

- `npm test`: `Test Files  26 passed (26)`, `Tests  84 passed (84)`
- `npm run typecheck`: `tsc --noEmit` (0 errors)

### Deviations from the plan

- None.

### Follow-ups

- None.


## Build note — 2026-10-27

- **Tasks done:**
  - Created `src/skill/folio-client.ts` exporting `FolioSkillClient` and `formatAbilityRecordSummary` (`getAbilityRecord`, `searchLibrary`, `listDocuments`, `getDocumentMarkdown`) with `Authorization: Bearer <apiKey>` authentication.
  - Created `skills/folio/scripts/folio-query.mjs` zero-dependency CLI helper (`profile`, `search`, `docs`, `doc <docId>`).
  - Created `skills/folio/SKILL.md` documenting cross-Mac Folio Skill usage (`FOLIO_URL`, `TELEOSIS_API_KEY`, CLI and `curl` commands).
- **Tests added:**
  - `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md`.
- **Suite result:** 26 test files passed (84 tests total), `npm run typecheck` passed with 0 errors.
- **Deviations from plan:** None.

## Review — 2026-10-27

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md` | |
| AC-2 | yes | `src/server/__tests__/folio-skill.test.ts` — `queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md` | |

### Drift

None

### Findings

None
