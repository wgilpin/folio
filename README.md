# Folio

**Folio** is a local-first, concept-block notebook designed for learning rigorous technical subjects (such as physics, mathematics, and computer science) with frontier reasoning models. Instead of losing insights in meandering, disposable chat transcripts, Folio synthesizes every session into durable, self-contained reference documents on disk.

---

## Key Features

- **Concept Blocks**: Documents are structured into discrete, focused concept blocks rendered with Markdown, LaTeX/KaTeX math (`$H(q, p)$`, `$$\dots$$`), and Mermaid diagrams.
- **Bounded-Context Inline Chat ("Ask Cell")**: Open ephemeral Q&A drawers scoped strictly to the current cell, adjacent context ($N-1, N, N+1$), and the ancestor Table of Contents tree.
- **Integrate, Branch, or Discard Resolution**:
  - **Integrate**: Directly updates target cells, inserts new blocks, and stages suggested edits on adjacent blocks into an explicit diff review gate.
  - **Branch Doc**: Spins off a sub-document deep-dive from a chat thread, linking it seamlessly via relative Markdown links and sidebar tree navigation.
  - **Discard**: Closes chat sessions cleanly without altering existing notes.
- **Document-Level Chat ("Ask Notebook")**: Query and synthesize across the entire active document.
- **Clean Markdown on Disk**: Notebooks are stored as plain `.md` files using unobtrusive HTML comment delimiters (`<!-- folio:block id="..." -->`), paired with a lightweight `.folio/` sidecar for transient state and hierarchy. Files remain 100% readable in standard Markdown editors and version control.
- **Manual Editing Freedom**: Full inline raw Markdown editing, block splitting, merging, and deletion without requiring LLM intervention.
- **Bring Your Own Model (BYOM)**: Built on the Vercel AI SDK, supporting Anthropic (Claude), Google (Gemini), and OpenAI frontier reasoning models.
- **Learner Profiles & Prerequisites**: Tailor pedagogical depth and surface prerequisite concept chips to explore prior knowledge.

---

## Prerequisites

- **Node.js**: v20.x or v24.x LTS recommended
- **npm**: v10+ (bundled with Node.js)
- **API Key**: At least one API key for your chosen model provider:
  - Anthropic (`ANTHROPIC_API_KEY`)
  - Google Gemini (`GOOGLE_GENERATIVE_AI_API_KEY`)
  - OpenAI (`OPENAI_API_KEY`)

---

## Getting Started (Run Locally)

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/your-username/folio.git
cd folio
npm install
```

### 2. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Open `.env` and set your active model and corresponding API key. For example:

```env
# Active frontier model (<provider>:<model-id>)
# Supported providers: anthropic, google (or gemini), openai
FOLIO_MODEL=anthropic:claude-opus-4-6

# Provider API keys (set the key for your active provider)
ANTHROPIC_API_KEY=sk-ant-...
# GOOGLE_GENERATIVE_AI_API_KEY=...
# OPENAI_API_KEY=sk-...

# Optional: custom port (defaults to 4321) and workspace directory (defaults to ./workspace)
# PORT=4321
# FOLIO_WORKSPACE=./workspace
```

### 3. Start the local development server

```bash
npm run dev
```

This starts the Vite development server with the integrated Hono API plugin.

### 4. Open Folio in your browser

Navigate to:

```
http://127.0.0.1:4321
```

Enter a topic prompt to seed your first notebook!

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts Vite dev server with integrated Hono API backend at `http://127.0.0.1:4321` |
| `npm run serve` | Runs the standalone Hono Node backend server (`src/server/index.ts`) |
| `npm test` | Runs the test suite with Vitest |
| `npm run build` | Compiles TypeScript and builds the client bundle with Vite |
| `npm run typecheck` | Runs TypeScript compiler checks without emitting code |

---

## Project Structure

```
folio/
├── docs/                # Architecture decisions (ADRs) and SDLC specifications
├── src/
│   ├── client/          # React 19 frontend (workbench, drawers, diff gate, tree navigation)
│   ├── server/          # Hono backend API, Markdown parser/serializer, store, and LLM adapters
│   └── shared/          # Shared Zod schemas and TypeScript type contracts
├── workspace/           # Default directory for generated Markdown notebooks & .folio/ sidecar
├── .env.example         # Environment template for model selection and API keys
├── package.json
├── tsconfig.json
└── vite.config.ts       # Vite config with Hono API middleware integration
```
