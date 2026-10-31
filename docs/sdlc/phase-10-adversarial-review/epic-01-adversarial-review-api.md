# Epic 01 — Adversarial Review Schema, 6-Step Falsification Prompts & Audit API

**Phase:** 10 Falsification-First Adversarial Review (Seed Profile, Cell & Document Audit)
**Goal:** Extend `PedagogicalProfileIdSchema` with `'adversarial-review'`, define the 6-step falsification-first `ADVERSARIAL_REVIEW_INSTRUCTIONS` in `src/server/llm.ts`, and add `POST /api/doc/review` (including raw `sourceAttachment` when present) and `POST /api/blocks/:id/review` (strictly bounded to `[N-1, N, N+1]`) in `src/server/app.ts`.
**Done criteria covered:** DC-1, DC-2

## Behaviour

Users and clients can select `'adversarial-review'` as a pedagogical/synthesis profile in `PUT /api/settings` (or during `POST /api/doc/seed`) to synthesize source specifications directly with the 6-step falsification-first technical audit. In addition, clients can invoke `POST /api/doc/review` on any existing notebook to run a full-document falsification audit (which automatically attaches the saved raw source file from `.folio/attachments/<docId>/<filename>` if `document.sourceAttachment` exists) or `POST /api/blocks/:id/review` on any Concept Block to run a bounded `[N-1, N, N+1]` falsification audit (without re-injecting `sourceAttachment`), storing the resulting critique turn in `activeChat` ready for follow-up, `Integrate`, `Branch Doc`, or `Discard`.

## Acceptance criteria

- **AC-1** — Given `PedagogicalProfileIdSchema` and `PEDAGOGICAL_PROFILES`, when `PUT /api/settings` is called with `{ activeProfileId: 'adversarial-review' }`, then it returns `200` with `settings.activeProfileId === 'adversarial-review'` and `resolvePedagogicalPrompt(settings)` (as well as `ADVERSARIAL_REVIEW_INSTRUCTIONS`) contains the 6-step falsification-first instructions (*Adopt a Falsification Mindset*, *Audit Cross-Layer Boundaries*, *Re-Derive All Numbers from First Principles*, *Trace Second-Order Consequences of Fixes*, *Expose Unstated Dependencies and Closure Gaps*, and *Format the Critique by Severity*: *Serious / Fatal Gaps*, *Moderate Gaps*, *Small Number / Arithmetic Errors*, *Result and Open Risks*).
- **AC-2** — Given a seeded document that has a saved `sourceAttachment` on disk, when `POST /api/doc/review` is called with `{ docId }` (and optional custom focus `prompt`), then `documentChatGenerator` is invoked with the full `DocumentContext`, the loaded raw `source` (`SeedSourceInput`), and `ADVERSARIAL_REVIEW_INSTRUCTIONS`, and the response returns `200` with `activeChat` (`blockId: null`) containing the adversarial review prompt and assistant critique.
- **AC-3** — Given a seeded document (with or without a `sourceAttachment`), when `POST /api/blocks/:id/review` is called for a target block (e.g. `blk_01`), then `cellChatGenerator` is invoked strictly with the bounded `[N-1, N, N+1]` `BoundedCellContext` and `ADVERSARIAL_REVIEW_INSTRUCTIONS` (without re-injecting `sourceAttachment`), and the response returns `200` with `activeChat` (`blockId: 'blk_01'`) containing the adversarial review turn.
- **AC-4** — Given a document with non-empty `pendingEdits`, when `POST /api/doc/review` or `POST /api/blocks/:id/review` is called, then the server rejects the request with `409` (`Resolve pending suggested edits first`).

## Tests

- `src/server/__tests__/adversarial-review-api.test.ts` — `accepts activeProfileId: "adversarial-review" in PUT /api/settings and includes 6-step falsification-first instructions in resolvePedagogicalPrompt and ADVERSARIAL_REVIEW_INSTRUCTIONS` (covers AC-1).
- `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/doc/review audits full document context plus saved raw sourceAttachment when present, persists activeChat (blockId: null), and enforces 409 pendingEdits gate` (covers AC-2, AC-4).
- `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/blocks/:id/review audits bounded [N-1, N, N+1] cell context without sourceAttachment, persists activeChat (blockId: id), and enforces 409 pendingEdits gate` (covers AC-3, AC-4).

