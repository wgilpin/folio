# Epic 02 — Sidebar BYOM Model/Reasoning Picker, Pedagogical Profile Editor & Workspace Switcher UI

**Phase:** 04 BYOM Model Controls, Pedagogical Profiles & Workspace Switcher
**Goal:** Add interactive controls in `SidebarTree` and `App.tsx` for switching frontier models (`anthropic:claude-opus-4-6`, `google:gemini-3.1-pro`, `openai:o3`, or custom), reasoning effort (`low` | `medium` | `high`), pedagogical system prompt profiles (`Intuitive Physical Picture`, `Rigorous Derivation`, `Custom` with editable textarea), and active notebook workspace folders.
**Done criteria covered:** DC-3, DC-4, DC-5

## Behaviour

`SidebarTree` and `App.tsx` wire the Phase 04 controls in the sidebar:
1. **Workspace Switcher section**: Displays the current `workspaceDir`, a text input (`aria-label="Workspace directory path"`) pre-filled or editable to enter another local folder path (plus quick-select buttons or options for known `workspaces` if more than one exists), and a `Switch Workspace` button (`aria-label="Switch workspace"`). Clicking `Switch Workspace` sends `POST /api/workspaces/switch` with `{ workspaceDir }` and updates the Workbench state (`document`, `documents`, `blocks`, `toc`, `settings`, `workspaceDir`, `modelId`).
2. **BYOM Model & Reasoning Controls**:
   - A model selector (`aria-label="Active Model"`) with preset frontier options (`anthropic:claude-opus-4-6`, `google:gemini-3.1-pro`, `openai:o3`) plus support for custom model strings, calling `PUT /api/settings` on change.
   - A reasoning effort selector (`aria-label="Reasoning Effort"`) with options `low`, `medium`, `high`, calling `PUT /api/settings` on change.
3. **Pedagogical Profile Controls**:
   - A pedagogical profile selector (`aria-label="Pedagogical Profile"`) with options `intuitive-physical` (`Intuitive Physical Picture`), `rigorous-derivation` (`Rigorous Derivation`), and `custom` (`Custom Prompt`), calling `PUT /api/settings` on change.
   - When `activeProfileId === 'custom'`, renders a textarea (`aria-label="Custom Pedagogical Prompt"`) and a `Save Prompt` button (`aria-label="Save custom pedagogical prompt"`) that calls `PUT /api/settings` with `{ activeProfileId: 'custom', customSystemPrompt }`.

## Acceptance criteria

- **AC-1** — Given a loaded document in the Workbench, when the user changes `Active Model` to `openai:o3` and `Reasoning Effort` to `medium` in `SidebarTree`, then the client sends `PUT /api/settings` and reflects `openai:o3` and `medium` as the active model and reasoning effort.
- **AC-2** — Given a loaded document in the Workbench, when the user changes `Pedagogical Profile` to `Custom Prompt`, enters `"Derive every equation from Symplectic geometry"`, and clicks `Save Prompt`, then `PUT /api/settings` persists `activeProfileId: 'custom'` and `customSystemPrompt`.
- **AC-3** — Given a loaded document in workspace A, when the user enters a second workspace path in `Workspace directory path` and clicks `Switch Workspace`, then the client sends `POST /api/workspaces/switch` and updates the Workbench to display the target workspace's document (or inline Seed Topic card if the new workspace is empty).

## Tests

- `src/client/__tests__/SidebarControls.test.tsx` — `switches BYOM model and reasoning budget in SidebarTree and sends PUT /api/settings` (covers AC-1)
- `src/client/__tests__/SidebarControls.test.tsx` — `switches pedagogical prompt profile and saves custom pedagogical instructions via PUT /api/settings` (covers AC-2)
- `src/client/__tests__/SidebarControls.test.tsx` — `switches active notebook workspace folder from SidebarTree via POST /api/workspaces/switch and renders the new workspace document` (covers AC-3)

## Files

- `src/client/components/SidebarTree.tsx`
- `src/client/App.tsx`
- `src/client/__tests__/SidebarControls.test.tsx`

## Out of scope

- Global Learner Profile (`~/.folio/profile.json`) and interactive Block 0 Prerequisite Chips — covered in Phase 05.
