# SDLC state

Project: folio
Updated: 2026-10-18

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
- [ ] 03-branching-document-tree — in progress
  - [ ] epic-01-branch-doc-and-ancestor-context — reviewed — pass 2026-10-18
  - [ ] epic-02-tree-navigation-ui — pending
- [ ] 04-byom-pedagogical-controls — pending
- [ ] 05-learner-profile-prerequisites — pending

## Notes for a fresh session

- Initial exploration notes and red-team findings live in `docs/initial-concept.md`.
- Phase 05 covers the global Learner Profile (`~/.folio/profile.json` across workspaces) and interactive Block 0 Prerequisite Chips (`↳ Seed Prerequisite` + `✓ I know this`).
