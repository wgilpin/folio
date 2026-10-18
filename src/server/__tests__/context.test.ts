import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceStore } from '../store.js';
import { buildBoundedCellContext } from '../context.js';

describe('BoundedCellContext', () => {
  let tempDir: string;
  let store: WorkspaceStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-context-test-'));
    store = new WorkspaceStore(tempDir);

    await store.saveDocument('Hamiltonian Mechanics', [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the system state.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Legendre Transform\n\nMaps Lagrangian velocity space to momentum space.',
      },
      {
        id: 'blk_03',
        markdown: '## 3. Canonical Equations\n\nTime evolution via symplectic structure.',
      },
      {
        id: 'blk_04',
        markdown: '## 4. Liouville Theorem\n\nPhase space volume is conserved.',
      },
    ]);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('builds bounded context with current ToC and [N-1, N, N+1] sliding window including boundary blocks', async () => {
    // Interior block blk_02 -> [blk_01, blk_02, blk_03]
    const ctxMiddle = await buildBoundedCellContext(store, 'index', 'blk_02');
    expect(ctxMiddle.docId).toBe('index');
    expect(ctxMiddle.title).toBe('Hamiltonian Mechanics');
    expect(ctxMiddle.ancestorTocs).toEqual([]);
    expect(ctxMiddle.toc).toEqual([
      { level: 2, text: '1. Phase Space', blockId: 'blk_01' },
      { level: 2, text: '2. Legendre Transform', blockId: 'blk_02' },
      { level: 2, text: '3. Canonical Equations', blockId: 'blk_03' },
      { level: 2, text: '4. Liouville Theorem', blockId: 'blk_04' },
    ]);
    expect(ctxMiddle.previousBlock?.id).toBe('blk_01');
    expect(ctxMiddle.targetBlock.id).toBe('blk_02');
    expect(ctxMiddle.nextBlock?.id).toBe('blk_03');

    // First block blk_01 -> [null, blk_01, blk_02]
    const ctxFirst = await buildBoundedCellContext(store, 'index', 'blk_01');
    expect(ctxFirst.previousBlock).toBeNull();
    expect(ctxFirst.targetBlock.id).toBe('blk_01');
    expect(ctxFirst.nextBlock?.id).toBe('blk_02');

    // Last block blk_04 -> [blk_03, blk_04, null]
    const ctxLast = await buildBoundedCellContext(store, 'index', 'blk_04');
    expect(ctxLast.previousBlock?.id).toBe('blk_03');
    expect(ctxLast.targetBlock.id).toBe('blk_04');
    expect(ctxLast.nextBlock).toBeNull();
  });
});
