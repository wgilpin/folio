# Design — folio

**Look:** Editorial, technical, quiet

## Surfaces

- **Document Workbench (`/`):** The central reading and editing column showing breadcrumbs, sticky gate status, and the ordered sequence of Concept Blocks (rendered Markdown + Mermaid diagrams + hover block controls).
- **Inline Cell Chat Drawer (block-attached):** An ephemeral multi-turn Q&A panel anchored directly inside the active Concept Block $N$, with streaming model replies and the three exit actions (**Integrate**, **Branch Doc**, **Discard**).
- **Pending Diff Gate View (block diff mode):** An inline diff card on adjacent cells ($N-1$, $N+1$) highlighting proposed coherence edits, the LLM's stated reason, and **Accept Edit** / **Reject Edit** actions.
- **Notebook Sidebar & Seed Modal:** A collapsible left rail (`260px`) containing the hierarchical Document Tree, the active document's Table of Contents, the BYOM frontier model selector, and the **Seed Topic Modal** for generating new documents.

## Primary flow

1. On the empty **Document Workbench** (or via `+ Seed` in the **Notebook Sidebar**), open the **Seed Topic Modal**, enter a topic prompt, and generate 4–8 initial Concept Blocks.
2. Read the rendered prose and Mermaid diagrams on the **Document Workbench**, then click **Ask Cell** on Concept Block $N$ to open its **Inline Cell Chat Drawer**.
3. Ask one or more follow-up questions in the **Inline Cell Chat Drawer** and click **Integrate** (or **Branch Doc** / **Discard**).
4. Inspect the updated Concept Block $N$ (and any newly inserted blocks below it); if an adjacent block ($N-1$ or $N+1$) enters the **Pending Diff Gate View**, click **Accept Edit** or **Reject Edit** to clear the gate and unlock further cell chats.

## Tokens

- **Colour:**
  - `background`: `#FAF8F5` (warm paper canvas)
  - `surface`: `#FFFFFF` (active block / chat card) and `#F3EFEA` (sidebar / muted well)
  - `border`: `#E4DFD7` (stone hairline)
  - `text`: `#18181B` (deep ink prose)
  - `muted-text`: `#65635E` (warm slate labels, block IDs, ToC items)
  - `primary`: `#1D4ED8` (cobalt blue active block ring, primary buttons, links)
  - `warning`: `#B45309` text on `#FEF3C7` surface with `#F59E0B` border (pending diff gate banner and cell highlight)
  - `danger`: `#B91C1C` text on `#FEE2E2` surface (delete block, diff removal `-` lines)
  - `success`: `#15803D` text on `#DCFCE7` surface (diff addition `+` lines)
- **Type:**
  - Prose body & headings: `'Newsreader'`, `'Charter'`, `'Georgia'`, serif (`17px` / `1.0625rem` body, line-height `1.65`, max measure `68ch`)
  - UI chrome & chat: `'Inter'`, system-ui, sans-serif (`13px` / `0.8125rem` controls, `14px` / `0.875rem` chat messages)
  - Code, raw Markdown editor & diffs: `'JetBrains Mono'`, monospace (`13px` / `0.8125rem`)
  - Scale: `12px` (`0.75rem`), `13px` (`0.8125rem`), `14px` (`0.875rem`), `17px` (`1.0625rem`), `22px` (`1.375rem` H2), `28px` (`1.75rem` H1)
- **Spacing:** `4px` base unit (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`)
- **Radius:** `6px` for buttons, inputs, and badges; `8px` for Concept Block cards, chat drawers, and modals
- **Shadow:** `none` on resting Concept Blocks; `0 2px 8px rgba(24, 24, 27, 0.06)` on active chat blocks and modals

## Components

- **`ConceptBlockCard`:** Variants `resting` (quiet prose with hover action bar: `Ask Cell`, `Edit MD`, `Split`, `Merge`, `Delete`), `editing-raw` (monospace Markdown textarea + `Save` / `Cancel`), `chat-open` (`2px` `#1D4ED8` border + attached `InlineChatDrawer`), and `pending-diff` (`2px` `#F59E0B` border + inline `- / +` diff lines + reason + `Accept Edit` / `Reject Edit`). Where it appears: **Document Workbench**.
- **`InlineChatDrawer`:** Variants `idle`, `streaming` (live token output), `integrating` / `branching` (locked with progress label), and `error` (inline retry banner preserving input). Where it appears: inside active `ConceptBlockCard`.
- **`GateBanner`:** Sticky top bar (`hidden` when `pendingEdits` is empty, `visible` amber alert with count and `Jump to next diff` button when non-empty). Where it appears: top of **Document Workbench**.
- **`SidebarTree`:** Variants `expanded` (`260px` left rail with Document Tree, Current Doc ToC, and BYOM Model selector) and `collapsed` (compact toggle button for distraction-free reading). Where it appears: **Notebook Sidebar**.
- **`SubDocLinkCard`:** Compact card rendered at the bottom of a Concept Block that has branched a child document (`→ Deep dive: <Child Title>`). Where it appears: inside `ConceptBlockCard`.

## States

- **Empty:** When no documents exist in the workspace, the **Document Workbench** renders an inline Seed Topic card directly in the main column. When a document has zero blocks, it shows an `Add Block` / `Seed Topic` empty state.
- **Loading:** Initial document seed renders 4 skeleton shimmer blocks; `InlineChatDrawer` shows streaming tokens; `Integrate` and `Branch Doc` disable exit buttons and display a status spinner (`Integrating into cells...`).
- **Error:** Missing API keys, provider errors, or schema failures render an inline `#FEE2E2` alert inside the active drawer or modal while preserving the user's prompt and chat transcript so they can retry or switch models without data loss.
- **No-permission (Gate Locked):** While `pendingEdits.length > 0` on the current document, `Ask Cell` buttons on all blocks are disabled with a lock badge (`Resolve pending suggested edits first`). Manual raw Markdown editing remains available.

## Responsive

- Minimum supported width: `1024px` (`1280px+` recommended for comfortable sidebar + `68ch` reading column).
- Below `1100px`, `SidebarTree` automatically collapses into an overlay drawer so the main reading column never shrinks below `68ch`.

## Accessibility

- Contrast target: WCAG AAA (`14.5:1`) for primary `#18181B` ink on `#FAF8F5` paper; WCAG AA (`4.8:1` minimum) for `#65635E` muted text and status badges.
- Focus style: `2px solid #1D4ED8` with `2px` offset on all interactive buttons, tree links, and block cards.
- Keyboard path: `Tab` navigates between Concept Block action bars; `Cmd/Ctrl + Enter` submits chat messages or saves raw Markdown edits; `Escape` closes the Seed Modal or cancels raw Markdown editing.
- Labels: Explicit `aria-label` on icon/compact block actions (`Ask cell blk_02`, `Edit Markdown for blk_02`, `Accept suggested edit on blk_03`).

## Where the screens live

- Stitch project id: none
- Stitch design system id: none
- Claude Design project id: none

## Out of scope

- Dark mode theme toggle in the initial proof.
- Mobile phone (`<768px`) viewport layouts.
- Drag-and-drop block reordering handles (covered by simple up/down or split/merge controls).
