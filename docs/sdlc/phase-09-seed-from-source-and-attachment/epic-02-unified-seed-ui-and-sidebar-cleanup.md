# Epic 02 — Unified Seed from Source UI, Viewable Source Header Link & Sidebar Root Folder Removal

**Phase:** 09 Seed from Source Material (Paste or File Upload) & Viewable Source Attachment
**Goal:** Update `SeedModal` and `App` so users can upload `.pdf`/`.md` files or paste raw web/AI-chat text as a source attachment (with or without a steering prompt), display a clickable `Source: <filename>` link in the active document header, and remove the vestigial `Root Folder` switcher from `SidebarTree` (`ISS-6`).
**Done criteria covered:** DC-3, DC-4

## Behaviour

1. **Unified `SeedModal` (`src/client/components/SeedModal.tsx`, `src/client/App.tsx`):**
   - `onSeed` accepts `(prompt: string, source?: SeedSourceInput) => Promise<void>`, and `App.handleSeed` sends `{ prompt, ...(source ? { source } : {}) }` to `POST /api/doc/seed`.
   - `SeedModal` provides:
     - A hidden or styled file input (`aria-label="Upload source file"`, `accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"`) triggered by an `Attach .pdf or .md` button (plus drag-and-drop on the form card), reading `.pdf` files as `base64` (`mediaType: 'application/pdf'`, `kind: 'pdf'`) and `.md`/`.txt` files as `utf-8` (`mediaType: 'text/markdown'` or `'text/plain'`, `kind: 'markdown'`).
     - Automatic promotion of multi-line pastes in `#seed-topic-input` (when the pasted text contains a newline `\n` and is at least 80 characters, or via a `Paste text / chat` button/textarea) into a `pasted-source.txt` attachment (`mediaType: 'text/plain'`, `kind: 'paste'`, `encoding: 'utf-8'`), leaving `#seed-topic-input` free for an optional steering prompt.
     - When a source attachment is present, renders a source attachment badge (`data-testid="seed-source-attachment"`) showing the filename and a `Remove source` button (`aria-label="Remove source attachment"`), updates the input placeholder to `"Optional steering prompt (e.g., Focus on section 3)..."`, and enables the submit button even when `prompt` is empty.
2. **Active Document Header Source Link (`src/client/App.tsx`):**
   - When `document.sourceAttachment` is defined, renders an anchor link (`data-testid="document-source-link"`, `href="/api/doc/${encodeURIComponent(document.id)}/source"`, `target="_blank"`, `rel="noopener noreferrer"`) labeled `Source: ${document.sourceAttachment.filename}` in the document header bar next to the filename and completion badge.
3. **Remove Vestigial `Root Folder` Switcher (`src/client/components/SidebarTree.tsx`, `ISS-6`):**
   - Removes the `Root Folder` section (`Workspace directory path` input and `Switch Workspace` button) from `SidebarTree.tsx`.
   - Updates `src/client/__tests__/SidebarControls.test.tsx` to verify that `Root Folder` / `Workspace directory path` / `Switch workspace` are no longer rendered in `SidebarTree`.

## Acceptance criteria

- **AC-1** — Given the unified `SeedModal`, when the user selects a `.md` or `.pdf` file via `Upload source file` (or pastes multi-line source text / AI chat transcript) and submits with either an optional steering prompt or an empty prompt, `POST /api/doc/seed` is called with `{ prompt, source }`, and when the seeded document loads with `document.sourceAttachment`, the document header displays a link `Source: <filename>` pointing to `/api/doc/<docId>/source`.
- **AC-2** — Given `SidebarTree` rendered in `App`, when inspected, the `Search Library`, `Document Tree`, `Current Doc ToC`, `Active Model`, `Reasoning Effort`, `Pedagogical Profile`, and `Learner Ability Record` controls are present, and the vestigial `Root Folder` section (`Workspace directory path` input and `Switch workspace` button) is absent (`ISS-6`).

## Tests

- `src/client/__tests__/SeedFromSource.test.tsx` — `seeds a document from an uploaded file or pasted source text with optional steering prompt and renders viewable Source attachment link in document header` (covers AC-1).
- `src/client/__tests__/SidebarControls.test.tsx` — `does not render the vestigial Root Folder input or Switch Workspace button in SidebarTree` (covers AC-2).

## Files

- `src/client/components/SeedModal.tsx`
- `src/client/App.tsx`
- `src/client/components/SidebarTree.tsx`
- `src/client/__tests__/SeedFromSource.test.tsx` (new)
- `src/client/__tests__/SidebarControls.test.tsx`

## Out of scope

- Faithful verbatim document chunking/reader mode without LLM synthesis.
- Cleaning up or editing the saved raw attachment inside Folio.

## Build note — 2026-10-28

- **Tasks done:**
  - Updated `SeedModal` (`src/client/components/SeedModal.tsx`) to accept `onSeed: (prompt: string, source?: SeedSourceInput) => Promise<void>`, added file upload (`aria-label="Upload source file"`, `Attach .pdf or .md` button, and drag-and-drop support) reading `.pdf` as `base64` (`application/pdf`, `kind: 'pdf'`) and `.md`/`.txt` as `utf-8` (`text/markdown` or `text/plain`, `kind: 'markdown'`), added multi-line paste auto-promotion on `#seed-topic-input` (`pasted-source.txt`, `text/plain`, `kind: 'paste'`), rendered the source attachment pill (`data-testid="seed-source-attachment"`) with `Remove source` (`aria-label="Remove source attachment"`), and enabled submitting with or without a steering prompt when `source` is attached.
  - Updated `App` (`src/client/App.tsx`) so `handleSeed` forwards `{ prompt, ...(source ? { source } : {}) }` to `POST /api/doc/seed` and the active document header renders `<a data-testid="document-source-link" href="/api/doc/<docId>/source" target="_blank" rel="noopener noreferrer">Source: <filename></a>` whenever `document.sourceAttachment` is present.
  - Removed the vestigial `Root Folder` section (`Workspace directory path` input and `Switch Workspace` button) from `SidebarTree` (`src/client/components/SidebarTree.tsx`) and marked `ISS-6` as `fixed 2026-10-28` in `docs/sdlc/issues.md`.
- **Tests added / updated:**
  - `src/client/__tests__/SeedFromSource.test.tsx` (2 tests covering AC-1: multi-line chat paste promotion, PDF file upload with steering prompt, Markdown file upload with empty steering prompt, and `Source: <filename>` header link rendering)
  - `src/client/__tests__/SidebarControls.test.tsx` (updated test covering AC-2: verifies `Root Folder` / `Workspace directory path` / `Switch workspace` are absent while all core sidebar controls remain present)
- **Suite result:** 28 test files passed, 88 tests passed (`npm test -- --run`).
- **Deviations from plan:** None.

## Review — 2026-10-28

**Verdict:** pass

| Criterion | Met | Test | Notes |
|---|---|---|---|
| AC-1 | yes | `src/client/__tests__/SeedFromSource.test.tsx` — `seeds a document from an uploaded file or pasted source text with optional steering prompt and renders viewable Source attachment link in document header` | |
| AC-2 | yes | `src/client/__tests__/SidebarControls.test.tsx` — `does not render the vestigial Root Folder input or Switch Workspace button in SidebarTree` | |

### Drift

None

### Findings

None

