# 0001 — Markdown Block Delimiters and Sidecar State

**Status:** accepted
**Date:** 2026-10-18

## Context

Folio requires every notebook to satisfy two competing requirements:
1. **Standalone readability outside the tool:** The persisted artifact on disk must be a clean, human-readable book that works in any standard Markdown viewer, editor, or git diff without requiring the Folio runtime.
2. **Cell-scoped interactive state inside the tool:** When opened in the Folio workbench, each document must divide deterministically into semantic "concept blocks" with stable IDs, and support transient workbench state (ephemeral cell chats, pending suggested diff edits on adjacent cells, and parent-child document tree metadata).

## Decision

Store documents on disk as standard Markdown (`.md`) files where each concept block is preceded by an HTML comment delimiter (`<!-- folio:block id="<id>" -->`), and store all transient workbench state (pending suggested edits, active ephemeral chats, and document tree links) in a separate `.folio/notebook.json` sidecar file.

When a cell branches into a child sub-document, the parent block appends a standard relative Markdown link (`[→ <Child Title>](<child-slug>.md)`) in the `.md` file in addition to recording the tree edge in `.folio/notebook.json`.

## Consequences

- **Easy:** `.md` files remain 100% readable in Obsidian, VS Code, GitHub, or any Markdown previewer; HTML comment delimiters are invisible when rendered; git diffs show pure prose changes unaffected by transient chat or pending-diff state.
- **Hard:** The server must parse and serialize `<!-- folio:block id="..." -->` comments on every read/write and recover gracefully if a user edits the `.md` file externally and removes or duplicates a marker.

## Alternatives rejected

- **JSON or SQLite notebook format (e.g., `.ipynb` / `.folio.json`) with Markdown export:** Rejected because the primary file on disk is no longer directly readable or git-diffable as prose, and two-way sync between an exported `.md` and a primary database introduces drift.
- **Standalone HTML files (`<section data-block-id="...">`):** Rejected because raw HTML is unpleasant to read or edit in a text editor and noisy in git diffs, and round-tripping rendered HTML back into Markdown for LLM prompts is lossy.
