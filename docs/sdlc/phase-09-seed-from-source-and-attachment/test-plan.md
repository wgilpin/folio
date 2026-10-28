# Test plan — Phase 09 Seed from Source Material (Paste or File Upload) & Viewable Source Attachment

## Coverage

| Done criterion | Proved by | Kind |
|---|---|---|
| DC-1 | `src/server/__tests__/source-seed-api.test.ts` — `POST /api/doc/seed synthesizes from pasted text, Markdown, or PDF source with optional prompt and persists sourceAttachment in SQLite and .folio/attachments` | automated |
| DC-2 | `src/server/__tests__/source-seed-api.test.ts` — `GET /api/doc/:id/source serves raw attachment bytes/text with original Content-Type and subsequent cell chats exclude raw source attachment from bounded context` | automated |
| DC-3 | `src/client/__tests__/SeedFromSource.test.tsx` — `seeds a document from an uploaded file or pasted source text with optional steering prompt and renders viewable Source attachment link in document header` | automated |
| DC-4 | `src/client/__tests__/SidebarControls.test.tsx` — `does not render the vestigial Root Folder input or Switch Workspace button in SidebarTree` | automated |

Every done criterion has a row. A criterion with no row is a gap.

## Gaps

No gaps.

## How to run

`npm test`

## Test data

- Temporary workspace directories (`os.tmpdir()`) with sample dirty web pastes, copied AI chat transcripts, Markdown files, and base64-encoded PDF payloads.
- JSDOM + React Testing Library tests exercising file selection (`fireEvent.change` on file input), multi-line paste (`fireEvent.paste`), form submission with and without a steering prompt, and active document header attachment link rendering.
