# SDLC state

Project: folio
Updated: 2026-10-18

## Stack

- Language: TypeScript 7 (Node.js 24 LTS)
- Framework: React 19 + Vite 8 (frontend), Hono 4 on `@hono/node-server` (local backend API)
- LLM: Vercel AI SDK 7 (`ai` + `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`) + Zod 4
- Storage: Local filesystem Markdown (`.md`) with `<!-- folio:block id="<id>" -->` delimiters + `.folio/notebook.json` sidecar
- Tests: Vitest 5 + React Testing Library, run with `npm test`
- Deploy: Local process on `http://localhost:3000` started via `npm run dev`

## Stages

- concept: approved 2026-10-18
- explore: skipped
- architecture: approved 2026-10-18
- design: approved 2026-10-18
- phases: approved 2026-10-18

## Phases

- [ ] 01-tracer-bullet-workbench — in progress
  - [x] epic-01-markdown-store — merged 2026-10-18
  - [x] epic-02-seed-and-read-ui — merged 2026-10-18
  - [x] epic-03-manual-block-editing — reviewed 2026-10-18
- [ ] 02-inline-chat-integrate — pending
- [ ] 03-branching-document-tree — pending
- [ ] 04-byom-pedagogical-controls — pending

## Notes for a fresh session

- Initial exploration notes and red-team findings live in `docs/initial-concept.md`.
