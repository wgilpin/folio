import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { formatRelatedLibraryDocsPrompt } from '../llm.js';
import { WorkspaceStore } from '../store.js';

describe('Epic 03 — Library-Wide Agent Topic Deduplication & Cross-Linking', () => {
  let tmpDir: string;
  let profilePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-dedup-'));
    profilePath = path.join(tmpDir, 'profile.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('POST /api/prerequisites/seed and POST /api/doc/seed reuse and cross-link an existing document anywhere in the library without calling seedGenerator', async () => {
    const store = new WorkspaceStore(tmpDir);

    // 1. Seed `lagrangian-mechanics.md` as an existing root document in the library
    await store.saveDocument(
      'Lagrangian Mechanics: Action and Euler-Lagrange Equations',
      [
        {
          id: 'blk_00',
          markdown:
            '# Lagrangian Mechanics: Action and Euler-Lagrange Equations\n\n## Prerequisites & Foundations\n\n- **Multivariable Calculus** — Partial derivatives.\n- **Classical Kinematics** — Generalized coordinates.',
        },
        {
          id: 'blk_01',
          markdown:
            '## 1. The Lagrangian Function\n\nDefined as $\\mathcal{L}(q, \\dot{q}, t) = T - V$.',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Principle of Stationary Action\n\nPhysical paths extremize the action functional $\\delta S = 0$.',
        },
        {
          id: 'blk_03',
          markdown:
            '## 3. Euler-Lagrange Equations\n\nEvaluating the variation yields the equations of motion.',
        },
      ],
      {
        id: 'lagrangian-mechanics',
        shortTitle: 'Lagrangian Mechanics',
        filename: 'lagrangian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        prerequisites: ['Multivariable Calculus', 'Classical Kinematics'],
      }
    );

    // 2. Save a separate root document `hamiltonian-mechanics.md` whose prerequisites mention Lagrangian Mechanics
    // (Initially saved before testing explicit POST /api/prerequisites/seed reuse, or imagine Lagrangian Mechanics was created later)
    const store2 = new WorkspaceStore(tmpDir);
    await store2.saveDocument(
      'Hamiltonian Mechanics: Phase Space and Canonical Transformations',
      [
        {
          id: 'blk_00',
          markdown:
            '# Hamiltonian Mechanics: Phase Space and Canonical Transformations\n\n## Prerequisites & Foundations\n\n- **Legendre Transformations** — Dual convex functions.\n- **Linear Symplectic Geometry** — Phase space forms.',
        },
        {
          id: 'blk_01',
          markdown:
            '## 1. Canonical Momenta\n\nConjugate momenta $p_i = \\partial \\mathcal{L} / \\partial \\dot{q}_i$.',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Hamilton Equations\n\nFirst-order flow on phase space.',
        },
        {
          id: 'blk_03',
          markdown:
            '## 3. Poisson Brackets\n\nAlgebraic structure of observables.',
        },
      ],
      {
        id: 'hamiltonian-mechanics',
        shortTitle: 'Hamiltonian Mechanics',
        filename: 'hamiltonian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        prerequisites: ['Legendre Transformations', 'Linear Symplectic Geometry'],
      }
    );

    const seedGenerator = vi.fn(async () => {
      throw new Error('seedGenerator should not be called when reusing an existing library topic');
    });

    const app = createApp({
      workspaceDir: tmpDir,
      profilePath,
      seedGenerator,
    });

    // 3. Call POST /api/prerequisites/seed for 'Lagrangian Mechanics' from 'hamiltonian-mechanics'
    const prereqRes = await app.request('/api/prerequisites/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Lagrangian Mechanics',
        parentDocId: 'hamiltonian-mechanics',
      }),
    });

    expect(prereqRes.status).toBe(200);
    expect(seedGenerator).not.toHaveBeenCalled();

    const prereqJson = await prereqRes.json();
    expect(prereqJson.document.id).toBe('lagrangian-mechanics');
    expect(
      prereqJson.documents['hamiltonian-mechanics'].prerequisiteDocIds?.[
        'Lagrangian Mechanics'
      ]
    ).toBe('lagrangian-mechanics');
    expect(
      prereqJson.documents['hamiltonian-mechanics'].childDocIds
    ).toContain('lagrangian-mechanics');

    // Verify blk_00 of hamiltonian-mechanics.md now contains the deep-dive link
    const hamiltonianLoaded = await store.loadDocument('hamiltonian-mechanics');
    expect(hamiltonianLoaded.blocks[0].markdown).toContain(
      '[→ Deep dive: Lagrangian Mechanics](lagrangian-mechanics.md)'
    );

    // 4. Call POST /api/doc/seed with `{ prompt: 'Lagrangian Mechanics' }` — should also reuse without calling seedGenerator
    const docSeedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Lagrangian Mechanics',
      }),
    });

    expect(docSeedRes.status).toBe(200);
    expect(seedGenerator).not.toHaveBeenCalled();
    const docSeedJson = await docSeedRes.json();
    expect(docSeedJson.document.id).toBe('lagrangian-mechanics');
  });

  it('passes relatedLibraryDocs into seed/branch generators and auto-links matching Block 0 prerequisites to existing library documents', async () => {
    const store = new WorkspaceStore(tmpDir);

    // 1. Create an existing library document on Lagrangian Mechanics
    await store.saveDocument(
      'Lagrangian Mechanics: Action and Euler-Lagrange Equations',
      [
        {
          id: 'blk_00',
          markdown:
            '# Lagrangian Mechanics: Action and Euler-Lagrange Equations\n\n## Prerequisites & Foundations\n\n- **Multivariable Calculus** — Partial derivatives.',
        },
        {
          id: 'blk_01',
          markdown:
            '## 1. The Lagrangian Function\n\nDefined as $\\mathcal{L}(q, \\dot{q}, t) = T - V$, measuring kinetic minus potential energy.',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Principle of Stationary Action\n\nPhysical trajectories extremize the action functional $\\delta S = 0$.',
        },
        {
          id: 'blk_03',
          markdown:
            '## 3. Symmetries and Conservation Laws\n\nContinuous symmetries of the action yield conserved quantities.',
        },
      ],
      {
        id: 'lagrangian-mechanics',
        shortTitle: 'Lagrangian Mechanics',
        filename: 'lagrangian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        prerequisites: ['Multivariable Calculus'],
      }
    );

    const capturedSeedOptions: unknown[] = [];
    const capturedBranchInputs: unknown[] = [];
    const capturedDocBranchInputs: unknown[] = [];

    const seedGenerator = vi.fn(async (_prompt: string, options?: unknown) => {
      capturedSeedOptions.push(options);
      return {
        title: 'Noether Theorem and Continuous Symmetries in Field Theory',
        shortTitle: 'Noether Theorem',
        toc: [
          '1. Infinitesimal Symmetry Transformations',
          '2. Noether Current Derivation',
          '3. Energy-Momentum Tensor',
        ],
        prerequisites: ['Lagrangian Mechanics', 'Lie Groups'],
        blocks: [
          '# Noether Theorem and Continuous Symmetries in Field Theory\n\n## Prerequisites & Foundations\n\n- **Lagrangian Mechanics** — Action functional and Euler-Lagrange equations.\n- **Lie Groups** — Continuous transformation generators.',
          '## 1. Infinitesimal Symmetry Transformations\n\nContinuous variations of fields that leave the action invariant.',
          '## 2. Noether Current Derivation\n\nEach continuous symmetry implies a divergence-free conserved current $j^\\mu$.',
          '## 3. Energy-Momentum Tensor\n\nSpacetime translation invariance yields the canonical stress-energy tensor.',
        ],
      };
    });

    const branchGenerator = vi.fn(async (input: unknown) => {
      capturedBranchInputs.push(input);
      return {
        branches: [
          {
            title: 'Gauge Invariance and Covariant Derivatives',
            shortTitle: 'Gauge Invariance',
            toc: [
              '1. Global vs Local Phase Symmetry',
              '2. Gauge Connection Field',
              '3. Yang-Mills Curvature',
            ],
            prerequisites: ['Lagrangian Mechanics', 'Differential Forms'],
            blocks: [
              '# Gauge Invariance and Covariant Derivatives\n\n## Prerequisites & Foundations\n\n- **Lagrangian Mechanics** — Action principle for fields.\n- **Differential Forms** — Exterior calculus.',
              '## 1. Global vs Local Phase Symmetry\n\nPromoting a global symmetry parameter to a spacetime-dependent function.',
              '## 2. Gauge Connection Field\n\nIntroducing the compensating gauge potential $A_\\mu$.',
              '## 3. Yang-Mills Curvature\n\nConstructing the gauge-invariant field strength tensor $F_{\\mu\\nu}$.',
            ],
          },
        ],
      };
    });

    const documentBranchGenerator = vi.fn(async (input: unknown) => {
      capturedDocBranchInputs.push(input);
      return {
        branches: [
          {
            title: 'Canonical Quantization of Constrained Systems',
            shortTitle: 'Canonical Quantization',
            toc: [
              '1. Primary Constraints',
              '2. Dirac Brackets',
              '3. Operator Ordering',
            ],
            prerequisites: ['Noether Theorem'],
            blocks: [
              '# Canonical Quantization of Constrained Systems\n\n## Prerequisites & Foundations\n\n- **Noether Theorem** — Conserved charges as symmetry generators.',
              '## 1. Primary Constraints\n\nSingular Lagrangians where momenta are not independent.',
              '## 2. Dirac Brackets\n\nModifying Poisson brackets to respect second-class constraints.',
              '## 3. Operator Ordering\n\nPromoting Dirac brackets to quantum commutators.',
            ],
          },
        ],
      };
    });

    const app = createApp({
      workspaceDir: tmpDir,
      profilePath,
      seedGenerator,
      branchGenerator,
      documentBranchGenerator,
      cellChatGenerator: async () => 'Assistant reply about gauge symmetries and Lagrangians.',
      documentChatGenerator: async () => 'Assistant reply about Noether charges and quantization.',
    });

    // 2. Seed a new root document whose prompt overlaps with Lagrangian action & symmetries
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Noether theorem, continuous symmetries of the Lagrangian action functional',
      }),
    });

    expect(seedRes.status).toBe(200);
    expect(seedGenerator).toHaveBeenCalledTimes(1);

    const seedOpts = capturedSeedOptions[0] as {
      relatedLibraryDocs?: Array<{
        docId: string;
        title: string;
        filename: string;
        summary: string;
      }>;
    };
    expect(seedOpts.relatedLibraryDocs).toBeDefined();
    expect(
      seedOpts.relatedLibraryDocs?.some((d) => d.docId === 'lagrangian-mechanics')
    ).toBe(true);

    // Verify formatRelatedLibraryDocsPrompt instructs the model to cross-link rather than re-derive
    const formattedPrompt = formatRelatedLibraryDocsPrompt(
      seedOpts.relatedLibraryDocs
    );
    expect(formattedPrompt).toContain('lagrangian-mechanics.md');
    expect(formattedPrompt).toContain('[→ Deep dive:');

    // Verify AC-3: newly seeded `noether-theorem` had 'Lagrangian Mechanics' in its Block 0 prerequisites,
    // so WorkspaceStore automatically bound prerequisiteDocIds['Lagrangian Mechanics'] = 'lagrangian-mechanics'
    // and appended `[→ Deep dive: Lagrangian Mechanics](lagrangian-mechanics.md)` to blk_00!
    const seedJson = await seedRes.json();
    expect(seedJson.document.id).toBe('noether-theorem');
    expect(seedJson.document.prerequisiteDocIds?.['Lagrangian Mechanics']).toBe(
      'lagrangian-mechanics'
    );
    expect(seedJson.blocks[0].markdown).toContain(
      '[→ Deep dive: Lagrangian Mechanics](lagrangian-mechanics.md)'
    );

    // 3. Test block branch (`/api/blocks/:id/branch`) receives relatedLibraryDocs and auto-links Block 0 prerequisites
    const bodyBlockId = seedJson.blocks[1].id as string;
    const chatRes = await app.request(`/api/blocks/${bodyBlockId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId: 'noether-theorem',
        message: 'How do local symmetries of the Lagrangian action lead to gauge fields?',
      }),
    });
    expect(chatRes.status).toBe(200);

    const branchRes = await app.request(`/api/blocks/${bodyBlockId}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'noether-theorem' }),
    });

    expect(branchRes.status).toBe(200);
    expect(branchGenerator).toHaveBeenCalledTimes(1);
    const branchInput = capturedBranchInputs[0] as {
      relatedLibraryDocs?: Array<{ docId: string; filename: string }>;
    };
    expect(branchInput.relatedLibraryDocs).toBeDefined();
    expect(
      branchInput.relatedLibraryDocs?.some(
        (d) => d.docId === 'lagrangian-mechanics'
      )
    ).toBe(true);

    const branchJson = await branchRes.json();
    expect(branchJson.document.id).toBe('gauge-invariance');
    expect(
      branchJson.document.prerequisiteDocIds?.['Lagrangian Mechanics']
    ).toBe('lagrangian-mechanics');
    expect(branchJson.blocks[0].markdown).toContain(
      '[→ Deep dive: Lagrangian Mechanics](lagrangian-mechanics.md)'
    );

    // 4. Test document branch (`/api/doc/branch`) receives relatedLibraryDocs and auto-links Block 0 prerequisites
    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId: 'gauge-invariance',
        message: 'How do Noether theorem conserved charges behave under canonical quantization?',
      }),
    });

    const docBranchRes = await app.request('/api/doc/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'gauge-invariance' }),
    });

    expect(docBranchRes.status).toBe(200);
    expect(documentBranchGenerator).toHaveBeenCalledTimes(1);
    const docBranchInput = capturedDocBranchInputs[0] as {
      relatedLibraryDocs?: Array<{ docId: string; filename: string }>;
    };
    expect(docBranchInput.relatedLibraryDocs).toBeDefined();
    expect(
      docBranchInput.relatedLibraryDocs?.some(
        (d) => d.docId === 'noether-theorem'
      )
    ).toBe(true);

    const docBranchJson = await docBranchRes.json();
    expect(docBranchJson.document.id).toBe('canonical-quantization');
    expect(
      docBranchJson.document.prerequisiteDocIds?.['Noether Theorem']
    ).toBe('noether-theorem');
    expect(docBranchJson.blocks[0].markdown).toContain(
      '[→ Deep dive: Noether Theorem](noether-theorem.md)'
    );
  });
});
