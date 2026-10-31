# Phase 10 — Falsification-First Adversarial Review (Seed Profile, Cell & Document Audit)

**Goal:** Add a falsification-first **Adversarial Review** capability across Folio: (1) an `adversarial-review` pedagogical/synthesis profile for seeding specs, architectures, or papers directly as red-team audits, and (2) one-click **Adversarial Review** triggers on both the full notebook (inspecting all Concept Blocks plus `sourceAttachment` when present) and individual Concept Blocks (`[N-1, N, N+1]`), opening an ephemeral chat thread with severity-ranked findings (*Serious / Fatal Gaps*, *Moderate Gaps*, *Small Number / Arithmetic Errors*, and *Result & Open Risks*) ready to debate, **Integrate**, **Branch Doc**, or **Discard**.

## Scope

- **Adversarial Review Schema, 6-Step Falsification Prompt & Server Endpoints (`src/shared/schema.ts`, `src/server/llm.ts`, `src/server/app.ts`):** Extend `PedagogicalProfileIdSchema` with `'adversarial-review'`, define `ADVERSARIAL_REVIEW_INSTRUCTIONS` (encoding the 6-step falsification-first audit and gotchas: anti-self-conditioning, cross-layer boundary checks, first-principles number re-derivation, second-order fix consequences, unstated dependency exposure, and severity-ranked output), add `POST /api/doc/review` (inspecting all document Concept Blocks plus the saved raw `sourceAttachment` from `.folio/attachments/<docId>/<filename>` when present), and add `POST /api/blocks/:id/review` (strictly bounded to `[N-1, N, N+1]` without re-injecting `sourceAttachment`).
- **One-Click Adversarial Review UI & Seed/Sidebar Profile Option (`src/client/App.tsx`, `src/client/components/DocumentChatDrawer.tsx`, `src/client/components/ConceptBlockCard.tsx`, `src/client/components/InlineChatDrawer.tsx`, `src/client/components/SeedModal.tsx`, `src/client/components/SidebarTree.tsx`):** Add one-click **Adversarial Review** triggers for the active notebook (header button and inside `DocumentChatDrawer`) and for any Concept Block (card action bar and inside `InlineChatDrawer`), opening the corresponding chat drawer with the severity-ranked falsification report ready to follow up, **Integrate**, **Branch Doc**, or **Discard**, and expose the `adversarial-review` option in both `SeedModal` and `SidebarTree`.

## Done criteria

1. **DC-1** — `PedagogicalProfileIdSchema` includes `'adversarial-review'`, `PUT /api/settings` accepts and persists `activeProfileId: 'adversarial-review'`, and `PEDAGOGICAL_PROFILES['adversarial-review']` / `ADVERSARIAL_REVIEW_INSTRUCTIONS` in `src/server/llm.ts` include the 6-step falsification-first technical audit (falsification mindset, cross-layer boundaries, first-principles number re-derivation, second-order fix consequences, unstated dependencies, and severity-formatted findings: *Serious / Fatal Gaps*, *Moderate Gaps*, *Small Number / Arithmetic Errors*, and *Result and Open Risks*).
2. **DC-2** — `POST /api/doc/review` runs a falsification-first Adversarial Review across the full active document (passing both the document's `ConceptBlock`s and the saved raw `sourceAttachment` when `document.sourceAttachment` exists on disk) and stores the review turn in `activeChat` (`blockId: null`), while `POST /api/blocks/:id/review` runs a falsification-first Adversarial Review strictly on the bounded cell context (`[N-1, N, N+1]`, without re-injecting `sourceAttachment`) and stores the review turn in `activeChat` (`blockId: id`); both endpoints enforce the `409` pending-diff gate when `pendingEdits` is non-empty.
3. **DC-3** — In the workbench UI, clicking **Adversarial Review** at the document level (in the document header or `Ask Notebook` drawer) calls `POST /api/doc/review`, opens `DocumentChatDrawer`, and renders the severity-ranked falsification report with **Integrate**, **Branch Doc**, and **Discard** enabled; clicking **Adversarial Review** on a Concept Block (in the block action bar or `InlineChatDrawer`) calls `POST /api/blocks/:id/review`, opens `InlineChatDrawer` for that cell, and renders the cell-scoped falsification report.
4. **DC-4** — Both `SeedModal.tsx` (`#seed-pedagogical-profile`) and `SidebarTree.tsx` (`#sidebar-pedagogical-profile`) include the `adversarial-review` (*Adversarial Spec Review*) option and persist selection changes via `PUT /api/settings`.

## Not in this phase

- Automated background re-auditing on every keystroke.
- External code execution or simulation kernels to verify equations.
- Multi-document repository-wide audits in a single pass.

## Epics

1. `epic-01-adversarial-review-api.md` — `adversarial-review` profile in `PedagogicalProfileIdSchema`, `ADVERSARIAL_REVIEW_INSTRUCTIONS` & source-aware `defaultDocumentChatGenerator` / `defaultCellChatGenerator` in `src/server/llm.ts`, and `POST /api/doc/review` + `POST /api/blocks/:id/review` in `src/server/app.ts` (covers DC-1, DC-2).
2. `epic-02-adversarial-review-ui.md` — One-click **Adversarial Review** buttons in the Document Header / `DocumentChatDrawer` and `ConceptBlockCard` / `InlineChatDrawer`, plus the `adversarial-review` selector option in `SeedModal.tsx` and `SidebarTree.tsx` (covers DC-3, DC-4; depends on Epic 01).

Epics run sequentially (`epic-01` → `epic-02`); Epic 02 consumes the `adversarial-review` schema enum and `/api/doc/review` + `/api/blocks/:id/review` routes added in Epic 01.

## Risks

- **Self-conditioning when auditing LLM-generated Concept Blocks:** If the model uses its standard helpful tutor persona during an on-demand review, it may soften critiques of blocks it helped synthesize. Mitigation: `POST /api/doc/review` and `POST /api/blocks/:id/review` explicitly inject `ADVERSARIAL_REVIEW_INSTRUCTIONS` into the generator regardless of the currently selected default learning profile, instructing the model to discard conversational "yes-and" conditioning and re-compute every equation from first principles.
