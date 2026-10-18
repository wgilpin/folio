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

    // Verify .folio/notebook.json persisted cleared activeChat and staged pendingEdits
    const sidecarRaw = JSON.parse(
      await fs.readFile(path.join(tempDir, '.folio', 'notebook.json'), 'utf-8')
    );
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
});
