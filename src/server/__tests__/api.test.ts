import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

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
    });
  });

  it('POST /api/doc/seed generates 4-8 blocks and persists index.md and .folio/notebook.json', async () => {
    const seedGenerator = vi.fn().mockResolvedValue({
      title: 'Hamiltonian Mechanics',
      blocks: [
        '## 1. Phase Space Coordinates\n\nGeneralized coordinates $q$ and momenta $p$ span phase space.',
        '## 2. The Hamiltonian Function\n\nThe total energy $H(q, p)$ governs system evolution.\n\n```mermaid\nflowchart LR\n  L["Lagrangian"] --> H["Hamiltonian"]\n```',
        '## 3. Canonical Equations\n\nTime derivatives follow $\\dot{q} = \\partial H / \\partial p$ and $\\dot{p} = -\\partial H / \\partial q$.',
        '## 4. Liouville Theorem\n\nPhase space volume is conserved along trajectories.',
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
    expect(seedGenerator).toHaveBeenCalledWith('Hamiltonian Mechanics');

    const body = await res.json();
    expect(body.document).toEqual({
      id: 'index',
      title: 'Hamiltonian Mechanics',
      filename: 'index.md',
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

    const indexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(indexMd).toContain('<!-- folio:block id="blk_01" -->');
    expect(indexMd).toContain('## 2. The Hamiltonian Function');

    const sidecarRaw = await fs.readFile(
      path.join(tempDir, '.folio', 'notebook.json'),
      'utf-8'
    );
    const sidecar = JSON.parse(sidecarRaw);
    expect(sidecar.documents.index.title).toBe('Hamiltonian Mechanics');
  });
});
