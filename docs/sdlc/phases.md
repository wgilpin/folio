# Phases — folio

Folio builds from a single-document tracer bullet (Phase 01) into the core single-document inline chat and multi-cell `Integrate` proof (Phase 02), then expands into a hierarchical multi-document tree with ancestor context (Phase 03), and finishes with runtime BYOM model/thinking controls and pedagogical prompt profiles (Phase 04).

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

**Not in this phase:** Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.

**Depends on:** Phase 01, Phase 02, Phase 03
