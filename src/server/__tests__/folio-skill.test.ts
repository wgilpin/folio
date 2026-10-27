import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { WorkspaceStore } from '../store.js';
import {
  FolioSkillClient,
  formatAbilityRecordSummary,
} from '../../skill/folio-client.js';

describe('Epic 02 — Cross-Mac Folio Skill & Programmatic Client', () => {
  let workspaceDir: string;
  let profilePath: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-skill-ws-')
    );
    profilePath = path.join(workspaceDir, '.folio', 'profile.json');
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('queries Learner Ability Record, searches Concept Blocks, lists documents, and fetches raw Markdown with Bearer token via FolioSkillClient and SKILL.md', async () => {
    const store = new WorkspaceStore(workspaceDir);
    const seeded = await store.seedRootDocument({
      title: 'Hamiltonian Mechanics',
      shortTitle: 'Hamiltonian Mechanics',
      prerequisites: ['Lagrangian Mechanics'],
      blocks: [
        '## Prerequisites & Foundations\n\n- Lagrangian Mechanics',
        '## Phase Space & Symplectic Geometry\n\nHamiltonian mechanics formulates classical dynamics on $(q, p)$ phase space with canonical equations.',
        '## Poisson Brackets & Liouville Theorem\n\nThe Poisson bracket $\{f, H\}$ governs time evolution and preserves phase-space volume.',
      ],
    });
    const docId = seeded.document!.id;
    expect(docId).toBe('hamiltonian-mechanics');

    const app = createApp({
      workspaceDir,
      profilePath,
      apiKey: 'teleosis-secret',
    });

    // Seed Learner Ability Record and mark Block 1 done via app
    const putProfileRes = await app.request('/api/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer teleosis-secret',
      },
      body: JSON.stringify({
        background: 'PhD in Theoretical Physics, comfortable with differential geometry',
        learningInstructions: 'Use rigorous geometric definitions and concrete tensor indices.',
        topics: {
          'Lagrangian Mechanics': 'known',
          'Symplectic Manifolds': 'learning',
          'KAM Theory': 'unseen',
        },
      }),
    });
    expect(putProfileRes.status).toBe(200);

    const markDoneRes = await app.request(
      `/api/blocks/${seeded.blocks[1]!.id}/done`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer teleosis-secret',
        },
        body: JSON.stringify({ done: true, docId }),
      }
    );
    expect(markDoneRes.status).toBe(200);

    // Wire FolioSkillClient with an in-process fetch adapter routed to app.fetch
    const client = new FolioSkillClient({
      baseUrl: 'https://folio.teleosis.ai/',
      apiKey: 'teleosis-secret',
      fetchImpl: (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(app.request(url, init));
      },
    });

    // 1. getAbilityRecord()
    const ability = await client.getAbilityRecord();
    expect(ability.profile.background).toContain('Theoretical Physics');
    expect(ability.profile.learningInstructions).toContain('rigorous geometric definitions');
    expect(ability.profile.topics['Lagrangian Mechanics']).toBe('known');
    expect(ability.profile.topics['Symplectic Manifolds']).toBe('learning');
    expect(ability.profile.engagedSources).toBeDefined();
    expect(ability.profile.engagedSources![0]?.docTitle).toBe('Hamiltonian Mechanics');
    expect(ability.summary).toContain('Theoretical Physics');
    expect(ability.summary).toContain('rigorous geometric definitions');
    expect(ability.summary).toContain('Lagrangian Mechanics');
    expect(ability.summary).toContain(
      '**Hamiltonian Mechanics** (1/3 blocks done): Phase Space & Symplectic Geometry'
    );
    expect(formatAbilityRecordSummary(ability.profile)).toBe(ability.summary);

    // 2. searchLibrary('Hamiltonian')
    const searchRes = await client.searchLibrary('Hamiltonian', 'hybrid', 5);
    expect(searchRes.query).toBe('Hamiltonian');
    expect(searchRes.results.length).toBeGreaterThan(0);
    expect(searchRes.results[0]?.docId).toBe('hamiltonian-mechanics');

    // 3. listDocuments()
    const docsRes = await client.listDocuments();
    expect(docsRes.document?.id).toBe('hamiltonian-mechanics');
    expect(docsRes.documents['hamiltonian-mechanics']?.title).toBe(
      'Hamiltonian Mechanics'
    );
    expect(docsRes.workspaceDir).toBe(workspaceDir);

    // 4. getDocumentMarkdown('hamiltonian-mechanics', { clean: true })
    const mdRes = await client.getDocumentMarkdown('hamiltonian-mechanics', {
      clean: true,
    });
    expect(mdRes.docId).toBe('hamiltonian-mechanics');
    expect(mdRes.title).toBe('Hamiltonian Mechanics');
    expect(mdRes.filename).toBe('hamiltonian-mechanics.md');
    expect(mdRes.doneCount).toBe(1);
    expect(mdRes.totalBlocks).toBe(3);
    expect(mdRes.markdown).toContain('## Phase Space & Symplectic Geometry');
    expect(mdRes.markdown).not.toContain('<!-- folio:block');

    // 5. Verify unauthorized client fails with descriptive error
    const unauthClient = new FolioSkillClient({
      baseUrl: 'https://folio.teleosis.ai',
      apiKey: 'wrong-key',
      fetchImpl: (input, init) => {
        const url = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(app.request(url, init));
      },
    });
    await expect(unauthClient.getAbilityRecord()).rejects.toThrow(/401/);

    // 6. Inspect skills/folio/SKILL.md and skills/folio/scripts/folio-query.mjs
    const repoRoot = path.resolve(import.meta.dirname, '../../..');
    const skillMd = await fs.readFile(
      path.join(repoRoot, 'skills/folio/SKILL.md'),
      'utf8'
    );
    expect(skillMd).toMatch(/^---\r?\nname:\s*folio\r?\ndescription:/);
    expect(skillMd).toContain('https://folio.teleosis.ai');
    expect(skillMd).toContain('TELEOSIS_API_KEY');
    expect(skillMd).toContain('/api/profile');
    expect(skillMd).toContain('/api/search');
    expect(skillMd).toContain('/api/doc');
    expect(skillMd).toContain('skills/folio/scripts/folio-query.mjs');

    const cliScript = await fs.readFile(
      path.join(repoRoot, 'skills/folio/scripts/folio-query.mjs'),
      'utf8'
    );
    expect(cliScript).toContain('FOLIO_URL');
    expect(cliScript).toContain('TELEOSIS_API_KEY');
    expect(cliScript).toContain('Authorization');
  });
});
