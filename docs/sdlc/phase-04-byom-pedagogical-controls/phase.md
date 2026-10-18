# Phase 04 — BYOM Model Controls, Pedagogical Profiles & Workspace Switcher

**Goal:** Add runtime switching across Anthropic, Google Gemini, and OpenAI frontier models and reasoning budgets, editable pedagogical system prompt profiles, and a workspace folder switcher in the sidebar.

## Done criteria

- **DC-1** — Calling `PUT /api/settings` updates and persists the active BYOM `modelId`, `reasoningEffort` (`low` | `medium` | `high`), `activeProfileId` (`intuitive-physical` | `rigorous-derivation` | `custom`), and `customSystemPrompt` in `.folio/notebook.json`, and subsequent `POST /api/doc/seed`, `POST /api/blocks/:id/chat`, `POST /api/blocks/:id/integrate`, and `POST /api/blocks/:id/branch` requests pass the active `modelId`, `reasoningEffort`, and resolved pedagogical system prompt instructions into the LLM generators.
- **DC-2** — Calling `GET /api/workspaces` returns the current active `workspaceDir` and recent/known workspace directories, and calling `POST /api/workspaces/switch` with `{ workspaceDir }` switches the server's active `WorkspaceStore` to the target directory (creating it if needed) and returns the loaded document state (`{ document, blocks, toc, documents, activeChat, pendingEdits, settings, workspaceDir, modelId }`) for that workspace without restarting the server.
- **DC-3** — In `SidebarTree`, changing the BYOM model selector (`anthropic:claude-opus-4-6`, `google:gemini-3.1-pro`, `openai:o3`, or custom model spec) or reasoning budget selector (`low`, `medium`, `high`) calls `PUT /api/settings` and updates the active model and reasoning budget in the UI.
- **DC-4** — In `SidebarTree`, selecting a pedagogical prompt profile (`Intuitive Physical Picture`, `Rigorous Derivation`, or `Custom`) or editing and saving the custom pedagogical instructions calls `PUT /api/settings` and persists the updated pedagogical profile.
- **DC-5** — In `SidebarTree`, entering or selecting a notebook workspace folder path and clicking **Switch Workspace** calls `POST /api/workspaces/switch` and reloads the Workbench with the target workspace's documents and blocks.

## Epics

1. `epic-01-byom-settings-and-workspace-api` — BYOM Model & Reasoning Controls, Pedagogical Prompt Profiles & Dynamic Workspace Switching API (covers DC-1, DC-2).
2. `epic-02-sidebar-controls-and-workspace-ui` — Sidebar BYOM Model/Reasoning Picker, Pedagogical Profile Editor & Workspace Switcher UI (covers DC-3, DC-4, DC-5; depends on `epic-01-byom-settings-and-workspace-api`).

## Out of scope

- Cross-workspace Learner Profile (`~/.folio/profile.json`) and interactive Block 0 Prerequisite Chips (Phase 05).
- Cloud sync, multi-user accounts, persistent chat histories, or code execution kernels.