## Files

- `src/shared/schema.ts`
- `src/server/llm.ts`
- `src/server/app.ts`
- `src/server/__tests__/adversarial-review-api.test.ts`

## Out of scope

- React UI components (`App.tsx`, `DocumentChatDrawer.tsx`, `ConceptBlockCard.tsx`, `InlineChatDrawer.tsx`, `SeedModal.tsx`, `SidebarTree.tsx`), which are covered in Epic 02.

## Notes

- In `src/server/llm.ts`, extend `DocumentChatGenerator` input to accept `source?: SeedSourceInput` so `defaultDocumentChatGenerator` includes the raw source attachment (text or base64 PDF) when `source` is provided during a document-level review.
- When `POST /api/doc/review` or `POST /api/blocks/:id/review` runs, combine the user's current `pedagogicalPrompt` with `ADVERSARIAL_REVIEW_INSTRUCTIONS` (or use `ADVERSARIAL_REVIEW_INSTRUCTIONS` directly) so the falsification-first mindset and severity structure are always enforced even if the user's default profile is `intuitive-physical`.

## Build note — 2026-10-31

### Tasks done
- Extended `PedagogicalProfileIdSchema` in `src/shared/schema.ts` with `'adversarial-review'`.
- Exported `ADVERSARIAL_REVIEW_INSTRUCTIONS` in `src/server/llm.ts` covering the 6-step falsification-first technical audit (*Adopt a Falsification Mindset*, *Audit Cross-Layer Boundaries*, *Re-Derive All Numbers from First Principles*, *Trace Second-Order Consequences of Fixes*, *Expose Unstated Dependencies and Closure Gaps*, and *Format the Critique by Severity*: *Serious / Fatal Gaps*, *Moderate Gaps*, *Small Number / Arithmetic Errors*, *Result and Open Risks*) plus audit gotchas (*Self-Conditioning in Long Threads*, *Fixing Without Pricing the Fix*, *Missing the Passive Elements*), and registered `'adversarial-review'` (`Adversarial Spec Review`) in `PEDAGOGICAL_PROFILES`.
- Extended `DocumentChatGenerator` and `defaultDocumentChatGenerator` in `src/server/llm.ts` to accept `source?: SeedSourceInput` (attaching PDF files or decoded UTF-8 raw source text during document-level review).
- Added `POST /api/doc/review` and `POST /api/blocks/:id/review` in `src/server/app.ts` with 409 `pendingEdits` gating, automatic `sourceAttachment` loading on full-document review, strict `[N-1, N, N+1]` bounded cell context on block review, and persistence into `activeChat`.

### Tests added
- `src/server/__tests__/adversarial-review-api.test.ts` (3 tests covering AC-1, AC-2, AC-3, AC-4).

### Suite result
- `npm test`: 29 test files passed, 93 tests passed.

### Deviations from plan
- None.

---

## Review — 2026-10-31

**Verdict:** pass

### Acceptance criteria

| AC | Met | Proved by |
|---|---|---|
| AC-1 | yes | `src/server/__tests__/adversarial-review-api.test.ts` — `accepts activeProfileId: "adversarial-review" in PUT /api/settings and includes 6-step falsification-first instructions in resolvePedagogicalPrompt and ADVERSARIAL_REVIEW_INSTRUCTIONS` |
| AC-2 | yes | `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/doc/review audits full document context plus saved raw sourceAttachment when present, persists activeChat (blockId: null), and enforces 409 pendingEdits gate` |
| AC-3 | yes | `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/blocks/:id/review audits bounded [N-1, N, N+1] cell context without sourceAttachment, persists activeChat (blockId: id), and enforces 409 pendingEdits gate` |
| AC-4 | yes | `src/server/__tests__/adversarial-review-api.test.ts` — `POST /api/doc/review ...` & `POST /api/blocks/:id/review ...` |

### Drift

None

### Findings

None

### Follow-ups

None
