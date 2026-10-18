import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';

describe('Learner Profile & Prerequisite Seeding API (Phase 05 Epic 01)', () => {
  let tempDirA: string;
  let tempDirB: string;
  let profileDir: string;
  let profilePath: string;

  beforeEach(async () => {
    tempDirA = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-prof-ws-a-'));
    tempDirB = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-prof-ws-b-'));
    profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-prof-global-'));
    profilePath = path.join(profileDir, 'profile.json');
  });

  afterEach(async () => {
    await fs.rm(tempDirA, { recursive: true, force: true });
    await fs.rm(tempDirB, { recursive: true, force: true });
    await fs.rm(profileDir, { recursive: true, force: true });
  });

  it('GET /api/profile and PUT /api/profile/topics persist topic familiarity across workspace switches (AC-1)', async () => {
    const app = createApp({
      workspaceDir: tempDirA,
      profilePath,
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Initial profile is empty
    const initRes = await app.request('/api/profile');
    expect(initRes.status).toBe(200);
    const initBody = await initRes.json();
    expect(initBody.profile).toEqual({ topics: {} });

    // Mark 'Lagrangian Mechanics' as known
    const putRes = await app.request('/api/profile/topics', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Lagrangian Mechanics',
        status: 'known',
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.profile.topics['Lagrangian Mechanics']).toBe('known');

    // Verify persisted on disk in profilePath
    const rawProfile = JSON.parse(await fs.readFile(profilePath, 'utf-8'));
    expect(rawProfile.topics['Lagrangian Mechanics']).toBe('known');

    // Verify GET /api/doc in workspace A returns profile
    const docARes = await app.request('/api/doc');
    expect(docARes.status).toBe(200);
    const docABody = await docARes.json();
    expect(docABody.profile.topics['Lagrangian Mechanics']).toBe('known');

    // Switch workspace to tempDirB
    const switchRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: tempDirB }),
    });
    expect(switchRes.status).toBe(200);
    const switchBody = await switchRes.json();
    expect(switchBody.workspaceDir).toBe(tempDirB);
    expect(switchBody.profile.topics['Lagrangian Mechanics']).toBe('known');

    // Verify GET /api/profile and GET /api/doc in workspace B also return known
    const profBRes = await app.request('/api/profile');
    expect(profBRes.status).toBe(200);
    const profBBody = await profBRes.json();
    expect(profBBody.profile.topics['Lagrangian Mechanics']).toBe('known');

    const docBRes = await app.request('/api/doc');
    expect(docBRes.status).toBe(200);
    const docBBody = await docBRes.json();
    expect(docBBody.profile.topics['Lagrangian Mechanics']).toBe('known');
  });

  it('POST /api/doc/seed and POST /api/blocks/:id/branch store prerequisites on DocumentNode and pass LearnerProfile to generators (AC-2)', async () => {
    const seedGenerator = vi.fn().mockResolvedValue({
      title: 'Hamiltonian Mechanics',
      prerequisites: ['Lagrangian Mechanics', 'Vector Calculus'],
      blocks: [
        '## 0. Prerequisites & Notation\n\n- **Lagrangian Mechanics**: Action principle and generalized coordinates.\n- **Vector Calculus**: Gradients and phase velocity.',
        '## 1. Phase Space Coordinates\n\nGeneralized coordinates $q$ and momenta $p$.',
        '## 2. The Legendre Transform\n\nMapping velocity to momentum.',
        '## 3. Canonical Equations\n\nSymplectic time evolution.',
      ],
    });

    const branchGenerator = vi.fn().mockResolvedValue({
      title: 'Legendre Transform Deep Dive',
      blocks: [
        '## 0. Prerequisites & Notation\n\n- **Convex Analysis**: Dual functions and tangent slopes.\n- **Multivariable Calculus**: Jacobian matrices.',
        '## 1. Dual Slopes\n\nEncoding a convex curve by its family of tangent lines.',
        '## 2. Involution Property\n\nApplying the transform twice recovers the original function.',
        '## 3. From Lagrangian to Hamiltonian\n\nReplacing $\\dot{q}$ with $p = \\partial L / \\partial \\dot{q}$.',
      ],
    });

    const cellChatGenerator = vi
      .fn()
      .mockResolvedValue('The Legendre transform swaps slopes and intercepts.');

    const app = createApp({
      workspaceDir: tempDirA,
      profilePath,
      seedGenerator,
      branchGenerator,
      cellChatGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Set 'Lagrangian Mechanics' to 'known' first
    await app.request('/api/profile/topics', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Lagrangian Mechanics',
        status: 'known',
      }),
    });

    // Seed root document
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hamiltonian Mechanics' }),
    });
    expect(seedRes.status).toBe(200);
    expect(seedGenerator).toHaveBeenCalledWith(
      'Hamiltonian Mechanics',
      expect.objectContaining({
        learnerProfile: {
          topics: { 'Lagrangian Mechanics': 'known' },
        },
      })
    );

    const seedBody = await seedRes.json();
    expect(seedBody.document.prerequisites).toEqual([
      'Lagrangian Mechanics',
      'Vector Calculus',
    ]);
    expect(seedBody.profile.topics['Lagrangian Mechanics']).toBe('known');

    // Start a chat on blk_02 and branch a sub-document (whose prerequisites are extracted from Block 0 bullets)
    await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Why do we use the Legendre transform?',
        docId: 'index',
      }),
    });

    const branchRes = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'index' }),
    });
    expect(branchRes.status).toBe(200);
    expect(branchGenerator).toHaveBeenCalledWith(
      expect.objectContaining({
        learnerProfile: {
          topics: { 'Lagrangian Mechanics': 'known' },
        },
      })
    );

    const branchBody = await branchRes.json();
    expect(branchBody.document.prerequisites).toEqual([
      'Convex Analysis',
      'Multivariable Calculus',
    ]);

    // Check .folio/notebook.json sidecar persists prerequisites on both documents
    const sidecar = JSON.parse(
      await fs.readFile(path.join(tempDirA, '.folio', 'notebook.json'), 'utf-8')
    );
    expect(sidecar.documents.index.prerequisites).toEqual([
      'Lagrangian Mechanics',
      'Vector Calculus',
    ]);
    expect(
      sidecar.documents['legendre-transform-deep-dive'].prerequisites
    ).toEqual(['Convex Analysis', 'Multivariable Calculus']);
  });

  it('POST /api/prerequisites/seed spawns a linked child sub-document from blk_00 and marks the prerequisite topic as learning (AC-3)', async () => {
    const seedGenerator = vi
      .fn()
      .mockResolvedValueOnce({
        title: 'Hamiltonian Mechanics',
        prerequisites: ['Vector Calculus', 'Lagrangian Mechanics'],
        blocks: [
          '## 0. Prerequisites & Notation\n\n- **Vector Calculus**: Gradients and divergence.\n- **Lagrangian Mechanics**: Action principle.',
          '## 1. Phase Space Coordinates\n\nCoordinates $(q, p)$.',
          '## 2. The Hamiltonian Function\n\nTotal energy $H(q, p)$.',
          '## 3. Canonical Equations\n\nSymplectic flow.',
        ],
      })
      .mockResolvedValueOnce({
        title: 'Vector Calculus Foundations',
        prerequisites: ['Single-Variable Calculus', 'Linear Algebra'],
        blocks: [
          '## 0. Prerequisites & Notation\n\n- **Single-Variable Calculus**: Derivatives and integrals.\n- **Linear Algebra**: Vectors and dot products.',
          '## 1. Scalar and Vector Fields\n\nAssigning numbers or vectors to points in space.',
          '## 2. Gradient and Directional Derivative\n\nDirection of steepest ascent.',
          '## 3. Divergence and Flux\n\nMeasuring net outflow from an infinitesimal volume.',
        ],
      });

    const app = createApp({
      workspaceDir: tempDirA,
      profilePath,
      seedGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    // Seed parent document
    await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hamiltonian Mechanics' }),
    });

    // Seed prerequisite 'Vector Calculus' from index
    const prereqRes = await app.request('/api/prerequisites/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: 'Vector Calculus',
        parentDocId: 'index',
      }),
    });

    expect(prereqRes.status).toBe(200);
    const prereqBody = await prereqRes.json();

    expect(prereqBody.document).toEqual({
      id: 'vector-calculus-foundations',
      title: 'Vector Calculus Foundations',
      filename: 'vector-calculus-foundations.md',
      parentId: 'index',
      parentBlockId: 'blk_00',
      childDocIds: [],
      prerequisites: ['Single-Variable Calculus', 'Linear Algebra'],
    });
    expect(prereqBody.documents.index.childDocIds).toContain(
      'vector-calculus-foundations'
    );
    expect(prereqBody.profile.topics['Vector Calculus']).toBe('learning');

    // Verify child markdown file exists on disk
    const childMd = await fs.readFile(
      path.join(tempDirA, 'vector-calculus-foundations.md'),
      'utf-8'
    );
    expect(childMd).toContain('## 1. Scalar and Vector Fields');

    // Verify parent blk_00 in index.md ends with deep dive link
    const indexMd = await fs.readFile(path.join(tempDirA, 'index.md'), 'utf-8');
    expect(indexMd).toContain(
      '[→ Deep dive: Vector Calculus Foundations](vector-calculus-foundations.md)'
    );
  });
});
