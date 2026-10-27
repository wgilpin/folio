import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { serializeMarkdownBlocks } from '../markdown.js';
import { WorkspaceStore } from '../store.js';

describe('SQLite Library Store & Auto-Generated README.md Index (Phase 06 Epic 01)', () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-sqlite-readme-')
    );
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('migrates legacy .folio/notebook.json into .folio/library.sqlite and persists subsequent mutations in SQLite', async () => {
    // 1. Seed a legacy .folio/notebook.json and Markdown files on disk (AC-1)
    const folioDir = path.join(workspaceDir, '.folio');
    await fs.mkdir(folioDir, { recursive: true });

    const rootBlocks = [
      {
        id: 'blk_00',
        markdown:
          '## 0. Prerequisites & Foundations\n\n- **Noether Theorem**: Continuous symmetries and conservation laws.\n- **Calculus of Variations**: Functional stationarity.',
      },
      {
        id: 'blk_01',
        markdown:
          '# Lagrangian Mechanics\n\nThe action functional is $S[q] = \\int L(q, \\dot{q}, t)\\,dt$.',
      },
      {
        id: 'blk_02',
        markdown:
          '## 1. Euler-Lagrange Equations\n\nStationarity $\\delta S = 0$ yields the equations of motion.',
      },
    ];

    const childBlocks = [
      {
        id: 'blk_00',
        markdown:
          '## 0. Prerequisites & Foundations\n\n- **Lie Groups**: Continuous transformation groups.',
      },
      {
        id: 'blk_01',
        markdown:
          '# Noether Theorem\n\nEvery differentiable symmetry of the action generates a conserved current.',
      },
    ];

    await fs.writeFile(
      path.join(workspaceDir, 'lagrangian-mechanics.md'),
      serializeMarkdownBlocks(rootBlocks),
      'utf-8'
    );
    await fs.writeFile(
      path.join(workspaceDir, 'noether-theorem.md'),
      serializeMarkdownBlocks(childBlocks),
      'utf-8'
    );

    const legacyNotebookJson = {
      documents: {
        'lagrangian-mechanics': {
          id: 'lagrangian-mechanics',
          title: 'Lagrangian Mechanics: Action Principles',
          shortTitle: 'Lagrangian Mechanics',
          filename: 'lagrangian-mechanics.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: ['noether-theorem'],
          prerequisites: ['Noether Theorem', 'Calculus of Variations'],
          prerequisiteDocIds: {
            'Noether Theorem': 'noether-theorem',
          },
        },
        'noether-theorem': {
          id: 'noether-theorem',
          title: 'Noether Theorem',
          filename: 'noether-theorem.md',
          parentId: 'lagrangian-mechanics',
          parentBlockId: 'blk_00',
          childDocIds: [],
          prerequisites: ['Lie Groups'],
        },
      },
      pendingEdits: [
        {
          id: 'edit_01',
          docId: 'lagrangian-mechanics',
          blockId: 'blk_02',
          originalMarkdown:
            '## 1. Euler-Lagrange Equations\n\nStationarity $\\delta S = 0$ yields the equations of motion.',
          proposedMarkdown:
            '## 1. Euler-Lagrange Equations\n\nStationarity $\\delta S = 0$ yields $\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}} - \\frac{\\partial L}{\\partial q} = 0$.',
          reason: 'Write out the explicit Euler-Lagrange differential equation.',
          sourceBlockId: 'blk_01',
        },
      ],
      activeChat: {
        docId: 'noether-theorem',
        blockId: 'blk_01',
        modelId: 'anthropic:claude-opus-4-6',
        messages: [
          { role: 'user', content: 'How does time translation invariance work?' },
          {
            role: 'assistant',
            content: 'Time translation invariance implies conservation of energy.',
          },
        ],
      },
      settings: {
        modelId: 'openai:gpt-5.4',
        reasoningEffort: 'medium',
        activeProfileId: 'rigorous-derivation',
        customSystemPrompt: 'Always include index notation.',
      },
      activeDocId: 'lagrangian-mechanics',
      topicDocIds: {
        'Noether Theorem': 'noether-theorem',
      },
    };

    const legacyJsonPath = path.join(folioDir, 'notebook.json');
    await fs.writeFile(
      legacyJsonPath,
      JSON.stringify(legacyNotebookJson, null, 2),
      'utf-8'
    );

    // 2. Request GET /api/doc and verify migration to .folio/library.sqlite
    const app = createApp({ workspaceDir });
    const getRes = await app.request('/api/doc');
    expect(getRes.status).toBe(200);
    const body = await getRes.json();

    expect(body.document.id).toBe('lagrangian-mechanics');
    expect(body.document.prerequisiteDocIds).toEqual({
      'Noether Theorem': 'noether-theorem',
    });
    expect(body.documents['noether-theorem'].parentId).toBe(
      'lagrangian-mechanics'
    );
    expect(body.pendingEdits).toHaveLength(1);
    expect(body.pendingEdits[0].id).toBe('edit_01');
    expect(body.settings).toEqual({
      modelId: 'openai:gpt-5.4',
      reasoningEffort: 'medium',
      activeProfileId: 'rigorous-derivation',
      customSystemPrompt: 'Always include index notation.',
    });

    // Verify .folio/library.sqlite exists and .folio/notebook.json was archived to .folio/notebook.json.bak
    const sqlitePath = path.join(folioDir, 'library.sqlite');
    const bakPath = path.join(folioDir, 'notebook.json.bak');
    await expect(fs.access(sqlitePath)).resolves.toBeUndefined();
    await expect(fs.access(bakPath)).resolves.toBeUndefined();
    await expect(fs.access(legacyJsonPath)).rejects.toThrow();

    // Verify relational tables in .folio/library.sqlite directly
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    const docRows = db
      .prepare('SELECT id, title, parent_id FROM documents ORDER BY id')
      .all() as Array<{ id: string; title: string; parent_id: string | null }>;
    expect(docRows).toEqual([
      {
        id: 'lagrangian-mechanics',
        title: 'Lagrangian Mechanics: Action Principles',
        parent_id: null,
      },
      {
        id: 'noether-theorem',
        title: 'Noether Theorem',
        parent_id: 'lagrangian-mechanics',
      },
    ]);

    const blockRows = db
      .prepare(
        'SELECT doc_id, block_id, sort_order FROM blocks WHERE doc_id = ? ORDER BY sort_order'
      )
      .all('lagrangian-mechanics') as Array<{
      doc_id: string;
      block_id: string;
      sort_order: number;
    }>;
    expect(blockRows.map((r) => r.block_id)).toEqual([
      'blk_00',
      'blk_01',
      'blk_02',
    ]);

    const topicLinkRows = db
      .prepare('SELECT topic, target_doc_id FROM topic_links')
      .all() as Array<{ topic: string; target_doc_id: string }>;
    expect(topicLinkRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          topic: 'Noether Theorem',
          target_doc_id: 'noether-theorem',
        }),
      ])
    );
    db.close();

    // 3. Verify subsequent mutations persist across fresh WorkspaceStore instances via SQLite (AC-2)
    const acceptRes = await app.request('/api/edits/edit_01/accept', {
      method: 'POST',
    });
    expect(acceptRes.status).toBe(200);

    const freshStore = new WorkspaceStore(workspaceDir);
    const reloadedRoot = await freshStore.loadDocument('lagrangian-mechanics');
    expect(reloadedRoot.pendingEdits).toHaveLength(0);
    expect(reloadedRoot.blocks[2].markdown).toContain(
      '\\frac{d}{dt}\\frac{\\partial L}{\\partial \\dot{q}}'
    );

    const reloadedChild = await freshStore.loadDocument('noether-theorem');
    expect(reloadedChild.activeChat?.messages).toHaveLength(2);
    expect(reloadedChild.activeChat?.messages[1].content).toContain(
      'conservation of energy'
    );
  });

  it('generates and updates a hierarchical README.md index on seed, branch, block edit, and document delete', async () => {
    const app = createApp({
      workspaceDir,
      seedGenerator: async (prompt) => ({
        title: `${prompt}: Variational Mechanics`,
        shortTitle: prompt,
        toc: ['1. Action Principle', '2. Phase Space Structure'],
        prerequisites: ['Vector Calculus', 'Differential Equations'],
        blocks: [
          '## 0. Prerequisites & Foundations\n\n- **Vector Calculus**: Gradient and divergence.\n- **Differential Equations**: Initial value problems.',
          `# ${prompt}: Variational Mechanics\n\nCore variational formulation.`,
          '## 1. Action Principle\n\nStationary action paths.',
          '## 2. Phase Space Structure\n\nLegendre transform to Hamiltonian.',
        ],
      }),
      branchGenerator: async () => ({
        title: 'Canonical Transformations: Symplectic Maps',
        shortTitle: 'Canonical Transformations',
        toc: ['1. Generating Functions', '2. Poisson Brackets'],
        prerequisites: ['Hamiltonian Mechanics'],
        blocks: [
          '## 0. Prerequisites & Foundations\n\n- **Hamiltonian Mechanics**: Phase space flow.',
          '# Canonical Transformations: Symplectic Maps\n\nPreserving the symplectic form.',
          '## 1. Generating Functions\n\nType 1 through Type 4 generators.',
          '## 2. Poisson Brackets\n\nAlgebraic invariants of phase space.',
        ],
      }),
      cellChatGenerator: async () => 'Let us branch Canonical Transformations.',
    });

    // 1. Seed root document
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Analytical Mechanics' }),
    });
    expect(seedRes.status).toBe(200);

    const readmePath = path.join(workspaceDir, 'README.md');
    let readmeContent = await fs.readFile(readmePath, 'utf-8');
    expect(readmeContent).toContain(
      '[Analytical Mechanics: Variational Mechanics](analytical-mechanics.md)'
    );
    expect(readmeContent).toContain('1. Action Principle');
    expect(readmeContent).toContain('2. Phase Space Structure');

    // 2. Chat and branch a child sub-document
    await app.request('/api/blocks/blk_03/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain canonical transformations in detail',
        docId: 'analytical-mechanics',
      }),
    });

    const branchRes = await app.request('/api/blocks/blk_03/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'analytical-mechanics' }),
    });
    expect(branchRes.status).toBe(200);

    readmeContent = await fs.readFile(readmePath, 'utf-8');
    expect(readmeContent).toContain(
      '[Analytical Mechanics: Variational Mechanics](analytical-mechanics.md)'
    );
    expect(readmeContent).toContain(
      '[Canonical Transformations: Symplectic Maps](canonical-transformations.md)'
    );
    expect(readmeContent).toContain('1. Generating Functions');

    // Ensure README.md is never resolved as a user document
    const store = new WorkspaceStore(workspaceDir);
    const resolvedWhenAskingReadme = await store.resolveDocId('README.md');
    expect(resolvedWhenAskingReadme).not.toBe('README');
    expect(resolvedWhenAskingReadme).not.toBe('readme');

    // 3. Edit a block heading and verify README.md reflects updated ToC
    const editRes = await app.request('/api/blocks/blk_03', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId: 'analytical-mechanics',
        markdown:
          '## 1. Hamilton Principle of Stationary Action\n\nUpdated stationary action section.',
      }),
    });
    expect(editRes.status).toBe(200);

    readmeContent = await fs.readFile(readmePath, 'utf-8');
    expect(readmeContent).toContain(
      '1. Hamilton Principle of Stationary Action'
    );
    expect(readmeContent).not.toContain('1. Action Principle');

    // 4. Delete the child sub-document and verify it is removed from README.md
    const delRes = await app.request('/api/doc/canonical-transformations', {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);

    readmeContent = await fs.readFile(readmePath, 'utf-8');
    expect(readmeContent).toContain(
      '[Analytical Mechanics: Variational Mechanics](analytical-mechanics.md)'
    );
    expect(readmeContent).not.toContain('canonical-transformations.md');
    expect(readmeContent).not.toContain(
      'Canonical Transformations: Symplectic Maps'
    );
  });
});
