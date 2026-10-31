import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { formatLearnerProfilePrompt } from '../llm.js';
import { WorkspaceStore } from '../store.js';

describe('Epic 01 — Central Learner Ability Record, Cell Done Persistence & LLM Calibration API', () => {
  let tmpDir: string;
  let workspaceDirA: string;
  let workspaceDirB: string;
  let profilePath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-ability-done-'));
    workspaceDirA = path.join(tmpDir, 'workspace-a');
    workspaceDirB = path.join(workspaceDirA, 'workspace-b');
    profilePath = path.join(tmpDir, 'profile.json');
    await fs.mkdir(workspaceDirA, { recursive: true });
    await fs.mkdir(workspaceDirB, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('PUT /api/profile persists background and learningInstructions across workspace switches', async () => {
    const app = createApp({
      workspaceDir: workspaceDirA,
      profilePath,
    });

    const putRes = await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        background: 'First year Nat Sci (Physical) at Cambridge.',
        learningInstructions:
          'I am a visual learner. Explain terms as they are introduced.',
      }),
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody.profile.background).toBe(
      'First year Nat Sci (Physical) at Cambridge.'
    );
    expect(putBody.profile.learningInstructions).toBe(
      'I am a visual learner. Explain terms as they are introduced.'
    );

    const switchRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: workspaceDirB }),
    });
    expect(switchRes.status).toBe(200);
    const switchBody = await switchRes.json();
    expect(switchBody.workspaceDir).toBe(workspaceDirB);
    expect(switchBody.profile.background).toBe(
      'First year Nat Sci (Physical) at Cambridge.'
    );
    expect(switchBody.profile.learningInstructions).toBe(
      'I am a visual learner. Explain terms as they are introduced.'
    );

    const getProfileRes = await app.request('/api/profile');
    expect(getProfileRes.status).toBe(200);
    const getProfileBody = await getProfileRes.json();
    expect(getProfileBody.profile.background).toBe(
      'First year Nat Sci (Physical) at Cambridge.'
    );
    expect(getProfileBody.profile.learningInstructions).toBe(
      'I am a visual learner. Explain terms as they are introduced.'
    );

    const getDocRes = await app.request('/api/doc');
    expect(getDocRes.status).toBe(200);
    const getDocBody = await getDocRes.json();
    expect(getDocBody.profile.background).toBe(
      'First year Nat Sci (Physical) at Cambridge.'
    );
    expect(getDocBody.profile.learningInstructions).toBe(
      'I am a visual learner. Explain terms as they are introduced.'
    );
  });

  it('PUT /api/blocks/:id/done persists cell done status in Markdown delimiters and SQLite and updates engagedSources in LearnerProfile', async () => {
    const app = createApp({
      workspaceDir: workspaceDirA,
      profilePath,
      seedGenerator: async () => ({
        title: 'Lagrangian Mechanics: Principle of Stationary Action',
        shortTitle: 'Lagrangian Mechanics',
        toc: [
          '1. Generalized Coordinates',
          '2. The Action Functional & Euler-Lagrange Equations',
          '3. Symmetries and Noether Theorem',
        ],
        prerequisites: ['Multivariable Calculus', 'Classical Newtonian Mechanics'],
        blocks: [
          '## Prerequisites & Foundations\n\n- **Multivariable Calculus**: Partial derivatives.\n- **Classical Newtonian Mechanics**: Force and momentum.',
          '## 1. Generalized Coordinates\n\nConfiguration space coordinates $q_i$.',
          '## 2. The Action Functional & Euler-Lagrange Equations\n\nThe action $S = \\int L \\, dt$ is stationary.',
          '## 3. Symmetries and Noether Theorem\n\nContinuous symmetries yield conserved quantities.',
        ],
      }),
    });

    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Lagrangian Mechanics' }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = await seedRes.json();
    expect(seeded.document.id).toBe('lagrangian-mechanics');
    expect(seeded.blocks.map((b: { id: string }) => b.id)).toEqual([
      'blk_00',
      'blk_02',
      'blk_03',
      'blk_04',
    ]);

    const firstBodyBlockId = seeded.blocks[1].id;
    const doneRes1 = await app.request(`/api/blocks/${firstBodyBlockId}/done`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true, docId: 'lagrangian-mechanics' }),
    });
    expect(doneRes1.status).toBe(200);
    const doneBody1 = await doneRes1.json();
    const updatedBlock1 = doneBody1.blocks.find(
      (b: { id: string }) => b.id === firstBodyBlockId
    );
    expect(updatedBlock1.done).toBe(true);

    // Check Markdown file delimiter on disk
    const rawMd = await fs.readFile(
      path.join(workspaceDirA, 'lagrangian-mechanics.md'),
      'utf-8'
    );
    expect(rawMd).toContain(
      `<!-- folio:block id="${firstBodyBlockId}" done="true" -->`
    );
    expect(rawMd).toContain('<!-- folio:block id="blk_00" -->');

    // Check fresh WorkspaceStore reload preserves done
    const freshStore = new WorkspaceStore(workspaceDirA);
    const reloaded = await freshStore.loadDocument('lagrangian-mechanics');
    expect(
      reloaded.blocks.find((b) => b.id === firstBodyBlockId)?.done
    ).toBe(true);
    expect(reloaded.blocks.find((b) => b.id === 'blk_00')?.done).toBeUndefined();

    // Check SQLite blocks.done column
    const sqliteDb = new DatabaseSync(
      path.join(workspaceDirA, '.folio', 'library.sqlite')
    );
    try {
      const row = sqliteDb
        .prepare(
          'SELECT done FROM blocks WHERE doc_id = ? AND block_id = ?'
        )
        .get('lagrangian-mechanics', firstBodyBlockId) as
        | { done: number }
        | undefined;
      expect(row?.done).toBe(1);
    } finally {
      sqliteDb.close();
    }

    // Check engagedSources & topic familiarity ('learning' when partially done)
    expect(doneBody1.profile.engagedSources).toHaveLength(1);
    expect(doneBody1.profile.engagedSources[0]).toMatchObject({
      docId: 'lagrangian-mechanics',
      docTitle: 'Lagrangian Mechanics: Principle of Stationary Action',
      completedBlockIds: [firstBodyBlockId],
      completedSectionHeadings: ['1. Generalized Coordinates'],
      totalBlocks: 4,
    });
    expect(doneBody1.profile.topics['Lagrangian Mechanics']).toBe('learning');

    // Mark remaining body blocks done -> promotes topic familiarity to 'known'
    for (const block of seeded.blocks.slice(2)) {
      const res = await app.request(`/api/blocks/${block.id}/done`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true, docId: 'lagrangian-mechanics' }),
      });
      expect(res.status).toBe(200);
    }

    const getDocAfterAllBodyDone = await app.request(
      '/api/doc?id=lagrangian-mechanics'
    );
    const finalBody = await getDocAfterAllBodyDone.json();
    expect(finalBody.profile.topics['Lagrangian Mechanics']).toBe('known');
    expect(finalBody.profile.engagedSources[0].completedBlockIds).toEqual([
      seeded.blocks[1].id,
      seeded.blocks[2].id,
      seeded.blocks[3].id,
    ]);
  });

  it('threads unified LearnerProfile (background, learningInstructions, engagedSources) into seed, chat, integrate, and branch generators', async () => {
    const capturedProfiles: Record<string, unknown> = {};

    const app = createApp({
      workspaceDir: workspaceDirA,
      profilePath,
      seedGenerator: async (_prompt, opts) => {
        capturedProfiles.seed = opts?.learnerProfile;
        return {
          title: 'Fourier Analysis',
          shortTitle: 'Fourier Analysis',
          toc: ['1. Trigonometric Series', '2. Fourier Transform', '3. Parseval Theorem'],
          prerequisites: ['Complex Numbers'],
          blocks: [
            '## Prerequisites & Foundations\n\n- **Complex Numbers**: Euler formula.',
            '## 1. Trigonometric Series\n\nPeriodic decomposition.',
            '## 2. Fourier Transform\n\nFrequency domain representation.',
            '## 3. Parseval Theorem\n\nEnergy conservation in frequency domain.',
          ],
        };
      },
      cellChatGenerator: async (input) => {
        capturedProfiles.cellChat = input.learnerProfile;
        return 'Cell chat reply calibrated to learner ability.';
      },
      integrateGenerator: async (input) => {
        capturedProfiles.cellIntegrate = input.learnerProfile;
        return {
          updatedBlockMarkdown:
            '## 1. Trigonometric Series\n\nPeriodic decomposition with visual intuition.',
          insertedBlocksMarkdown: [],
          suggestedEdits: [],
        };
      },
      branchGenerator: async (input) => {
        capturedProfiles.cellBranch = input.learnerProfile;
        return {
          title: 'Euler Formula Deep Dive',
          shortTitle: 'Euler Formula',
          toc: ['1. Unit Circle', '2. Series Expansion', '3. Phasors'],
          prerequisites: ['Trigonometry'],
          blocks: [
            '## Prerequisites & Foundations\n\n- **Trigonometry**: Sine and cosine.',
            '## 1. Unit Circle\n\nRotation in complex plane.',
            '## 2. Series Expansion\n\nTaylor series.',
            '## 3. Phasors\n\nRotating vectors.',
          ],
        };
      },
      documentChatGenerator: async (input) => {
        capturedProfiles.docChat = input.learnerProfile;
        return 'Document chat reply calibrated to learner ability.';
      },
      documentIntegrateGenerator: async (input) => {
        capturedProfiles.docIntegrate = input.learnerProfile;
        return {
          updatedBlocks: [],
          insertedBlocksMarkdown: [],
        };
      },
      documentBranchGenerator: async (input) => {
        capturedProfiles.docBranch = input.learnerProfile;
        return {
          title: 'Parseval Energy Identity',
          shortTitle: 'Parseval Identity',
          toc: ['1. Inner Products', '2. Plancherel Theorem', '3. Signal Energy'],
          prerequisites: ['Linear Algebra'],
          blocks: [
            '## Prerequisites & Foundations\n\n- **Linear Algebra**: Orthogonality.',
            '## 1. Inner Products\n\nHilbert space.',
            '## 2. Plancherel Theorem\n\nUnitary operator.',
            '## 3. Signal Energy\n\nSpectral density.',
          ],
        };
      },
    });

    // Populate background and learning instructions
    await app.request('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        background: 'First year Nat Sci (Physical) at Cambridge.',
        learningInstructions:
          'I am a visual learner. Explain terms as they are introduced.',
        topics: { 'Vector Calculus': 'known' },
      }),
    });

    // 1. Seed document
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Fourier Analysis' }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = await seedRes.json();
    const targetBlockId = seeded.blocks[1].id;

    // Mark block 1 as done so engagedSources is populated
    await app.request(`/api/blocks/${targetBlockId}/done`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: true, docId: 'fourier-analysis' }),
    });

    // 2. Cell chat + integrate
    await app.request(`/api/blocks/${targetBlockId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Can we visualize this?',
        docId: 'fourier-analysis',
      }),
    });
    await app.request(`/api/blocks/${targetBlockId}/integrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'fourier-analysis' }),
    });

    // 3. Cell chat + branch
    await app.request(`/api/blocks/${targetBlockId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Branch Euler formula',
        docId: 'fourier-analysis',
      }),
    });
    await app.request(`/api/blocks/${targetBlockId}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'fourier-analysis' }),
    });

    // 4. Document chat + integrate
    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Summarize the whole notebook.',
        docId: 'fourier-analysis',
      }),
    });
    await app.request('/api/doc/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'fourier-analysis' }),
    });

    // 5. Document chat + branch
    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Branch Parseval identity.',
        docId: 'fourier-analysis',
      }),
    });
    await app.request('/api/doc/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId: 'fourier-analysis' }),
    });

    for (const key of [
      'seed',
      'cellChat',
      'cellIntegrate',
      'cellBranch',
      'docChat',
      'docIntegrate',
      'docBranch',
    ]) {
      expect(capturedProfiles[key]).toBeDefined();
      expect(capturedProfiles[key]).toMatchObject({
        background: 'First year Nat Sci (Physical) at Cambridge.',
        learningInstructions:
          'I am a visual learner. Explain terms as they are introduced.',
      });
    }

    const promptText = formatLearnerProfilePrompt(
      capturedProfiles.docBranch as Parameters<typeof formatLearnerProfilePrompt>[0]
    );
    expect(promptText).toContain(
      'First year Nat Sci (Physical) at Cambridge.'
    );
    expect(promptText).toContain(
      'I am a visual learner. Explain terms as they are introduced.'
    );
    expect(promptText).toContain('Vector Calculus');
    expect(promptText).toContain('Fourier Analysis');
    expect(promptText).toContain('1. Trigonometric Series');
  });
});
