import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceStore } from '../store.js';
import { createApp } from '../app.js';
import type { CellChatGenerator, IntegrateGenerator } from '../llm.js';

describe('Multi-Cell Integrate & Synchronous Diff Resolution Gate API', () => {
  let tempDir: string;
  let store: WorkspaceStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-integrate-api-test-')
    );
    store = new WorkspaceStore(tempDir);

    await store.saveDocument('Hamiltonian Mechanics', [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
      },
      {
        id: 'blk_02',
        markdown:
          '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.',
      },
      {
        id: 'blk_03',
        markdown: '## 3. Canonical Equations\n\nSymplectic time evolution.',
      },
      {
        id: 'blk_04',
        markdown: '## 4. Liouville Theorem\n\nPhase space volume is invariant.',
      },
    ]);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('POST /api/blocks/:id/integrate updates block N, inserts new blocks after N, stages valid N-1/N+1 suggestedEdits, and drops out-of-window edits', async () => {
    const capturedIntegrateCalls: Parameters<IntegrateGenerator>[0][] = [];

    const mockCellChatGenerator: CellChatGenerator = async () =>
      'When the Hessian is singular, we get primary constraints.';

    const mockIntegrateGenerator: IntegrateGenerator = async (input) => {
      capturedIntegrateCalls.push(input);
      return {
        updatedBlockMarkdown:
          '## 2. Legendre Transform\n\nMaps velocities $\\dot{q}$ to canonical momenta $p = \\partial L / \\partial \\dot{q}$ when the Hessian is non-singular.',
        insertedBlocksMarkdown: [
          '## 2a. Singular Lagrangians\n\nWhen $\\det(\\partial^2 L / \\partial \\dot{q}^2) = 0$, primary constraints arise.',
        ],
        suggestedEdits: [
          {
            // No-op edit (identical to current blk_01 markdown) -> should be dropped (AC-2)
            targetBlockId: 'blk_01',
            proposedMarkdown:
              '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
            reason: 'No actual change',
          },
          {
            // Valid N+1 edit -> should be staged (AC-1)
            targetBlockId: 'blk_03',
            proposedMarkdown:
              '## 3. Canonical Equations\n\nFor regular Lagrangians, symplectic time evolution governs $(q, p)$.',
            reason:
              'Align transition with new Singular Lagrangians section above.',
          },
          {
            // Out-of-window edit (blk_04 is N+2 when integrating blk_02) -> should be dropped (AC-2)
            targetBlockId: 'blk_04',
            proposedMarkdown:
              '## 4. Liouville Theorem\n\nModified out of window.',
            reason: 'Out of window N+2 target.',
          },
        ],
      };
    };

    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: mockCellChatGenerator,
      integrateGenerator: mockIntegrateGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    // 1. Start an active chat on blk_02
    const chatRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What happens if the Hessian is singular?',
      }),
    });
    expect(chatRes.status).toBe(200);

    // 2. Integrate the chat on blk_02
    const intRes = await app.request('/api/blocks/blk_02/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();

    // Verify integrateGenerator received bounded context and activeChat messages
    expect(capturedIntegrateCalls).toHaveLength(1);
    expect(capturedIntegrateCalls[0].modelId).toBe('anthropic:claude-opus-4-6');
    expect(capturedIntegrateCalls[0].context.previousBlock?.id).toBe('blk_01');
    expect(capturedIntegrateCalls[0].context.targetBlock.id).toBe('blk_02');
    expect(capturedIntegrateCalls[0].context.nextBlock?.id).toBe('blk_03');
    expect(capturedIntegrateCalls[0].messages).toEqual([
      {
        role: 'user',
        content: 'What happens if the Hessian is singular?',
      },
      {
        role: 'assistant',
        content: 'When the Hessian is singular, we get primary constraints.',
      },
    ]);

    // Verify block N updated and new block inserted immediately after blk_02
    expect(intBody.blocks).toHaveLength(5);
    expect(intBody.blocks[0].id).toBe('blk_01');
    expect(intBody.blocks[1]).toEqual({
      id: 'blk_02',
      markdown:
        '## 2. Legendre Transform\n\nMaps velocities $\\dot{q}$ to canonical momenta $p = \\partial L / \\partial \\dot{q}$ when the Hessian is non-singular.',
    });
    expect(intBody.blocks[2].id).toBe('blk_05');
    expect(intBody.blocks[2].markdown).toBe(
      '## 2a. Singular Lagrangians\n\nWhen $\\det(\\partial^2 L / \\partial \\dot{q}^2) = 0$, primary constraints arise.'
    );
    // blk_03 is untouched in index.md until its pending edit is accepted
    expect(intBody.blocks[3]).toEqual({
      id: 'blk_03',
      markdown: '## 3. Canonical Equations\n\nSymplectic time evolution.',
    });
    expect(intBody.blocks[4].id).toBe('blk_04');

    // Verify activeChat was cleared
    expect(intBody.activeChat).toBeNull();

    // Verify only the valid N+1 edit (blk_03) was staged into pendingEdits
    expect(intBody.pendingEdits).toEqual([
      {
        id: 'edit_01',
        docId: 'index',
        blockId: 'blk_03',
        originalMarkdown:
          '## 3. Canonical Equations\n\nSymplectic time evolution.',
        proposedMarkdown:
          '## 3. Canonical Equations\n\nFor regular Lagrangians, symplectic time evolution governs $(q, p)$.',
        reason:
          'Align transition with new Singular Lagrangians section above.',
        sourceBlockId: 'blk_02',
      },
    ]);

    // Verify store persisted cleared activeChat and staged pendingEdits
    const sidecarRaw = await store.loadState();
    expect(sidecarRaw.activeChat).toBeNull();
    expect(sidecarRaw.pendingEdits).toEqual(intBody.pendingEdits);

    // Verify index.md on disk has blk_02 updated and blk_05 inserted right after blk_02
    const diskLoaded = await store.loadDocument('index');
    expect(diskLoaded.blocks.map((b) => b.id)).toEqual([
      'blk_01',
      'blk_02',
      'blk_05',
      'blk_03',
      'blk_04',
    ]);
  });

  it('enforces 409 synchronous edit resolution gate when pendingEdits exist and resolves via accept and reject endpoints', async () => {
    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () => 'Assistant reply.',
      integrateGenerator: async () => ({
        updatedBlockMarkdown:
          '## 2. Legendre Transform\n\nUpdated with explicit notation $(Q, P)$.',
        insertedBlocksMarkdown: [],
        suggestedEdits: [
          {
            targetBlockId: 'blk_01',
            proposedMarkdown:
              '## 1. Phase Space\n\nCoordinates $(Q, P)$ define the canonical state.',
            reason: 'Match uppercase $(Q, P)$ notation introduced in Block 2.',
          },
          {
            targetBlockId: 'blk_03',
            proposedMarkdown:
              '## 3. Canonical Equations\n\nSymplectic time evolution in $(Q, P)$.',
            reason: 'Match uppercase $(Q, P)$ notation in Block 3.',
          },
        ],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Start chat and integrate to produce 2 pending edits (edit_01 on blk_01, edit_02 on blk_03)
    await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Use uppercase (Q, P) notation.' }),
    });

    const intRes = await app.request('/api/blocks/blk_02/integrate', {
      method: 'POST',
    });
    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();
    expect(intBody.pendingEdits).toHaveLength(2);
    expect(intBody.pendingEdits[0].id).toBe('edit_01');
    expect(intBody.pendingEdits[1].id).toBe('edit_02');

    // AC-3: Attempt POST /api/blocks/:id/chat while pendingEdits exist -> 409
    const gatedChatRes = await app.request('/api/blocks/blk_01/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Can I start another chat?' }),
    });
    expect(gatedChatRes.status).toBe(409);
    expect(await gatedChatRes.json()).toEqual({
      error: 'Resolve pending suggested edits first',
    });

    // AC-3: Attempt POST /api/blocks/:id/integrate while pendingEdits exist -> 409
    const gatedIntegrateRes = await app.request('/api/blocks/blk_02/integrate', {
      method: 'POST',
    });
    expect(gatedIntegrateRes.status).toBe(409);
    expect(await gatedIntegrateRes.json()).toEqual({
      error: 'Resolve pending suggested edits first',
    });

    // AC-4: Accept edit_01 (targets blk_01)
    const acceptRes = await app.request('/api/edits/edit_01/accept', {
      method: 'POST',
    });
    expect(acceptRes.status).toBe(200);
    const acceptBody = await acceptRes.json();

    expect(
      acceptBody.blocks.find((b: { id: string }) => b.id === 'blk_01').markdown
    ).toBe(
      '## 1. Phase Space\n\nCoordinates $(Q, P)$ define the canonical state.'
    );
    expect(acceptBody.pendingEdits).toHaveLength(1);
    expect(acceptBody.pendingEdits[0].id).toBe('edit_02');

    // Gate still active while edit_02 remains unresolved
    const stillGatedRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Still gated?' }),
    });
    expect(stillGatedRes.status).toBe(409);

    // AC-4: Reject edit_02 (targets blk_03)
    const rejectRes = await app.request('/api/edits/edit_02/reject', {
      method: 'POST',
    });
    expect(rejectRes.status).toBe(200);
    const rejectBody = await rejectRes.json();

    // blk_03 remains unchanged in index.md
    expect(
      rejectBody.blocks.find((b: { id: string }) => b.id === 'blk_03').markdown
    ).toBe('## 3. Canonical Equations\n\nSymplectic time evolution.');
    expect(rejectBody.pendingEdits).toEqual([]);

    // Verify disk state after both edits resolved
    const diskDoc = await store.loadDocument('index');
    expect(diskDoc.pendingEdits).toEqual([]);
    expect(diskDoc.blocks.find((b) => b.id === 'blk_01')?.markdown).toBe(
      '## 1. Phase Space\n\nCoordinates $(Q, P)$ define the canonical state.'
    );
    expect(diskDoc.blocks.find((b) => b.id === 'blk_03')?.markdown).toBe(
      '## 3. Canonical Equations\n\nSymplectic time evolution.'
    );

    // Gate is now lifted: new chat succeeds with 200
    const unlockedChatRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Gate should be open now!' }),
    });
    expect(unlockedChatRes.status).toBe(200);
  });

  it('creates a new card below blk_00 rather than expanding prerequisites when integrating a conceptual chat on blk_00', async () => {
    const initialBlk00 =
      '## 0. Prerequisites & Notation\n\n- **Lagrangian Mechanics**: Action principle.\n- **Vector Calculus**: Gradients and curl.';

    await store.saveDocument(
      'Hamiltonian Mechanics',
      [
        {
          id: 'blk_00',
          markdown: initialBlk00,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
        },
      ],
      {
        prerequisites: ['Lagrangian Mechanics', 'Vector Calculus'],
      }
    );

    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () =>
        'The action principle states that physical trajectories extremize the action integral.',
      // Even if the generator attempts to expand blk_00 via updatedBlockMarkdown, integrate must create a new card below instead of expanding blk_00
      integrateGenerator: async () => ({
        updatedBlockMarkdown: `${initialBlk00}\n\n## Intuition for the Action Principle\n\nPhysical paths make the action $S = \\int L\\,dt$ stationary.`,
        insertedBlocksMarkdown: [],
        suggestedEdits: [],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/blocks/blk_00/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can you explain the action principle in more detail?',
      }),
    });

    const intRes = await app.request('/api/blocks/blk_00/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();

    // blk_00 remains unexpanded, and a new block is created immediately below blk_00
    expect(intBody.blocks).toHaveLength(3);
    expect(intBody.blocks[0]).toEqual({
      id: 'blk_00',
      markdown: initialBlk00,
    });
    expect(intBody.blocks[1].id).toBe('blk_03');
    expect(intBody.blocks[1].markdown).toBe(
      '## Intuition for the Action Principle\n\nPhysical paths make the action $S = \\int L\\,dt$ stationary.'
    );
    expect(intBody.blocks[2].id).toBe('blk_01');
    expect(intBody.document.prerequisites).toEqual([
      'Lagrangian Mechanics',
      'Vector Calculus',
    ]);
  });

  it('expands blk_00 and updates document.prerequisites only when integrating a chat that adds new prerequisites', async () => {
    const initialBlk00 =
      '## 0. Prerequisites & Notation\n\n- **Lagrangian Mechanics**: Action principle.\n- **Vector Calculus**: Gradients and curl.';

    await store.saveDocument(
      'Hamiltonian Mechanics',
      [
        {
          id: 'blk_00',
          markdown: initialBlk00,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
        },
      ],
      {
        prerequisites: ['Lagrangian Mechanics', 'Vector Calculus'],
      }
    );

    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () =>
        'Yes, Differential Forms are also a key prerequisite for symplectic geometry.',
      integrateGenerator: async () => ({
        updatedBlockMarkdown: `${initialBlk00}\n- **Differential Forms**: Exterior derivative and 2-forms.`,
        insertedBlocksMarkdown: [],
        addedPrerequisites: ['Differential Forms'],
        suggestedEdits: [],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/blocks/blk_00/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Add Differential Forms to the prerequisites.',
      }),
    });

    const intRes = await app.request('/api/blocks/blk_00/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();

    expect(intBody.blocks).toHaveLength(2);
    expect(intBody.blocks[0]).toEqual({
      id: 'blk_00',
      markdown: `${initialBlk00}\n- **Differential Forms**: Exterior derivative and 2-forms.`,
    });
    expect(intBody.document.prerequisites).toEqual([
      'Lagrangian Mechanics',
      'Vector Calculus',
      'Differential Forms',
    ]);
  });

  it('integrating a chat on blk_00 explaining multiple prerequisites creates separate ConceptBlock cards below blk_00 without expanding blk_00', async () => {
    const initialBlk00 =
      '## 0. Prerequisites & Notation\n\n- **Linear Algebra**: Vectors and matrices.\n- **Multivariable Calculus**: Gradients.\n- **Probability**: Distributions.';

    await store.saveDocument(
      'Quantum Computing',
      [
        {
          id: 'blk_00',
          markdown: initialBlk00,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Qubits\n\nSuperposition state $|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle$.',
        },
      ],
      {
        id: 'index',
        filename: 'index.md',
        prerequisites: ['Linear Algebra', 'Multivariable Calculus', 'Probability'],
      }
    );

    // Case 1: Returned as 3 items in insertedBlocksMarkdown
    let app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () => 'Explanations for all 3 prerequisites.',
      integrateGenerator: async () => ({
        updatedBlockMarkdown: null,
        insertedBlocksMarkdown: [
          '## 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.',
          '## 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.',
          '## 0c. Probability Foundations\n\nBorn rule and probability amplitudes.',
        ],
        suggestedEdits: [],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/blocks/blk_00/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain all 3 prerequisites: Linear Algebra, Multivariable Calculus, and Probability.',
        docId: 'index',
      }),
    });

    let res = await app.request('/api/blocks/blk_00/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });
    expect(res.status).toBe(200);
    let body = await res.json();

    // blk_00 should remain intact and unexpanded
    expect(body.blocks[0]).toEqual({
      id: 'blk_00',
      markdown: initialBlk00,
    });
    // 3 separate ConceptBlock cards inserted below blk_00
    expect(body.blocks).toHaveLength(5);
    expect(body.blocks[1].markdown).toBe(
      '## 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.'
    );
    expect(body.blocks[2].markdown).toBe(
      '## 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.'
    );
    expect(body.blocks[3].markdown).toBe(
      '## 0c. Probability Foundations\n\nBorn rule and probability amplitudes.'
    );
    expect(body.blocks[4].id).toBe('blk_01');

    // Case 2: Returned as a single multi-section string inside updatedBlockMarkdown on blk_00
    // Reset document back to 2 blocks
    await store.saveDocument(
      'Quantum Computing',
      [
        {
          id: 'blk_00',
          markdown: initialBlk00,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Qubits\n\nSuperposition state $|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle$.',
        },
      ],
      {
        id: 'index',
        filename: 'index.md',
        prerequisites: ['Linear Algebra', 'Multivariable Calculus', 'Probability'],
      }
    );

    app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () => 'Explanations for all 3 prerequisites.',
      integrateGenerator: async () => ({
        // LLM mistakenly put all 3 sections into updatedBlockMarkdown instead of insertedBlocksMarkdown
        updatedBlockMarkdown: [
          '## 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.',
          '',
          '## 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.',
          '',
          '## 0c. Probability Foundations\n\nBorn rule and probability amplitudes.',
        ].join('\n'),
        insertedBlocksMarkdown: [],
        suggestedEdits: [],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/blocks/blk_00/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain all 3 prerequisites in detail.',
        docId: 'index',
      }),
    });

    res = await app.request('/api/blocks/blk_00/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });
    expect(res.status).toBe(200);
    body = await res.json();

    // blk_00 must not be expanded, and 3 separate ConceptBlock cards must be created below it
    expect(body.blocks[0]).toEqual({
      id: 'blk_00',
      markdown: initialBlk00,
    });
    expect(body.blocks).toHaveLength(5);
    expect(body.blocks[1].markdown).toBe(
      '## 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.'
    );
    expect(body.blocks[2].markdown).toBe(
      '## 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.'
    );
    expect(body.blocks[3].markdown).toBe(
      '## 0c. Probability Foundations\n\nBorn rule and probability amplitudes.'
    );
    expect(body.blocks[4].id).toBe('blk_01');

    // Case 3: Returned as a single string with ### headers inside insertedBlocksMarkdown
    await store.saveDocument(
      'Quantum Computing',
      [
        {
          id: 'blk_00',
          markdown: initialBlk00,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Qubits\n\nSuperposition state $|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle$.',
        },
      ],
      {
        id: 'index',
        filename: 'index.md',
        prerequisites: ['Linear Algebra', 'Multivariable Calculus', 'Probability'],
      }
    );

    app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () => 'Explanations for all 3 prerequisites.',
      integrateGenerator: async () => ({
        updatedBlockMarkdown: null,
        insertedBlocksMarkdown: [
          [
            '### 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.',
            '',
            '### 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.',
            '',
            '### 0c. Probability Foundations\n\nBorn rule and probability amplitudes.',
          ].join('\n'),
        ],
        suggestedEdits: [],
      }),
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/blocks/blk_00/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Explain all 3 prerequisites in detail.',
        docId: 'index',
      }),
    });

    res = await app.request('/api/blocks/blk_00/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });
    expect(res.status).toBe(200);
    body = await res.json();

    expect(body.blocks[0]).toEqual({
      id: 'blk_00',
      markdown: initialBlk00,
    });
    expect(body.blocks).toHaveLength(5);
    expect(body.blocks[1].markdown).toBe(
      '## 0a. Linear Algebra Foundations\n\nHilbert spaces and unitary matrices.'
    );
    expect(body.blocks[2].markdown).toBe(
      '## 0b. Multivariable Calculus Foundations\n\nInner product gradient operators.'
    );
    expect(body.blocks[3].markdown).toBe(
      '## 0c. Probability Foundations\n\nBorn rule and probability amplitudes.'
    );
  });
});

