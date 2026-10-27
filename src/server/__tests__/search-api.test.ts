import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { WorkspaceStore } from '../store.js';

describe('GET /api/search — Full-Text (FTS5) & Semantic Concept Block Search', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-search-api-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/search returns ranked FTS keyword/LaTeX and semantic Concept Block matches and reflects block updates and deletions', async () => {
    const store = new WorkspaceStore(tmpDir);

    await store.saveDocument(
      'Lagrangian Mechanics: Principle of Stationary Action',
      [
        {
          id: 'blk_00',
          markdown:
            '## Prerequisites & Foundations\n\n- **Multivariable Calculus**\n- **Classical Newtonian Dynamics**',
        },
        {
          id: 'blk_01',
          markdown:
            '## 1. The Lagrangian Function\n\nThe Lagrangian of a classical mechanical system is defined as kinetic energy minus potential energy:\n\n$$\\mathcal{L}(q, \\dot{q}, t) = T - V$$',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Action Functional and Euler-Lagrange Equations\n\nHamilton\'s principle states that the physical trajectory makes the action functional stationary ($\\delta S = 0$), yielding the Euler-Lagrange equations.',
        },
      ],
      {
        id: 'lagrangian-mechanics',
        shortTitle: 'Lagrangian Mechanics',
        filename: 'lagrangian-mechanics.md',
        parentId: null,
        parentBlockId: null,
      }
    );

    await store.saveDocument(
      "Noether's Theorem and Continuous Symmetries",
      [
        {
          id: 'blk_00',
          markdown:
            '## Prerequisites & Foundations\n\n- **Lagrangian Mechanics**\n- **Lie Groups**',
        },
        {
          id: 'blk_01',
          markdown:
            "## 1. Statement of Noether's Theorem\n\nEvery differentiable continuous symmetry of the action of a physical system has a corresponding conservation law and conserved current.",
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Cyclic Coordinates and Momentum Conservation\n\nWhen $\\mathcal{L}$ does not depend on a generalized coordinate $q_i$, its conjugate momentum $p_i = \\frac{\\partial \\mathcal{L}}{\\partial \\dot{q}_i}$ is conserved.',
        },
      ],
      {
        id: 'noethers-theorem',
        shortTitle: "Noether's Theorem",
        filename: 'noethers-theorem.md',
        parentId: 'lagrangian-mechanics',
        parentBlockId: 'blk_02',
      }
    );

    const app = createApp({ workspaceDir: tmpDir });

    // 1. Keyword search in FTS mode (AC-1)
    const ftsKeywordRes = await app.request(
      '/api/search?q=' + encodeURIComponent("Noether's theorem") + '&mode=fts'
    );
    expect(ftsKeywordRes.status).toBe(200);
    const ftsKeywordBody = await ftsKeywordRes.json();
    expect(ftsKeywordBody.mode).toBe('fts');
    expect(ftsKeywordBody.results.length).toBeGreaterThan(0);
    expect(ftsKeywordBody.results[0]).toMatchObject({
      docId: 'noethers-theorem',
      docTitle: "Noether's Theorem and Continuous Symmetries",
      blockId: 'blk_01',
      heading: "1. Statement of Noether's Theorem",
      matchType: 'fts',
    });
    expect(ftsKeywordBody.results[0].snippet).toContain('conservation law');

    // 2. LaTeX formula search in FTS / hybrid mode (AC-1)
    const latexRes = await app.request(
      '/api/search?q=' +
        encodeURIComponent('\\mathcal{L}(q, \\dot{q}, t) = T - V') +
        '&mode=hybrid'
    );
    expect(latexRes.status).toBe(200);
    const latexBody = await latexRes.json();
    expect(latexBody.results.length).toBeGreaterThan(0);
    expect(latexBody.results[0].docId).toBe('lagrangian-mechanics');
    expect(latexBody.results[0].blockId).toBe('blk_01');
    expect(latexBody.results[0].snippet).toContain('\\mathcal{L}');

    // 3. Semantic search with conceptual paraphrase (AC-2)
    const semanticRes = await app.request(
      '/api/search?q=' +
        encodeURIComponent('invariance under transformation implies conserved quantities') +
        '&mode=semantic'
    );
    expect(semanticRes.status).toBe(200);
    const semanticBody = await semanticRes.json();
    expect(semanticBody.mode).toBe('semantic');
    expect(semanticBody.results.length).toBeGreaterThan(0);
    expect(semanticBody.results[0].docId).toBe('noethers-theorem');
    expect(semanticBody.results[0].blockId).toBe('blk_01');
    expect(semanticBody.results[0].matchType).toBe('semantic');

    // 4. Updating a block immediately updates the search index (AC-2)
    const updateRes = await app.request('/api/blocks/blk_02', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId: 'lagrangian-mechanics',
        markdown:
          '## 2. Legendre Transform to Hamiltonian\n\nApplying the Legendre transformation replaces generalized velocities with canonical momenta $H(q, p) = \\sum p_i \\dot{q}_i - \\mathcal{L}$.',
      }),
    });
    expect(updateRes.status).toBe(200);

    const afterUpdateRes = await app.request(
      '/api/search?q=' + encodeURIComponent('Legendre transformation canonical momenta')
    );
    expect(afterUpdateRes.status).toBe(200);
    const afterUpdateBody = await afterUpdateRes.json();
    expect(afterUpdateBody.results.length).toBeGreaterThan(0);
    expect(afterUpdateBody.results[0]).toMatchObject({
      docId: 'lagrangian-mechanics',
      blockId: 'blk_02',
      heading: '2. Legendre Transform to Hamiltonian',
    });

    // 5. Deleting a block immediately removes it from the search index (AC-2)
    const deleteRes = await app.request(
      '/api/blocks/blk_02?docId=lagrangian-mechanics',
      {
        method: 'DELETE',
      }
    );
    expect(deleteRes.status).toBe(200);

    const afterDeleteRes = await app.request(
      '/api/search?q=' + encodeURIComponent('Legendre transformation') + '&mode=fts'
    );
    expect(afterDeleteRes.status).toBe(200);
    const afterDeleteBody = await afterDeleteRes.json();
    expect(
      afterDeleteBody.results.some(
        (r: { docId: string; blockId: string }) =>
          r.docId === 'lagrangian-mechanics' && r.blockId === 'blk_02'
      )
    ).toBe(false);
  });
});
