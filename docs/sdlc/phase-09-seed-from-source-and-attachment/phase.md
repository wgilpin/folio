# Phase 09 — Seed from Source Material (Paste or File Upload) & Viewable Source Attachment

**Goal:** Extend the unified Seed Topic flow (`POST /api/doc/seed`, empty-state Seed card, and Seed modal) so a document can start by uploading a `.pdf` or `.md` file or pasting raw source text (dirty web copy-paste or copied AI chat transcript) with an optional steering prompt, synthesizing the source into 4–8+ Concept Blocks while persisting the unmodified raw source on disk as a viewable document attachment (superseded in LLM context by subsequent cell chats), and remove the vestigial `Root Folder` switcher from the sidebar (`ISS-6`).

## Scope

- **Source Attachment Schema, SQLite Persistence, Serving Endpoint & Source-Grounded Seed API (`src/shared/schema.ts`, `src/server/db.ts`, `src/server/store.ts`, `src/server/llm.ts`, `src/server/app.ts`):** Add `SourceAttachmentSchema` (`filename`, `mediaType`, `kind`, `byteSize`, `createdAt`) and `SeedSourceInputSchema` to `src/shared/schema.ts`, persist `sourceAttachment` on `DocumentNode` in `.folio/library.sqlite` (`documents.source_attachment_json`) and raw bytes/text on disk under `.folio/attachments/<docId>/<filename>`, serve the unmodified attachment at `GET /api/doc/:id/source` (and `GET /api/doc/source?id=<docId>`), and extend `POST /api/doc/seed` and `seedGenerator` to synthesize `.pdf`, `.md`, or pasted text sources with an optional steering `prompt` while keeping subsequent cell chats strictly bounded to `[N-1, N, N+1]`.
- **Unified Seed UI, Viewable Source Attachment Header Link & Sidebar Cleanup (`src/client/components/SeedModal.tsx`, `src/client/App.tsx`, `src/client/components/SidebarTree.tsx`):** Extend `SeedModal` so the user can attach a `.pdf` or `.md` file or paste multi-line raw text/AI chat as a source attachment alongside an optional steering prompt (or empty prompt), render a clickable `Source: <filename>` link in the active document header pointing to `/api/doc/<docId>/source`, and remove the vestigial `Root Folder` switcher from `SidebarTree.tsx` (`ISS-6`).

## Done criteria

1. **DC-1** — `POST /api/doc/seed` accepts a `source` payload (`.pdf` base64 file, `.md` file, or pasted web/AI-chat text) with an optional steering `prompt` (including an empty `prompt`), passes `source` and `prompt` into `seedGenerator`, synthesizes a 4–8 block document, persists the unmodified raw source under `.folio/attachments/<docId>/<filename>`, and stores `sourceAttachment` metadata on `DocumentNode` in `.folio/library.sqlite`.
2. **DC-2** — `GET /api/doc/:id/source` (and `GET /api/doc/source?id=<docId>`) serves the saved unmodified raw source attachment with its original `Content-Type` (`application/pdf`, `text/markdown`, or `text/plain`) and returns `404` when no attachment exists, while subsequent `POST /api/blocks/:id/chat` and `POST /api/blocks/:id/integrate` calls operate strictly on the bounded Concept Block context (`[N-1, N, N+1]`) without re-injecting the raw source attachment.
3. **DC-3** — In the unified `SeedModal` (both empty-state inline and modal), the user can upload a `.pdf` or `.md` file or paste raw multi-line web/chat text as a source attachment (with or without a steering prompt) to seed a document, and when the seeded document is active, its header renders a clickable `Source: <filename>` link to `/api/doc/<docId>/source` to view the saved attachment.
4. **DC-4** — The vestigial `Root Folder` (`/data/workspace`) text input and `Switch Workspace` button are removed from `SidebarTree.tsx` (`ISS-6`).

## Not in this phase

- Faithful verbatim document chunking/import without LLM synthesis (deferred to a later phase for `.pdf` and `.md` uploads).
- Automatic cleanup or reformatting of the saved raw text attachment.
- Whole-textbook multi-document splitting.
- Re-injecting the raw attachment into subsequent `Ask Cell` / `Integrate` bounded contexts.

## Epics

1. `epic-01-source-seed-and-attachment-api.md` — `SourceAttachment` & `SeedSourceInput` schemas, SQLite `source_attachment_json` column, `.folio/attachments/<docId>/<filename>` storage & cleanup, `GET /api/doc/:id/source` endpoint, and source-grounded `POST /api/doc/seed` + `seedGenerator` while preserving bounded `[N-1, N, N+1]` cell chats (covers DC-1, DC-2).
2. `epic-02-unified-seed-ui-and-sidebar-cleanup.md` — Unified `SeedModal` with `.pdf`/`.md` upload and pasted-source attachment chip + optional steering prompt, active document header `Source: <filename>` link, and removal of the vestigial `Root Folder` switcher in `SidebarTree.tsx` (covers DC-3, DC-4; depends on Epic 01).

Epics run sequentially (`epic-01` → `epic-02`); Epic 02 consumes the `source` seed payload, `sourceAttachment` document metadata, and `/api/doc/:id/source` route introduced in Epic 01.

## Risks

- **Large paste vs. short topic typing in unified input:** Pasting a multi-paragraph web article or AI chat directly into the topic input should smoothly convert into a pasted-source attachment chip (or can be entered via a "Paste source text" control) without breaking single-line topic typing. Mitigation: auto-promote multi-line pastes in `#seed-topic-input` (and provide an explicit paste/attach control) so single-line topic prompts work identically to existing tests while multi-line pastes become a source attachment.
