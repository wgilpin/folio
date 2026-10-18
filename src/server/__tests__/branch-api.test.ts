import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { buildBoundedCellContext } from '../context.js';
import type { BranchGenerator } from '../llm.js';
import { WorkspaceStore } from '../store.js';

describe('Sub-document Branching API & Multi-level Ancestor Context (Epic 01)', () => {
  let tempDir: string;
  let store: WorkspaceStore;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-branch-test-'));
    store = new WorkspaceStore(tempDir);
    await store.saveDocument(
      'Attention Mechanisms',
      [
        {
          id: 'blk_00',
          markdown:
            '## 0. Prerequisites & Notation\n\nLinear algebra and dot products.',
        },
        {
          id: 'blk_01',
          markdown: '## 1. Query, Key, and Value Vectors\n\nProjections of tokens.',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Scaled Dot-Product Attention\n\nDividing by $\\sqrt{d_k}$ stabilizes gradients.',
        },
        {
          id: 'blk_03',
          markdown:
            '## 3. Multi-Head Attention\n\nConcatenating parallel attention heads.',
        },
      ],
      { id: 'index', filename: 'index.md' }
    );
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('POST /api/blocks/:id/branch creates child .md document, appends markdown link to parent block, updates document tree, and clears activeChat', async () => {
    await store.appendChatMessage(
      'index',
      'blk_02',
      'anthropic:claude-opus-4-6',
      'How does softmax temperature affect variance in detail?',
      'Let us derive the variance scaling of dot products under unit normal assumptions.'
    );

    let capturedBranchInput: Parameters<BranchGenerator>[0] | null = null;
    const mockBranchGenerator: BranchGenerator = async (input) => {
      capturedBranchInput = input;
      return {
        title: 'Variance Scaling & Softmax Temperature',
        blocks: [
          '## 0. Prerequisites & Notation\n\nRandom variables $X, Y \\sim \\mathcal{N}(0, 1)$.',
          '## 1. Variance of Dot Products\n\nSum of $d_k$ independent products has variance $d_k$.',
          '## 2. Softmax Saturation\n\nLarge logits push gradients toward zero.',
          '## 3. Temperature Rescaling\n\nDividing by $\\sqrt{d_k}$ restores unit variance.',
        ],
      };
    };

    const app = createApp({
      workspaceDir: tempDir,
      branchGenerator: mockBranchGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    const res = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    // Verify branchGenerator received bounded cell context and activeChat messages
    expect(capturedBranchInput).not.toBeNull();
    expect(capturedBranchInput!.context.docId).toBe('index');
    expect(capturedBranchInput!.context.targetBlock.id).toBe('blk_02');
    expect(capturedBranchInput!.context.previousBlock?.id).toBe('blk_01');
    expect(capturedBranchInput!.context.nextBlock?.id).toBe('blk_03');
    expect(capturedBranchInput!.messages).toHaveLength(2);

    // Verify response returns newly created child document
    const childDocId = 'variance-scaling-softmax-temperature';
    expect(body.document).toEqual({
      id: childDocId,
      title: 'Variance Scaling & Softmax Temperature',
      filename: `${childDocId}.md`,
      parentId: 'index',
      parentBlockId: 'blk_02',
      childDocIds: [],
    });
    expect(body.blocks).toHaveLength(4);
    expect(body.blocks[0].id).toBe('blk_00');
    expect(body.activeChat).toBeNull();
    expect(body.pendingEdits).toEqual([]);
    expect(body.documents[childDocId]).toBeDefined();
    expect(body.documents['index'].childDocIds).toContain(childDocId);

    // Verify child .md file on disk
    const childDiskRaw = await fs.readFile(
      path.join(tempDir, `${childDocId}.md`),
      'utf-8'
    );
    expect(childDiskRaw).toContain('<!-- folio:block id="blk_00" -->');
    expect(childDiskRaw).toContain('## 1. Variance of Dot Products');

    // Verify parent block blk_02 in index.md ends with deep dive link
    const parentLoaded = await store.loadDocument('index');
    const updatedBlk02 = parentLoaded.blocks.find((b) => b.id === 'blk_02');
    expect(updatedBlk02?.markdown).toBe(
      `## 2. Scaled Dot-Product Attention\n\nDividing by $\\sqrt{d_k}$ stabilizes gradients.\n\n[→ Deep dive: Variance Scaling & Softmax Temperature](${childDocId}.md)`
    );

    // Verify .folio/notebook.json cleared activeChat and registered child node
    const state = await store.loadState();
    expect(state.activeChat).toBeNull();
    expect(state.documents['index'].childDocIds).toEqual([childDocId]);
    expect(state.documents[childDocId]).toEqual({
      id: childDocId,
      title: 'Variance Scaling & Softmax Temperature',
      filename: `${childDocId}.md`,
      parentId: 'index',
      parentBlockId: 'blk_02',
      childDocIds: [],
    });
  });

  it('rejects POST /api/blocks/:id/branch with 409 when pendingEdits exist on the parent document', async () => {
    await store.appendChatMessage(
      'index',
      'blk_01',
      'anthropic:claude-opus-4-6',
      'Update notation',
      'Here is the updated notation.'
    );
    await store.integrateBlockChat('index', 'blk_01', {
      updatedBlockMarkdown:
        '## 1. Query, Key, and Value Vectors\n\nUpdated projections.',
      insertedBlocksMarkdown: [],
      suggestedEdits: [
        {
          targetBlockId: 'blk_02',
          proposedMarkdown:
            '## 2. Scaled Dot-Product Attention\n\nAligned with updated notation.',
          reason: 'Keep notation consistent with Block 1.',
        },
      ],
    });

    const app = createApp({
      workspaceDir: tempDir,
    });

    const res = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Resolve pending suggested edits first',
    });
  });

  it('buildBoundedCellContext populates root-to-parent ancestorTocs across multi-level branched documents and GET /api/doc returns documents map', async () => {
    // 1. Branch child from root 'index' on blk_02
    await store.appendChatMessage(
      'index',
      'blk_02',
      'anthropic:claude-opus-4-6',
      'Branch child doc',
      'Branching child doc.'
    );

    const app = createApp({
      workspaceDir: tempDir,
      branchGenerator: async ({ messages }) => {
        const isGrandchild = messages.some((m) =>
          m.content.includes('grandchild')
        );
        if (isGrandchild) {
          return {
            title: 'Jacobian Eigenvalues of Softmax',
            blocks: [
              '## 0. Prerequisites & Notation\n\nJacobian matrix $J$.',
              '## 1. Diagonal & Outer Product Form\n\n$\\text{diag}(p) - pp^T$.',
              '## 2. Nullspace of Softmax Jacobian\n\nThe all-ones vector $\\mathbf{1}$.',
              '## 3. Bounding the Spectral Norm\n\nMaximum eigenvalue is at most $1/2$.',
            ],
          };
        }
        return {
          title: 'Softmax Mechanics',
          blocks: [
            '## 0. Prerequisites & Notation\n\nExponentials and normalization.',
            '## 1. Shift Invariance\n\nSubtracting $\\max(z)$ prevents overflow.',
            '## 2. Softmax Gradient\n\nDerivative with respect to logits.',
            '## 3. Temperature Limits\n\nAs $T \\to 0$, softmax approaches argmax.',
          ],
        };
      },
    });

    const childRes = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });
    expect(childRes.status).toBe(200);
    const childBody = await childRes.json();
    const childDocId = childBody.document.id;
    expect(childDocId).toBe('softmax-mechanics');

    // 2. Branch grandchild from child on blk_02
    await store.appendChatMessage(
      childDocId,
      'blk_02',
      'anthropic:claude-opus-4-6',
      'Branch grandchild doc on Jacobian',
      'Branching grandchild doc.'
    );

    const grandchildRes = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: childDocId }),
    });
    expect(grandchildRes.status).toBe(200);
    const grandchildBody = await grandchildRes.json();
    const grandchildDocId = grandchildBody.document.id;
    expect(grandchildDocId).toBe('jacobian-eigenvalues-of-softmax');

    // 3. Verify buildBoundedCellContext on grandchild has [rootToc, childToc] in root-to-parent order
    const context = await buildBoundedCellContext(
      store,
      grandchildDocId,
      'blk_02'
    );
    expect(context.docId).toBe(grandchildDocId);
    expect(context.ancestorTocs).toHaveLength(2);
    expect(context.ancestorTocs[0].docId).toBe('index');
    expect(context.ancestorTocs[0].title).toBe('Attention Mechanisms');
    expect(context.ancestorTocs[0].toc.map((t) => t.blockId)).toEqual([
      'blk_00',
      'blk_01',
      'blk_02',
      'blk_03',
    ]);
    expect(context.ancestorTocs[1].docId).toBe(childDocId);
    expect(context.ancestorTocs[1].title).toBe('Softmax Mechanics');
    expect(context.ancestorTocs[1].toc.map((t) => t.blockId)).toEqual([
      'blk_00',
      'blk_02',
      'blk_03',
      'blk_04',
    ]);

    // 4. Verify GET /api/doc?id=<grandchildId> returns the documents map containing all three documents
    const getRes = await app.request(`/api/doc?id=${grandchildDocId}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(Object.keys(getBody.documents).sort()).toEqual(
      ['index', childDocId, grandchildDocId].sort()
    );
    expect(getBody.documents['index'].childDocIds).toEqual([childDocId]);
    expect(getBody.documents[childDocId].parentId).toBe('index');
    expect(getBody.documents[childDocId].childDocIds).toEqual([grandchildDocId]);
    expect(getBody.documents[grandchildDocId].parentId).toBe(childDocId);
    expect(getBody.documents[grandchildDocId].parentBlockId).toBe('blk_02');
  });
});
