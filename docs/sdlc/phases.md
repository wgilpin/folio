# Phases — folio

Folio builds from a single-document tracer bullet (Phase 01) into the core single-document inline chat and multi-cell `Integrate` proof (Phase 02), then expands into a hierarchical multi-document tree with ancestor context (Phase 03), adds runtime BYOM model/thinking controls and pedagogical prompt profiles (Phase 04), and layers in a cross-workspace Learner Profile with interactive Block 0 Prerequisite chips (Phase 05).

## Phase 01 — Tracer Bullet: Seed, Read, and Manual Block Workbench

**Goal:** Prove the full stack end-to-end by seeding a single Markdown document (`index.md`) via LLM, parsing and persisting `<!-- folio:block -->` delimiters (including fallback recovery for externally edited Markdown), rendering Concept Blocks with Mermaid diagrams, and editing/splitting/merging/deleting blocks manually.

**Works after this phase:** You can launch the workbench, seed a topic into 4–8 Concept Blocks using the `.env`-configured frontier model, read rendered Markdown and Mermaid diagrams with a live Table of Contents, and manually edit raw Markdown, split, merge, or delete blocks with clean `.md` persistence on disk.

**Not in this phase:** Inline cell Q&A chats, LLM `Integrate` or pending diff gates, child sub-document branching, or UI model switching.

**Depends on:** nothing

## Phase 02 — Ephemeral Inline Cell Chat & Multi-Cell Integrate Gate

**Goal:** Deliver the smallest concept proof by adding ephemeral multi-turn Q&A chats on any Concept Block (scoped to Current ToC + $[N-1, N, N+1]$), resolving via **Discard** or **Integrate** (updating cell $N$, inserting new blocks, and staging suggested edits on $N-1$/$N+1$), and enforcing the synchronous **Accept / Reject** diff gate.

**Works after this phase:** You can open an inline chat on any block to ask follow-up questions, discard it when done, or click **Integrate** to mutate the block, spawn new blocks below it, and review/accept/reject suggested coherence diffs on adjacent cells before starting another chat.

**Not in this phase:** Branching a chat into a child sub-document, multi-document tree navigation, or runtime UI model switching.

**Depends on:** Phase 01

## Phase 03 — Sub-Document Branching & Ancestor Tree Navigation

**Goal:** Expand the single-document workbench into a hierarchical "live book" by resolving a cell chat via **Branch Doc**, generating a transcript-seeded child `.md` document, linking it from parent cell $N$, rendering the sidebar Document Tree and breadcrumbs, and injecting the full Ancestor ToC chain into cell context.

**Works after this phase:** You can branch any cell chat into a dedicated child `.md` document, navigate up and down the document tree via the sidebar, breadcrumbs, or inline `SubDocLinkCard` links, and ask cell questions that remain aware of the entire ancestor Table of Contents.

**Not in this phase:** Runtime UI switching between LLM providers/thinking budgets, customizable pedagogical system prompts, or switching between multiple notebook workspace folders in the UI.

**Depends on:** Phase 01, Phase 02

## Phase 04 — BYOM Model Controls, Pedagogical Profiles & Workspace Switcher

**Goal:** Add runtime switching across Anthropic, Google Gemini, and OpenAI frontier models and reasoning budgets, editable pedagogical system prompt profiles, and a workspace folder switcher in the sidebar.

**Works after this phase:** You can switch frontier models and thinking budgets on the fly from the sidebar, customize or select pedagogical system prompts (e.g., rigorous derivation vs. intuitive physical picture), and open different local notebook folders without restarting the server.

**Not in this phase:** Cross-workspace learner topic ledger or interactive prerequisite chips, cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03

## Phase 05 — Cross-Workspace Learner Profile & Interactive Prerequisite Chips

**Goal:** Persist a global Learner Profile (`~/.folio/profile.json`) tracking topic familiarity across all workspaces and render structured Prerequisite Chips in Block 0 (`blk_00`) with one-click **`↳ Seed Prerequisite`** sub-document generation and **`✓ I know this`** level toggles that calibrate the depth of newly seeded documents.

**Works after this phase:** When you seed a topic, Folio checks your global Learner Profile and existing notebook history to pitch explanations at the right depth (diving straight into formalism when prerequisites like Lagrangian Mechanics are already known, or starting gently from intuition when they are unseen), and Block 0 displays interactive chips letting you either mark prerequisites as known or seed any prerequisite into a linked sub-document in one click.

**Not in this phase:** Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03, Phase 04

## Phase 06 — Library Index (`README.md`), Full-Text & Semantic Search, and Agent Topic Deduplication

