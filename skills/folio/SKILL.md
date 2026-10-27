---
name: folio
description: Query the user's Folio Concept-Block Notebook library and Central Learner Ability Record across Macs via folio.teleosis.ai (or localhost). Use when calibrating explanations to the user's background, standing learning instructions, or known/completed topics, or when searching and reading Concept Blocks and Markdown documents from Folio.
---

# Folio — Cross-Mac Library & Learner Ability Record Skill

Folio runs as an always-on service at `https://folio.teleosis.ai` (or locally at `http://127.0.0.1:4321`) and stores:
1. **Central Learner Ability Record (`/api/profile`)**: The user's self-supplied background, standing learning instructions, topic familiarity map (`known`, `learning`, `unseen`), and engaged Folio documents with completed Concept Block headings.
2. **Concept-Block Reference Library (`/api/search`, `/api/doc`, `/api/doc/:id/markdown`)**: Self-contained technical reference chapters organized into Concept Blocks with full-text (FTS5) and semantic search.

## Environment Variables

- `FOLIO_URL`: Base URL of the Folio server (defaults to `https://folio.teleosis.ai`; can be set to `http://127.0.0.1:4321` for local development).
- `TELEOSIS_API_KEY` (or `FOLIO_API_KEY`): Bearer token used to authenticate programmatic requests through Caddy (`Authorization: Bearer $TELEOSIS_API_KEY`), bypassing the interactive browser SSO redirect.

## Quick CLI Usage (`folio-query.mjs`)

Run the zero-dependency script from the Folio repository (or copy `skills/folio` into `~/.gemini/config/skills/folio` or `~/.claude/skills/folio`):

```bash
# 1. Read the user's Central Learner Ability Record (background, instructions, topics, engaged sources)
node skills/folio/scripts/folio-query.mjs profile

# 2. Search Concept Blocks across the library (modes: hybrid | fts | semantic)
node skills/folio/scripts/folio-query.mjs search "Hamiltonian phase space" hybrid

# 3. List all documents in the active Folio workspace
node skills/folio/scripts/folio-query.mjs docs

# 4. Fetch clean standalone Markdown for a specific document (strips <!-- folio:block --> comments)
node skills/folio/scripts/folio-query.mjs doc hamiltonian-mechanics
```

## Direct HTTP / `curl` Reference

Any agent on any Mac with `$TELEOSIS_API_KEY` set can query `https://folio.teleosis.ai` directly via `curl`:

### 1. Fetch Central Learner Ability Record
```bash
curl -sS "${FOLIO_URL:-https://folio.teleosis.ai}/api/profile" \
  -H "Authorization: Bearer $TELEOSIS_API_KEY"
```

### 2. Search Concept Blocks (Hybrid FTS5 + Semantic)
```bash
curl -sS "${FOLIO_URL:-https://folio.teleosis.ai}/api/search?q=symplectic+geometry&mode=hybrid&limit=10" \
  -H "Authorization: Bearer $TELEOSIS_API_KEY"
```

### 3. List Documents in the Library Tree
```bash
curl -sS "${FOLIO_URL:-https://folio.teleosis.ai}/api/doc" \
  -H "Authorization: Bearer $TELEOSIS_API_KEY"
```

### 4. Read Clean Standalone Document Markdown
```bash
curl -sS "${FOLIO_URL:-https://folio.teleosis.ai}/api/doc/hamiltonian-mechanics/markdown?clean=true" \
  -H "Authorization: Bearer $TELEOSIS_API_KEY"
```

## Recommended Workflow for Agents

1. **Calibrate First**: Before explaining a complex technical topic, query `/api/profile` (`folio-query.mjs profile`) to check the user's `background`, `learningInstructions`, `topics` (`known` vs `learning`), and `engagedSources`. Skip re-deriving topics already marked `known` or completed in `engagedSources`.
2. **Reuse Existing Notes**: Run `/api/search?q=<topic>&mode=hybrid` (`folio-query.mjs search "<topic>"`) to check if the user already has Concept Blocks covering the topic or its prerequisites.
3. **Read Full Context When Needed**: Fetch `/api/doc/<docId>/markdown?clean=true` (`folio-query.mjs doc <docId>`) to read the clean Markdown chapter and align notation with the user's existing notes.
