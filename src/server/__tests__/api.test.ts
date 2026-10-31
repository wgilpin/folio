import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { WorkspaceStore } from '../store.js';

describe('Document API routes', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-api-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('GET /api/doc returns null document on empty workspace', async () => {
    const app = createApp({
      workspaceDir: tempDir,
      modelId: 'anthropic:claude-opus-4-6',
    });

    const res = await app.request('/api/doc');
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      document: null,
      blocks: [],
      toc: [],
      modelId: 'anthropic:claude-opus-4-6',
      settings: {
        modelId: 'anthropic:claude-opus-4-6',
        reasoningEffort: 'high',
        activeProfileId: 'intuitive-physical',
        customSystemPrompt: '',
      },
      workspaceDir: tempDir,
      workspaces: [tempDir],
    });
  });

  it('POST /api/doc/seed generates 4-8 blocks and persists <slug>.md and .folio/notebook.json without overwriting previous topics', async () => {
    const seedGenerator = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Hamiltonian Mechanics',
        blocks: [
          '## 1. Phase Space Coordinates\n\nGeneralized coordinates $q$ and momenta $p$ span phase space.',
          '## 2. The Hamiltonian Function\n\nThe total energy $H(q, p)$ governs system evolution.\n\n```mermaid\nflowchart LR\n  L["Lagrangian"] --> H["Hamiltonian"]\n```',
          '## 3. Canonical Equations\n\nTime derivatives follow $\\dot{q} = \\partial H / \\partial p$ and $\\dot{p} = -\\partial H / \\partial q$.',
          '## 4. Liouville Theorem\n\nPhase space volume is conserved along trajectories.',
        ],
      })
      .mockResolvedValueOnce({
        title: 'General Relativity',
        blocks: [
          '## 1. Equivalence Principle\n\nLocal inertial frames.',
          '## 2. Metric Tensor\n\nSpacetime interval $ds^2 = g_{\\mu\\nu} dx^\\mu dx^\\nu$.',
          '## 3. Geodesic Equation\n\nPaths of extremal proper time.',
          '## 4. Einstein Field Equations\n\n$G_{\\mu\\nu} = 8\\pi G T_{\\mu\\nu}$.',
        ],
      });

    const app = createApp({
      workspaceDir: tempDir,
      seedGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    const res = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hamiltonian Mechanics' }),
    });

    expect(res.status).toBe(200);
    expect(seedGenerator).toHaveBeenCalledWith(
      'Hamiltonian Mechanics',
      expect.objectContaining({
        modelId: 'anthropic:claude-opus-4-6',
        reasoningEffort: 'high',
      })
    );

    const body = await res.json();
    expect(body.document).toEqual({
      id: 'hamiltonian-mechanics',
      title: 'Hamiltonian Mechanics',
      filename: 'hamiltonian-mechanics.md',
      parentId: null,
      parentBlockId: null,
      childDocIds: [],
    });
    expect(body.blocks).toHaveLength(4);
    expect(body.blocks[0].id).toBe('blk_01');
    expect(body.toc).toEqual([
      { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
      { level: 2, text: '2. The Hamiltonian Function', blockId: 'blk_02' },
      { level: 2, text: '3. Canonical Equations', blockId: 'blk_03' },
      { level: 2, text: '4. Liouville Theorem', blockId: 'blk_04' },
    ]);

    const firstTopicMd = await fs.readFile(
      path.join(tempDir, 'hamiltonian-mechanics.md'),
      'utf-8'
    );
    expect(firstTopicMd).toContain('<!-- folio:block id="blk_01" -->');
    expect(firstTopicMd).toContain('## 2. The Hamiltonian Function');

    // Seed a second root topic in the same root folder and verify both coexist
    const res2 = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'General Relativity' }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.document.id).toBe('general-relativity');
    expect(body2.document.filename).toBe('general-relativity.md');
    expect(Object.keys(body2.documents).sort()).toEqual([
      'general-relativity',
      'hamiltonian-mechanics',
    ]);

    const sidecar = await new WorkspaceStore(tempDir).loadState();
    expect(sidecar.documents['hamiltonian-mechanics'].title).toBe(
      'Hamiltonian Mechanics'
    );
    expect(sidecar.documents['general-relativity'].title).toBe(
      'General Relativity'
    );
    expect(sidecar.activeDocId).toBe('general-relativity');
  });

  it('PUT /api/blocks/:id updates block markdown on disk and refreshes ToC', async () => {
    const seedGenerator = vi.fn().mockResolvedValue({
      title: 'Hamiltonian Mechanics',
      blocks: [
        '## 1. Phase Space Coordinates\n\nGeneralized coordinates $q$ and momenta $p$ span phase space.',
        '## 2. The Hamiltonian Function\n\nThe total energy $H(q, p)$ governs system evolution.',
        '## 3. Canonical Equations\n\nEquations of motion.',
        '## 4. Liouville Theorem\n\nPhase space volume is conserved.',
      ],
    });

    const app = createApp({
      workspaceDir: tempDir,
      seedGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hamiltonian Mechanics' }),
    });

    const updateRes = await app.request('/api/blocks/blk_01', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markdown:
          '## 1. Symplectic Phase Space\n\nCanonical coordinates $(q, p)$ form a symplectic manifold.',
      }),
    });

    expect(updateRes.status).toBe(200);
    const body = await updateRes.json();
    expect(body.blocks).toHaveLength(4);
    expect(body.blocks[0]).toEqual({
      id: 'blk_01',
      markdown:
        '## 1. Symplectic Phase Space\n\nCanonical coordinates $(q, p)$ form a symplectic manifold.',
    });
    expect(body.toc).toEqual([
      { level: 2, text: '1. Symplectic Phase Space', blockId: 'blk_01' },
      { level: 2, text: '2. The Hamiltonian Function', blockId: 'blk_02' },
      { level: 2, text: '3. Canonical Equations', blockId: 'blk_03' },
      { level: 2, text: '4. Liouville Theorem', blockId: 'blk_04' },
    ]);

    const topicMd = await fs.readFile(
      path.join(tempDir, 'hamiltonian-mechanics.md'),
      'utf-8'
    );
    expect(topicMd).toContain('## 1. Symplectic Phase Space');
    expect(topicMd).not.toContain('## 1. Phase Space Coordinates');
  });

  it('POST /api/blocks/:id/split, POST /api/blocks/:id/merge, and DELETE /api/blocks/:id mutate blocks in <slug>.md', async () => {
    const seedGenerator = vi.fn().mockResolvedValue({
      title: 'Hamiltonian Mechanics',
      blocks: [
        '## 1. Phase Space Coordinates\n\nFirst paragraph on coordinates.\n\nSecond paragraph on canonical momenta.',
        '## 2. The Hamiltonian Function\n\nEnergy formulation.',
        '## 3. Canonical Equations\n\nEquations of motion.',
        '## 4. Liouville Theorem\n\nPhase space volume is conserved.',
      ],
    });

    const app = createApp({
      workspaceDir: tempDir,
      seedGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hamiltonian Mechanics' }),
    });

    // 1. Split blk_01 into two adjacent blocks
    const splitRes = await app.request('/api/blocks/blk_01/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(splitRes.status).toBe(200);
    const splitBody = await splitRes.json();
    expect(splitBody.blocks).toHaveLength(5);
    expect(splitBody.blocks[0].id).toBe('blk_01');
    expect(splitBody.blocks[0].markdown).toContain('## 1. Phase Space Coordinates');
    expect(splitBody.blocks[0].markdown).toContain('First paragraph on coordinates.');
    expect(splitBody.blocks[1].id).toMatch(/^blk_/);
    expect(splitBody.blocks[1].id).not.toBe('blk_01');
    expect(splitBody.blocks[1].markdown).toBe('Second paragraph on canonical momenta.');

    const secondBlockId = splitBody.blocks[1].id as string;
    let topicMd = await fs.readFile(
      path.join(tempDir, 'hamiltonian-mechanics.md'),
      'utf-8'
    );
    expect(topicMd).toContain(`<!-- folio:block id="${secondBlockId}" -->`);

    // 2. Merge blk_01 with the newly split secondBlockId
    const mergeRes = await app.request('/api/blocks/blk_01/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(mergeRes.status).toBe(200);
    const mergeBody = await mergeRes.json();
    expect(mergeBody.blocks).toHaveLength(4);
    expect(mergeBody.blocks[0].id).toBe('blk_01');
    expect(mergeBody.blocks[0].markdown).toContain('First paragraph on coordinates.');
    expect(mergeBody.blocks[0].markdown).toContain('Second paragraph on canonical momenta.');

    topicMd = await fs.readFile(
      path.join(tempDir, 'hamiltonian-mechanics.md'),
      'utf-8'
    );
    expect(topicMd).not.toContain(`<!-- folio:block id="${secondBlockId}" -->`);

    // 3. Delete blk_02
    const deleteRes = await app.request('/api/blocks/blk_02', {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.blocks).toHaveLength(3);
    expect(deleteBody.blocks.map((b: { id: string }) => b.id)).toEqual([
      'blk_01',
      'blk_03',
      'blk_04',
    ]);
    expect(deleteBody.toc).toEqual([
      { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
      { level: 2, text: '3. Canonical Equations', blockId: 'blk_03' },
      { level: 2, text: '4. Liouville Theorem', blockId: 'blk_04' },
    ]);

    topicMd = await fs.readFile(
      path.join(tempDir, 'hamiltonian-mechanics.md'),
      'utf-8'
    );
    expect(topicMd).not.toContain('<!-- folio:block id="blk_02" -->');
  });

  it('POST /api/workspaces/switch allows subdirectories within workspace root and rejects paths outside it', async () => {
    const app = createApp({
      workspaceDir: tempDir,
      modelId: 'anthropic:claude-opus-4-6',
    });

    const subWorkspace = path.join(tempDir, 'physics');
    const okRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: subWorkspace }),
    });
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.workspaceDir).toBe(path.resolve(subWorkspace));

    const outsideDir = path.resolve(tempDir, '..', 'escaped-folio-workspace');
    const badRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: outsideDir }),
    });
    expect(badRes.status).toBe(400);
    const badBody = await badRes.json();
    expect(badBody.error).toContain('Workspace directory must be within');
  });

  it('rejects spoofed Remote-User when an invalid Authorization Bearer header is provided', async () => {
    const app = createApp({
      workspaceDir: tempDir,
      apiKey: 'secret-test-key',
      modelId: 'anthropic:claude-opus-4-6',
    });

    const spoofedRes = await app.request('/api/doc', {
      headers: {
        Authorization: 'Bearer invalid-key',
        'Remote-User': 'will',
      },
    });
    expect(spoofedRes.status).toBe(401);

    const validBearerRes = await app.request('/api/doc', {
      headers: {
        Authorization: 'Bearer secret-test-key',
      },
    });
    expect(validBearerRes.status).toBe(200);

    const validRemoteUserRes = await app.request('/api/doc', {
      headers: {
        'Remote-User': 'will',
      },
    });
    expect(validRemoteUserRes.status).toBe(200);
  });
});

