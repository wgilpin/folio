# Epic 01 — Source-Grounded Seed API, On-Disk Attachment Storage & Viewable Source Route

**Phase:** 09 Seed from Source Material (Paste or File Upload) & Viewable Source Attachment
**Goal:** Extend `POST /api/doc/seed`, `WorkspaceStore`, `.folio/library.sqlite`, and `SeedGenerator` to accept uploaded `.pdf` / `.md` files or pasted raw text with an optional steering prompt, persist the unmodified raw source under `.folio/attachments/<docId>/<filename>`, expose `GET /api/doc/:id/source` to view it, and keep subsequent cell chats bounded strictly to `[N-1, N, N+1]`.
**Done criteria covered:** DC-1, DC-2

## Behaviour

1. **Shared Schemas (`src/shared/schema.ts`):**
   - `SourceAttachmentKindSchema = z.enum(['pdf', 'markdown', 'paste'])`
   - `SourceAttachmentMediaTypeSchema = z.enum(['application/pdf', 'text/markdown', 'text/plain'])`
   - `SourceAttachmentSchema = z.object({ filename: z.string(), mediaType: SourceAttachmentMediaTypeSchema, kind: SourceAttachmentKindSchema, byteSize: z.number().int().nonnegative(), createdAt: z.string() })`
   - `SeedSourceInputSchema = z.object({ filename: z.string().trim().min(1), mediaType: SourceAttachmentMediaTypeSchema, kind: SourceAttachmentKindSchema.optional(), content: z.string().min(1), encoding: z.enum(['utf-8', 'base64']).default('utf-8') })`
   - `DocumentNodeSchema` includes optional `sourceAttachment: SourceAttachmentSchema.optional()`.
2. **SQLite & On-Disk Attachment Persistence (`src/server/db.ts`, `src/server/store.ts`):**
   - `initializeSchema` in `src/server/db.ts` adds `source_attachment_json TEXT` to `documents` (with `ALTER TABLE documents ADD COLUMN source_attachment_json TEXT` migration for existing databases), and `writeStateToSqlite` / `readStateFromSqlite` serialize and deserialize `doc.sourceAttachment`.
   - `WorkspaceStore.seedRootDocument(seedResult, sourceInput?)` writes the unmodified raw source to `.folio/attachments/<docId>/<safeFilename>` (decoding base64 to `Buffer` when `encoding === 'base64'`, or writing UTF-8 text otherwise), records `sourceAttachment` metadata (`filename`, `mediaType`, `kind`, `byteSize`, `createdAt`) on the saved `DocumentNode`, and removes `.folio/attachments/<docId>` when `deleteDocument(docId)` deletes a document.
   - `WorkspaceStore.readSourceAttachment(docId)` resolves `docId`, checks `doc.sourceAttachment`, and reads the raw `Buffer` and metadata from `.folio/attachments/<docId>/<filename>` (returning `null` if the document or attachment does not exist).
3. **Seed Route, Source Serving Route & LLM Prompting (`src/server/app.ts`, `src/server/llm.ts`):**
   - `POST /api/doc/seed` accepts `{ prompt?: string, source?: SeedSourceInput }`. If neither a non-empty `prompt` nor a valid `source` is provided, it returns `400 { error: 'Topic prompt or source material is required' }`.
   - When `source` is provided without `prompt` (or with a steering `prompt`), `POST /api/doc/seed` does not short-circuit to an existing document via `findExistingRootOrLibraryDocumentByPrompt`; it queries `findRelatedLibraryDocs` using `prompt || source.filename`, invokes `seedGenerator(prompt ?? '', { ..., source })`, and saves the resulting document + raw attachment via `store.seedRootDocument(seedResult, source)`.
   - `SeedGeneratorOptions` in `src/server/llm.ts` includes `source?: SeedSourceInput`. When `options?.source` is provided, `defaultSeedGenerator` instructs the model to distill and synthesize the provided source material into 4–8 Concept Blocks (handling dirty web pastes, linear AI chat transcripts, Markdown files, or PDF documents), guided by the optional steering `prompt` (or inferring the topic and title from the source when `prompt` is empty).
   - `GET /api/doc/:id/source` and `GET /api/doc/source?id=<docId>` return the raw attachment bytes/text with `Content-Type: <mediaType>` and `Content-Disposition: inline; filename="<filename>"`, or `404` if not found.
   - Subsequent `POST /api/blocks/:id/chat` and `POST /api/blocks/:id/integrate` calls continue to build context via `buildBoundedCellContext` (`[N-1, N, N+1]` + Ancestor ToC) without injecting the raw source attachment content.