**Goal:** Migrate growing tree/topic/prerequisite graph metadata from monolithic `.folio/notebook.json` into a scalable local SQLite store (`.folio/library.sqlite`), maintain an auto-generated hierarchical `README.md` index on disk for external human readers, index all Concept Blocks and documents for instant full-text and semantic search, and equip the seed/branch/prerequisite generators with library-wide retrieval so the agent reuses and cross-links existing expansions instead of duplicating topics.
Issue ISS-2: Add hierarchical topic index (`README.md`), full-text search, semantic search, and agent topic deduplication across the root library folder.
Issue ISS-3: Replace monolithic `.folio/notebook.json` with a scalable local database (`.folio/library.sqlite`) as document trees and prerequisite graphs grow.

**Works after this phase:** Opening the root folder in GitHub, Obsidian, or any Markdown viewer presents a clean hierarchical `README.md` map of all topics and sub-documents; pressing search inside Folio finds blocks and documents by keyword, LaTeX notation, or semantic similarity; and seeding or branching a topic automatically detects or cross-links existing documents/blocks in your library rather than re-expanding them from scratch.

**Not in this phase:** Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03, Phase 04, Phase 05

## Phase 07 — Unified Learner Ability Record & Cell Done Tracking

**Goal:** Consolidate learner context into a single central record of ability (`~/.folio/profile.json` / library store) that combines: (1) user self-supplied background (e.g., *"I did first year Nat Sci (Physical) at Cambridge."*), (2) standing personal learning instructions (e.g., *"I am a visual learner. Explain terms as they are introduced"*), and (3) a ledger of documents, Concept Blocks, and sources actually engaged with—driven by adding a **Done** check-off status to every Concept Block cell (visually marking the cell as completed in place without hiding its content).
Issue ISS-4: Unified central learner ability record (self-supplied background, learning instructions, and engaged sources) + cell `Done` status toggle.

**Works after this phase:** You can edit your central Learner Ability Record in one place (your academic/technical background, standing pedagogical preferences, and topic/source history), check off individual Concept Blocks as **Done** as you read through a document (keeping the cell visible with a clear completed state and progress count), and have every LLM action (`Seed`, `Ask Cell`, `Integrate`, `Branch Doc`) automatically calibrated by your background, standing instructions, and the specific cells/documents you have completed.

**Not in this phase:** Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03, Phase 04, Phase 05, Phase 06

## Phase 08 — OrbStack Deployment (`folio.teleosis.ai`), Central Caddy Auth & Cross-Mac Folio Skill

**Goal:** Package Folio as an always-on OrbStack container (`folio` on `web-routing`, port `4321`) where Hono serves both the compiled Vite SPA (`dist/`) and `/api/*` backed by persistent host volume mounts, add central `tinyauth` SSO + `Authorization: Bearer $TELEOSIS_API_KEY` bypass in `/Users/will/projects/caddy` (`(protected)` snippet + `http://folio.teleosis.ai`), and provide a Folio Skill so any LLM chat session across Macs can query the Learner Ability Record, search Concept Blocks, and fetch Markdown documents.
Issue ISS-5: Always-on OrbStack deployment (`folio.teleosis.ai`), Caddy central auth (`tinyauth` + bearer token bypass), and cross-Mac Folio Skill.

**Works after this phase:** You can open `https://folio.teleosis.ai` (or a macOS Dock PWA) on any of your Macs with single sign-on across `*.teleosis.ai` via `tinyauth`, and any LLM chat session on your Macs can use the Folio Skill with `TELEOSIS_API_KEY` to read your Learner Ability Record, search your library, and retrieve documents as Markdown.

**Not in this phase:** Multi-tenant user accounts, persistent inline chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03, Phase 04, Phase 05, Phase 06, Phase 07

## Phase 09 — Seed from Source Material (Paste or File Upload) & Viewable Source Attachment

**Goal:** Extend the unified Seed Topic flow (`POST /api/doc/seed`, empty-state Seed card, and Seed modal) so a document can start by uploading a `.pdf` or `.md` file or pasting raw source text (dirty web copy-paste or copied AI chat transcript) with an optional steering prompt, synthesizing the source into 4–8+ Concept Blocks while persisting the unmodified raw source on disk as a viewable document attachment (superseded in LLM context by subsequent cell chats), and remove the vestigial `Root Folder` switcher from the sidebar.
Issue ISS-6: Remove or hide vestigial `Root Folder` (`/data/workspace`) switcher in the Notebook Sidebar.

**Works after this phase:** You can start a Folio document by dropping/selecting a `.pdf` or `.md` file or pasting a web article or AI chat transcript into the unified Seed box (with or without a steering instruction), get a synthesized Concept Block document calibrated to your Learner Ability Record, open the saved raw source attachment anytime from the document header, and use a cleaner Notebook Sidebar without the vestigial `Root Folder` input.

**Not in this phase:** Faithful verbatim document chunking/import without LLM synthesis (deferred to a later phase for `.pdf` and `.md` uploads), automatic cleanup of the saved raw text attachment, whole-textbook multi-document splitting, or re-injecting the raw attachment into subsequent `Ask Cell` / `Integrate` contexts.

**Depends on:** Phase 01, Phase 02, Phase 03, Phase 04, Phase 05, Phase 06, Phase 07, Phase 08
