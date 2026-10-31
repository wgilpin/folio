# SDLC state

Project: folio
Updated: 2026-10-31

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
- phases: approved 2026-10-31

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
- [x] 06-library-index-and-search — done
  - [x] epic-01-sqlite-store-and-readme — merged 2026-10-27
  - [x] epic-02-full-text-and-semantic-search — merged 2026-10-27
  - [x] epic-03-agent-topic-deduplication — merged 2026-10-27
- [x] 07-central-ability-record-and-cell-done — done
  - [x] epic-01-ability-record-and-done-api — merged 2026-10-27
  - [x] epic-02-ability-record-and-done-ui — merged 2026-10-27
- [x] 08-orbstack-caddy-auth-and-skill — done
  - [x] epic-01-spa-server-container-and-caddy — merged 2026-10-27
  - [x] epic-02-cross-mac-folio-skill — merged 2026-10-27
- [x] 09-seed-from-source-and-attachment — done
  - [x] epic-01-source-seed-and-attachment-api — merged 2026-10-28
  - [x] epic-02-unified-seed-ui-and-sidebar-cleanup — merged 2026-10-28
- [x] 10-adversarial-review — done
  - [x] epic-01-adversarial-review-api — merged 2026-10-31
  - [x] epic-02-adversarial-review-ui — merged 2026-10-31

## Notes for a fresh session

- Initial exploration notes and red-team findings live in `docs/initial-concept.md`.
- Phase 05 covers the global Learner Profile (`~/.folio/profile.json` across workspaces) and interactive Block 0 Prerequisite Chips (`↳ Seed Prerequisite` + `✓ I know this`).
- Phase 06 covers migrating `.folio/notebook.json` to `.folio/library.sqlite`, the auto-generated `README.md` hierarchical library index for external readers, full-text and semantic search across Concept Blocks, and agent pre-flight deduplication/cross-linking.
- Phase 07 covers the unified central Learner Ability Record (combining self-supplied background, standing learning instructions, and engaged sources/topics) and a non-hiding **Done** check-off status on Concept Blocks.
- Phase 08 covers deploying Folio as an always-on OrbStack container (`folio.teleosis.ai` on `web-routing`) behind central Caddy `forward_auth` (`tinyauth` browser SSO + `Authorization: Bearer $TELEOSIS_API_KEY` programmatic bypass in `/Users/will/projects/caddy`) and shipping a cross-Mac Folio Skill for external LLM chat sessions.
- Phase 09 covers unified seeding from an uploaded file (`.pdf` or `.md`) or pasted text/AI chat transcript (with or without a steering prompt), raw source attachment persistence under `.folio/attachments/<docId>/<filename>` and `GET /api/doc/:id/source`, and removing the vestigial Root Folder switcher (`ISS-6`).
- Phase 10 covers falsification-first Adversarial Review: an `adversarial-review` pedagogical/synthesis profile plus one-click **Adversarial Review** triggers on full notebooks (Concept Blocks + `sourceAttachment` when present) and individual cells (`[N-1, N, N+1]`) that open an ephemeral chat thread with severity-ranked findings (*Serious / Fatal Gaps*, *Moderate Gaps*, *Small Number / Arithmetic Errors*, and *Result & Open Risks*) ready to debate, **Integrate**, **Branch Doc**, or **Discard**.