## Acceptance criteria

- **AC-1** — Given a `POST /api/doc/seed` request with a `source` object (pasted dirty web/chat text, `.md` UTF-8 text, or `.pdf` base64 content) and either an optional steering `prompt` or an empty `prompt`, when the endpoint runs, it calls `seedGenerator` with the `prompt` and `options.source`, creates the document `.md` and `.folio/attachments/<docId>/<filename>` on disk, and persists `document.sourceAttachment` in `.folio/library.sqlite` across reloads.
- **AC-2** — Given a document seeded with a `source` attachment (`application/pdf`, `text/markdown`, or `text/plain`), when `GET /api/doc/:id/source` (or `GET /api/doc/source?id=<docId>`) is requested, it returns `200` with the exact unmodified bytes/text and matching `Content-Type` header (and returns `404` for a document without an attachment); and when `POST /api/blocks/:id/chat` is called on a block of that document, `cellChatGenerator` receives only the bounded `[N-1, N, N+1]` context and not the raw source attachment text.

## Tests

- `src/server/__tests__/source-seed-api.test.ts` — `POST /api/doc/seed synthesizes from pasted text, Markdown, or PDF source with optional prompt and persists sourceAttachment in SQLite and .folio/attachments` (covers AC-1).
- `src/server/__tests__/source-seed-api.test.ts` — `GET /api/doc/:id/source serves raw attachment bytes/text with original Content-Type and subsequent cell chats exclude raw source attachment from bounded context` (covers AC-2).

## Files

- `src/shared/schema.ts`
- `src/server/db.ts`
- `src/server/store.ts`
- `src/server/llm.ts`
- `src/server/app.ts`
- `src/server/__tests__/source-seed-api.test.ts` (new)

## Out of scope

- Client UI changes to `SeedModal.tsx`, `App.tsx`, and `SidebarTree.tsx` — covered in Epic 02.

## Build note — 2026-10-28

- **Tasks completed:**
  - Added `SourceAttachmentKindSchema`, `SourceAttachmentMediaTypeSchema`, `SourceAttachmentSchema`, `SeedSourceInputSchema`, and optional `sourceAttachment` on `DocumentNodeSchema` in `src/shared/schema.ts`.
  - Extended `initializeSchema`, `writeStateToSqlite`, and `readStateFromSqlite` in `src/server/db.ts` to persist `source_attachment_json` on `documents` with an `ALTER TABLE` migration for existing databases.
  - Updated `WorkspaceStore.seedRootDocument`, `WorkspaceStore.saveDocument`, `WorkspaceStore.readSourceAttachment`, and `WorkspaceStore.deleteDocument` in `src/server/store.ts` to write unmodified raw source material under `.folio/attachments/<docId>/<safeFilename>`, preserve `sourceAttachment` across block edits, and clean up `.folio/attachments/<docId>` on document deletion.
  - Extended `SeedGeneratorOptions` and `defaultSeedGenerator` in `src/server/llm.ts` to accept `source?: SeedSourceInput` (handling base64 PDF file inputs and UTF-8 Markdown/paste text with optional steering prompts).
  - Updated `POST /api/doc/seed` and added `GET /api/doc/:id/source` + `GET /api/doc/source` in `src/server/app.ts` to synthesize from source material and serve raw source attachments with original `Content-Type` headers while keeping cell chats bounded strictly to `[N-1, N, N+1]`.
- **Tests added:**
  - `src/server/__tests__/source-seed-api.test.ts` (2 tests covering AC-1 and AC-2)
- **Suite result:** 27 test files passed (86 tests total).
- **Deviations from plan:** None.

## Review — 2026-10-28

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/server/__tests__/source-seed-api.test.ts` — `POST /api/doc/seed synthesizes from pasted text, Markdown, or PDF source with optional prompt and persists sourceAttachment in SQLite and .folio/attachments` | |
| AC-2 | yes | `src/server/__tests__/source-seed-api.test.ts` — `GET /api/doc/:id/source serves raw attachment bytes/text with original Content-Type and subsequent cell chats exclude raw source attachment from bounded context` | |

### Drift

None

### Findings

None
