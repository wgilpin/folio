# Folio — Concept-Block Notebook

## Problem

Linear LLM chats are poorly suited for structured learning and synthesis. Context scrolls off the top, sub-questions derail the main thread, and the session ends as a meandering transcript rather than a reusable reference. Today, you must either manually copy-paste and edit chat fragments into separate notes or abandon the transcript altogether. Standard AI document editors also fail here because they lock you into lightweight models and lack cell-scoped context or structured multi-cell integration.

## Who it is for

Me. It is a local personal tool for learning rigorous technical subjects (such as advanced physics) using frontier reasoning models and synthesizing those sessions into a durable, self-contained reference book on disk.

## The smallest thing that proves it

A single-document workbench loop: seed a topic prompt into an immediate sequence of 4–8 concept blocks (prose and diagrams), open an ephemeral inline chat on one block to ask a follow-up question, and resolve it via **Integrate** (updating the target block, inserting new blocks below it, and accepting or rejecting suggested diff edits on adjacent blocks) or **Discard**, saving the result as a clean, standalone Markdown document on disk alongside direct manual inline editing (edit, split, merge, delete).

If integrating a chat mangles the surrounding prose or takes more effort to review than manually editing a note beside a chat window, the idea fails.

## Out of scope

- Hosted multi-user web service, accounts, or cloud sync.
- Persistent inline chat histories attached to cells after resolution.
- Asynchronous background agents proposing concurrent edits across cells.
- Code execution kernels or live runtime variable state.

## Open questions

None.
