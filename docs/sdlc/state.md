# SDLC state

Project: folio
Updated: 2026-10-19

## Stack

- Language: TypeScript 7 (Node.js 24 LTS)
- Framework: React 19 + Vite 8 (frontend), Hono 4 on `@hono/node-server` (local backend API)
- LLM: Vercel AI SDK 7 (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`) + Zod 4
- Storage: Local filesystem Markdown (`.md`) with `<!-- folio:block id="<id>" -->` delimiters + `.folio/notebook.json` sidecar
- Tests: Vitest 5 + React Testing Library, run with `npm test`
- Deploy: Local process on `http://127.0.0.1:4321` started via `npm run dev`

## Stages

- concept: approved 2026-10-18
- explore: skipped
- architecture: approved 2026-10-18
- design: approved 2026-10-18
- phases: approved 2026-10-18

## Phases

- [x] 01-tracer-bullet-workbench — done
  - [x] epic-01-markdown-store — merged 2026-10-18
  - [x] epic-02-seed-and-read-ui — merged 2026-10-18
  - [x] epic-03-manual-block-editing — merged 2026-10-18
- [x] 02-inline-chat-integrate — done
  - [x] epic-01-bounded-chat-discard — merged 2026-10-18
  - [x] epic-02-integrate-and-diff-gate — merged 2026-10-18
  - [x] epic-03-diff-gate-ui — merged 2026-10-18
- [x] 03-branching-document-tree — done
  - [x] epic-01-branch-doc-and-ancestor-context — merged 2026-10-18
  - [x] epic-02-tree-navigation-ui — merged 2026-10-18
- [x] 04-byom-pedagogical-controls — done
  - [x] epic-01-byom-settings-and-workspace-api — merged 2026-10-18
  - [x] epic-02-sidebar-controls-and-workspace-ui — merged 2026-10-18
- [x] 05-learner-profile-prerequisites — done
  - [x] epic-01-learner-profile-and-prereq-seed-api — merged 2026-10-18
  - [x] epic-02-prerequisite-chips-ui — merged 2026-10-18
- [ ] 06-library-index-and-search — pending
- [ ] 07-central-ability-record-and-cell-done — pending

## Notes for a fresh session

- Initial exploration notes and red-team findings live in `docs/initial-concept.md`.
- Phase 05 covers the global Learner Profile (`~/.folio/profile.json` across workspaces) and interactive Block 0 Prerequisite Chips (`↳ Seed Prerequisite` + `✓ I know this`).
- Phase 06 covers migrating `.folio/notebook.json` to `.folio/library.sqlite`, the auto-generated `README.md` hierarchical library index for external readers, full-text and semantic search across Concept Blocks, and agent pre-flight deduplication/cross-linking.
- Phase 07 covers the unified central Learner Ability Record (combining self-supplied background, standing learning instructions, and engaged sources/topics) and a non-hiding **Done** check-off status on Concept Blocks.
