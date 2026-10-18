# Test plan — Phase 04 BYOM Model Controls, Pedagogical Profiles & Workspace Switcher

## Coverage

| Criterion | Epic | Kind | Test |
|---|---|---|---|
| DC-1 | `epic-01-byom-settings-and-workspace-api` | automated | `src/server/__tests__/settings-workspace-api.test.ts` — `PUT /api/settings persists modelId, reasoningEffort, and pedagogical profile in .folio/notebook.json and forwards them to seed, chat, integrate, and branch generators` |
| DC-2 | `epic-01-byom-settings-and-workspace-api` | automated | `src/server/__tests__/settings-workspace-api.test.ts` — `POST /api/workspaces/switch dynamically switches the active workspace folder and returns its loaded document and settings` |
| DC-3 | `epic-02-sidebar-controls-and-workspace-ui` | automated | `src/client/__tests__/SidebarControls.test.tsx` — `switches BYOM model and reasoning budget in SidebarTree and sends PUT /api/settings` |
| DC-4 | `epic-02-sidebar-controls-and-workspace-ui` | automated | `src/client/__tests__/SidebarControls.test.tsx` — `switches pedagogical prompt profile and saves custom pedagogical instructions via PUT /api/settings` |
| DC-5 | `epic-02-sidebar-controls-and-workspace-ui` | automated | `src/client/__tests__/SidebarControls.test.tsx` — `switches active notebook workspace folder from SidebarTree via POST /api/workspaces/switch and renders the new workspace document` |

## Gaps

None. Every done criterion is covered by an automated test.
