import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceStore } from '../store.js';
import { createApp } from '../app.js';
import type { CellChatGenerator } from '../llm.js';

describe('Ephemeral Cell Chat API', () => {
  let tempDir: string;
  let store: WorkspaceStore;
  let initialIndexMd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-chat-api-test-'));
    store = new WorkspaceStore(tempDir);

    await store.saveDocument('Hamiltonian Mechanics', [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.',
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

    initialIndexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('POST /api/blocks/:id/chat scopes context to [N-1, N, N+1] and persists activeChat in .folio/notebook.json without mutating index.md', async () => {
    const capturedCalls: Parameters<CellChatGenerator>[0][] = [];

    const mockCellChatGenerator: CellChatGenerator = async (input) => {
      capturedCalls.push(input);
      return `Reply #${capturedCalls.length}: In ${input.context.targetBlock.id}, p = dL/dq_dot.`;
    };

    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: mockCellChatGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Turn 1
    const res1 = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Why do we switch from velocities to momenta?',
      }),
    });

    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].modelId).toBe('anthropic:claude-opus-4-6');
    expect(capturedCalls[0].context.previousBlock?.id).toBe('blk_01');
    expect(capturedCalls[0].context.targetBlock.id).toBe('blk_02');
    expect(capturedCalls[0].context.nextBlock?.id).toBe('blk_03');
    expect(capturedCalls[0].context.toc).toHaveLength(4);
    expect(capturedCalls[0].messages).toEqual([
      {
        role: 'user',
        content: 'Why do we switch from velocities to momenta?',
      },
    ]);

    expect(body1).toEqual({
      activeChat: {
        docId: 'index',
        blockId: 'blk_02',
        modelId: 'anthropic:claude-opus-4-6',
        messages: [
          {
            role: 'user',
            content: 'Why do we switch from velocities to momenta?',
          },
          {
            role: 'assistant',
            content: 'Reply #1: In blk_02, p = dL/dq_dot.',
          },
        ],
      },
    });

    // Turn 2: verify prior messages are passed to cellChatGenerator
    const res2 = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'What if the Hessian is singular?',
      }),
    });

    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    expect(capturedCalls).toHaveLength(2);
    expect(capturedCalls[1].messages).toEqual([
      {
        role: 'user',
        content: 'Why do we switch from velocities to momenta?',
      },
      {
        role: 'assistant',
        content: 'Reply #1: In blk_02, p = dL/dq_dot.',
      },
      {
        role: 'user',
        content: 'What if the Hessian is singular?',
      },
    ]);

    expect(body2.activeChat.messages).toHaveLength(4);

    // Verify .folio/notebook.json persisted activeChat
    const sidecarRaw = JSON.parse(
      await fs.readFile(path.join(tempDir, '.folio', 'notebook.json'), 'utf-8')
    );
    expect(sidecarRaw.activeChat).toEqual(body2.activeChat);

    // Verify GET /api/doc includes activeChat and pendingEdits
    const docRes = await app.request('/api/doc');
    expect(docRes.status).toBe(200);
    const docBody = await docRes.json();
    expect(docBody.activeChat).toEqual(body2.activeChat);
    expect(docBody.pendingEdits).toEqual([]);

    // Verify index.md on disk was NOT mutated
    const currentIndexMd = await fs.readFile(
      path.join(tempDir, 'index.md'),
      'utf-8'
    );
    expect(currentIndexMd).toBe(initialIndexMd);
  });

  it('DELETE /api/blocks/:id/chat discards activeChat and leaves index.md untouched', async () => {
    const app = createApp({
      workspaceDir: tempDir,
      cellChatGenerator: async () => 'Ephemeral response to discard.',
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Start an active chat on blk_02
    const chatRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Quick clarifying question?' }),
    });
    expect(chatRes.status).toBe(200);

    // Discard the chat on blk_02
    const delRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.activeChat).toBeNull();

    // Verify .folio/notebook.json has activeChat === null
    const sidecarRaw = JSON.parse(
      await fs.readFile(path.join(tempDir, '.folio', 'notebook.json'), 'utf-8')
    );
    expect(sidecarRaw.activeChat).toBeNull();

    // Verify index.md on disk remains completely unchanged
    const currentIndexMd = await fs.readFile(
      path.join(tempDir, 'index.md'),
      'utf-8'
    );
    expect(currentIndexMd).toBe(initialIndexMd);
  });
});
