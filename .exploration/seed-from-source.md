# Seed from Source Material (Paste or File Upload)

## Problem
Folio currently requires every root document to start from a short topic prompt (`Seed Topic`), forcing the LLM to generate Concept Blocks solely from its parametric knowledge. When the user is learning from a specific external artifact—a copy-pasted web article (with boilerplate and messy formatting), a copied linear AI chat transcript from Claude/ChatGPT, a Markdown note, or a PDF paper/lecture note—there is no way to start a Folio document grounded in that source material and keep the raw source attached for reference.

## Proposed change
Unify "Seed from Source" into the existing **Seed Topic** card and modal so a conversation can start by uploading a `.pdf` or `.md` file or pasting raw text (such as a dirty web copy-paste or a linear AI chat transcript), optionally paired with a steering instruction. Folio digests and synthesizes the source material into a standard 4–8+ Concept Block document (calibrated to the Learner Ability Record, with Block 0 prerequisite chips, Mermaid diagrams, and library cross-linking), while persisting the unmodified raw source (file or pasted text) as a viewable attachment linked to the document. Subsequent cell chats (`Ask Cell`, `Integrate`, `Branch Doc`) operate on the synthesized Concept Blocks as normal, superseding the raw attachment in LLM context.

## Key decisions made during exploration
- **Synthesis first, verbatim import later**: Phase 09 digests and re-synthesizes source material into Folio Concept Blocks (which handles noisy web pastes and meandering AI chat transcripts naturally and reuses the existing Seed pipeline). Faithful verbatim chunking/import is deferred to a later phase restricted to clean `.pdf` and `.md` uploads.
- **Unified Seed entry point**: Rather than adding a separate workflow or modal, file upload (`.pdf`, `.md`) and large text paste are integrated directly into the existing Seed Topic form as source attachments alongside an optional steering prompt (or no prompt at all, letting Folio infer the document title and focus from the source).
- **Persist raw source as a viewable attachment superseded by subsequent chats**: The uploaded file or pasted text is saved on disk as-is (without a separate cleanup pass on the attachment itself) and linked from the document so the user can open and read the original source at any time, while subsequent `Ask Cell` / `Integrate` / `Branch Doc` calls continue to use the bounded `[N-1, N, N+1]` Concept Block context rather than re-injecting the raw attachment.
- **Article / paper / chat scale**: Scoped to single articles, papers, lecture notes, or chat transcripts (up to ~20–30 pages for PDFs) rather than multi-hundred-page textbooks.

## Open questions
- None blocking specification.

## Red-team findings
The idea survived red-teaming against two main objections:
1. **"Why not just paste text into the existing `Seed Topic` input?"**: The existing seed flow treats the input string as a topic title rather than noisy source material to distill, cannot accept `.pdf` or `.md` file uploads, and discards the input after generation instead of preserving the raw source as a viewable attachment on the document.
2. **Whole-book PDF overload**: Attempting to synthesize a 200-page textbook into 4–8 Concept Blocks would flatten it into useless summary. Explicitly bounding the feature to article/paper/chapter/chat-sized sources avoids building a complex multi-document book splitter before the core source-seeding workflow is proven.

## Feasibility flags
- **On-disk attachment storage and serving**: Uploaded `.pdf` / `.md` files and saved pasted-text attachments should live in a dedicated workspace subfolder (e.g., `.folio/attachments/<docId>/...`) and be served via a local API route so the root workspace Markdown directory stays clean and human-readable.
- **PDF ingestion**: PDFs in technical domains (physics, math) must either be passed natively as file/document parts to frontier models via the Vercel AI SDK or have reliable text extraction + clear size caps so seed requests stay fast and predictable.

## Out of scope
- Faithful verbatim chunking/reader-mode import of `.pdf` or `.md` files without LLM synthesis (deferred to a dedicated future phase).
- Cleaning up or reformatting the saved raw pasted-text attachment itself (saved and viewed as-is).
- Whole-textbook ingestion or automatic multi-document splitting from a single upload.
- Re-injecting the raw attachment into subsequent `Ask Cell` / `Integrate` bounded contexts.

## Ready for /specify?
Yes. Ready to add as Phase 09 in `docs/sdlc/phases.md` and run `/loop-phase`.
