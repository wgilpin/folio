# Concept-Block Notebook (Interactive Live Book)

## Problem
Linear LLM chats are poorly suited for structured learning and synthesis: context scrolls off the top, sub-questions derail the main thread, and the session ends as a meandering transcript rather than a reusable reference artifact. Without a change, learning sessions fail to compound into a durable, readable knowledge base, forcing the user to either manually copy-paste and edit fragments into separate notes or abandon the chat history altogether.

## Proposed change
A non-mathematical, block-based document workbench (a "Jupyter Notebook for prose and concepts") that builds a hierarchical tree of standalone, readable documents (e.g., HTML or Markdown-backed pages) powered by user-selectable frontier LLMs. An initial topic prompt generates a sequence of "concept blocks" (each holding a coherent unit such as a paragraph, a list, or an introductory sentence plus a Mermaid diagram and explanation). The user can open an inline chat on any individual cell to ask questions, refine the framing, or request diagrams. Every cell chat is ephemeral and resolves through one of three explicit exit actions: **Integrate** (mutating the current cell, spawning new cells, or proposing diff-style suggested edits to adjacent cells), **Branch to sub-document** (creating a child page in the document tree to explore a sub-topic in depth), or **Discard** (closing the Q&A thread once the user's question is answered without altering the text).

## Key decisions made during exploration
- **Concept blocks as the unit of granularity**: Cells are defined semantically as "concept blocks" rather than strict single HTML/Markdown elements, allowing a single cell to encapsulate a paragraph or a tightly coupled bundle of introductory text, a Mermaid diagram, and explanatory bullets.
- **Standalone readability outside the tool**: The persisted artifact is a hierarchical tree of documents (such as clean HTML or Markdown) that functions as a self-contained "live book" readable without an active LLM or custom runtime, while supporting interactive cell-level editing when opened in the workbench.
- **Three-state ephemeral chat lifecycle**: Inline cell chats are temporary workbenches rather than permanent margin clutter. Concluding a chat requires choosing between integrating the result into the current document, branching it into a child sub-document, or discarding it as a transient Q&A session.
- **Bounded context via Ancestor ToC + Sliding Window**: When interacting with cell $N$, the LLM context is scoped to the Table of Contents of the current document, the ancestor Tables of Contents up to the root of the topic tree, and the immediately preceding and following cells ($N-1$, $N$, $N+1$). This prevents duplicate explanations and maintains narrative awareness without passing the entire book into the context window.
- **Direct vs. suggested write scope**: Integrating a chat on cell $N$ has direct write authority to update cell $N$ or insert new cells immediately below it, while any coherence edits to adjacent cells ($N-1$, $N+1$, or slightly further when required) are emitted as explicit "suggested edits" requiring user approval.
- **Synchronous edit resolution gate**: To prevent state collisions and out-of-order narrative drift across cells, any pending suggested edits must be explicitly accepted or rejected by the user before starting further cell edits.
- **Unconstrained frontier model selection (BYOM)**: Rather than relying on lightweight, cost-optimized models embedded in standard office suites, the workbench allows selecting frontier reasoning models and controlling pedagogical system prompts suited for rigorous technical domains (e.g., advanced physics).

## Open questions
- **On-disk storage format and metadata mapping**: Should the underlying files be saved as self-contained HTML (using semantic tags/attributes to demarcate concept blocks and tree links) or Markdown files paired with a lightweight manifest for the document tree?
- **Initial document generation structure**: When seeding a new topic or branching a sub-document, should the LLM propose an outline/Table of Contents for approval first, or immediately generate the initial sequence of concept blocks?
- **Manual cell manipulation**: Beyond LLM-driven chat edits, should the user be able to directly edit text inline and manually split, merge, or reorder concept blocks?
- **Branching mechanics**: When a cell chat branches into a child sub-document, how is the parent cell updated to link to the child document, and does the inline chat transcript automatically seed the initial generation of that child document?

## Red-team findings
The idea survived red-teaming against two primary challenges:
1. **Out-of-order narrative drift and edit collisions**: The prose equivalent of Jupyter's out-of-order execution problem—where mutating cell $N$ causes narrative contradictions, broken transitions, or overlapping pending diffs in cells $N-1$ and $N+1$—was resolved by pairing a sliding read/write window with a strict synchronous resolution gate. Adjacent cell modifications are surfaced as explicit diff suggestions so the user sees ripple effects immediately, and all pending edits must be accepted or rejected before initiating another cell chat.
2. **Existing word processors with AI (e.g., Google Docs, Notion AI)**: Standard document editors fail this use case on two fronts. First, their embedded AI features are locked to cost-optimized, general-purpose assistant models and hidden system prompts that flatten technical depth, whereas learning complex subjects like advanced physics requires direct access to frontier reasoning models. Second, their UX primitives are mismatched: inline rewrites are one-shot rather than multi-turn exploratory chats, margin comments do not resolve into structured multi-cell integrations or child-document branches, and global sidebars lack deterministic context scoping (Ancestor ToC + $[N-1, N, N+1]$ sliding window).

## Feasibility flags
- **Structured LLM output for multi-cell mutations**: The integration pass requires a reliable structured output schema (or tool-calling contract) capable of simultaneously returning an updated cell $N$, optional newly spawned cells, and targeted diff proposals for $N-1$ / $N+1$ in a single transaction.
- **Ancestor ToC extraction**: Maintaining fast, up-to-date Table of Contents trees across parent and child documents requires either dynamic heading extraction on read or a lightweight index updated on every document save.

## Out of scope
- **Persistent inline chat histories**: Keeping resolved Q&A threads permanently attached to cells was excluded to avoid margin clutter and keep the artifact focused as a clean, readable book.
- **Asynchronous multi-cell background agents**: Allowing multiple cell chats to propose overlapping edits concurrently was excluded in favor of a single-threaded accept/reject gate.
- **Code execution kernels**: Unlike Jupyter, cells do not execute code or maintain runtime variable state; rich outputs are limited to prose, formatting, and declarative diagrams (e.g., Mermaid).

