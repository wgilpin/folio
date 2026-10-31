import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { PEDAGOGICAL_PROFILES } from '../llm.js';
import { WorkspaceStore } from '../store.js';

describe('BYOM Settings & Workspace Switcher API (Epic 01)', () => {
  let workspaceA: string;
  let workspaceB: string;

  beforeEach(async () => {
    workspaceA = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-ws-a-'));
    workspaceB = path.join(workspaceA, 'subworkspace-b');
  });

  afterEach(async () => {
    await fs.rm(workspaceA, { recursive: true, force: true });
  });

  it('PUT /api/settings persists modelId, reasoningEffort, and pedagogical profile in .folio/notebook.json and forwards them to seed, chat, integrate, and branch generators', async () => {
    const seedCalls: Array<{
      prompt: string;
      options?: {
        modelId?: string;
        reasoningEffort?: string;
        pedagogicalPrompt?: string;
      };
    }> = [];
    const chatCalls: Array<{
      modelId: string;
      reasoningEffort?: string;
      pedagogicalPrompt?: string;
    }> = [];
    const integrateCalls: Array<{
      modelId: string;
      reasoningEffort?: string;
      pedagogicalPrompt?: string;
    }> = [];
    const branchCalls: Array<{
      modelId: string;
      reasoningEffort?: string;
      pedagogicalPrompt?: string;
    }> = [];

    const app = createApp({
      workspaceDir: workspaceA,
      modelId: 'anthropic:claude-opus-4-6',
      seedGenerator: async (prompt, options) => {
        seedCalls.push({ prompt, options });
        return {
          title: 'General Relativity Basics',
          blocks: [
            '## 0. Prerequisites & Notation\n\nSpacetime interval $ds^2$.',
            '## 1. Equivalence Principle\n\nGravity and acceleration.',
            '## 2. Geodesic Equation\n\nCurved paths in spacetime.',
            '## 3. Einstein Field Equations\n\nMatter curves geometry.',
          ],
        };
      },
      cellChatGenerator: async (input) => {
        chatCalls.push({
          modelId: input.modelId,
          reasoningEffort: input.reasoningEffort,
          pedagogicalPrompt: input.pedagogicalPrompt,
        });
        return 'Here is the tensor derivation.';
      },
      integrateGenerator: async (input) => {
        integrateCalls.push({
          modelId: input.modelId,
          reasoningEffort: input.reasoningEffort,
          pedagogicalPrompt: input.pedagogicalPrompt,
        });
        return {
          updatedBlockMarkdown:
            '## 1. Equivalence Principle\n\nGravity and acceleration with Christoffel symbols.',
          insertedBlocksMarkdown: [],
          suggestedEdits: [],
        };
      },
      branchGenerator: async (input) => {
        branchCalls.push({
          modelId: input.modelId,
          reasoningEffort: input.reasoningEffort,
          pedagogicalPrompt: input.pedagogicalPrompt,
        });
        return {
          title: 'Christoffel Symbols Deep Dive',
          blocks: [
            '## 0. Prerequisites & Notation\n\nMetric tensor $g_{\\mu\\nu}$.',
            '## 1. Connection Coefficients\n\nCovariant derivative.',
            '## 2. Geodesic Derivation\n\nVariational principle.',
            '## 3. Flat Space Limit\n\nVanishing curvature.',
          ],
        };
      },
    });

    // AC-1: PUT /api/settings persists settings in .folio/notebook.json
    const settingsRes = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'openai:o3',
        reasoningEffort: 'high',
        activeProfileId: 'rigorous-derivation',
        customSystemPrompt: 'Always use tensor index notation.',
      }),
    });
    expect(settingsRes.status).toBe(200);
    const settingsBody = await settingsRes.json();
    expect(settingsBody.modelId).toBe('openai:o3');
    expect(settingsBody.settings).toEqual({
      modelId: 'openai:o3',
      reasoningEffort: 'high',
      activeProfileId: 'rigorous-derivation',
      customSystemPrompt: 'Always use tensor index notation.',
    });

    const sidecarRaw = await new WorkspaceStore(workspaceA).loadState();
    expect(sidecarRaw.settings).toEqual({
      modelId: 'openai:o3',
      reasoningEffort: 'high',
      activeProfileId: 'rigorous-derivation',
      customSystemPrompt: 'Always use tensor index notation.',
    });

    // GET /api/doc returns updated settings and modelId: 'openai:o3'
    const getDocRes = await app.request('/api/doc');
    expect(getDocRes.status).toBe(200);
    const getDocBody = await getDocRes.json();
    expect(getDocBody.modelId).toBe('openai:o3');
    expect(getDocBody.settings).toEqual({
      modelId: 'openai:o3',
      reasoningEffort: 'high',
      activeProfileId: 'rigorous-derivation',
      customSystemPrompt: 'Always use tensor index notation.',
    });
    expect(getDocBody.workspaceDir).toBe(workspaceA);

    // AC-2: Seed receives settings
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'General Relativity' }),
    });
    expect(seedRes.status).toBe(200);
    expect(seedCalls).toHaveLength(1);
    expect(seedCalls[0].options).toEqual({
      modelId: 'openai:o3',
      reasoningEffort: 'high',
      pedagogicalPrompt: PEDAGOGICAL_PROFILES['rigorous-derivation'].instructions,
    });

    // Switch to custom profile and low reasoningEffort, verify chat + integrate + branch
    await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId: 'google:gemini-2.5-pro',
        reasoningEffort: 'low',
        activeProfileId: 'custom',
      }),
    });

    const chatRes = await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Derive the geodesic equation' }),
    });
    expect(chatRes.status).toBe(200);
    expect(chatCalls).toHaveLength(1);
    expect(chatCalls[0]).toEqual({
      modelId: 'google:gemini-2.5-pro',
      reasoningEffort: 'low',
      pedagogicalPrompt: 'Always use tensor index notation.',
    });

    const integrateRes = await app.request('/api/blocks/blk_02/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(integrateRes.status).toBe(200);
    expect(integrateCalls).toHaveLength(1);
    expect(integrateCalls[0]).toEqual({
      modelId: 'google:gemini-2.5-pro',
      reasoningEffort: 'low',
      pedagogicalPrompt: 'Always use tensor index notation.',
    });

    // Start another chat to test branchGenerator
    await app.request('/api/blocks/blk_02/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unpack Christoffel symbols' }),
    });
    const branchRes = await app.request('/api/blocks/blk_02/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(branchRes.status).toBe(200);
    expect(branchCalls).toHaveLength(1);
    expect(branchCalls[0]).toEqual({
      modelId: 'google:gemini-2.5-pro',
      reasoningEffort: 'low',
      pedagogicalPrompt: 'Always use tensor index notation.',
    });
  });

  it('POST /api/workspaces/switch dynamically switches the active workspace folder and returns its loaded document and settings', async () => {
    const app = createApp({
      workspaceDir: workspaceA,
      modelId: 'anthropic:claude-opus-4-6',
      seedGenerator: async (prompt) => ({
        title: `Topic: ${prompt}`,
        blocks: [
          '## 0. Prerequisites & Notation\n\nPrereq A.',
          '## 1. Concept One\n\nBody A1.',
          '## 2. Concept Two\n\nBody A2.',
          '## 3. Concept Three\n\nBody A3.',
        ],
      }),
    });

    // Seed workspaceA
    const seedARes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Workspace A Notebook' }),
    });
    expect(seedARes.status).toBe(200);

    // Check GET /api/workspaces initially
    const wsRes1 = await app.request('/api/workspaces');
    expect(wsRes1.status).toBe(200);
    const wsBody1 = await wsRes1.json();
    expect(wsBody1.workspaceDir).toBe(workspaceA);
    expect(wsBody1.workspaces).toEqual([workspaceA]);

    // Switch to workspaceB (which is currently empty)
    const switchRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: workspaceB }),
    });
    expect(switchRes.status).toBe(200);
    const switchBody = await switchRes.json();
    expect(switchBody.workspaceDir).toBe(workspaceB);
    expect(switchBody.workspaces).toEqual([workspaceA, workspaceB]);
    expect(switchBody.document).toBeNull();
    expect(switchBody.blocks).toEqual([]);

    // Seed workspaceB with its own document and update settings in workspaceB
    await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: 'openai:gpt-4.1' }),
    });
    await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Workspace B Notebook' }),
    });

    const docBRes = await app.request('/api/doc');
    const docBBody = await docBRes.json();
    expect(docBBody.document.title).toBe('Topic: Workspace B Notebook');
    expect(docBBody.modelId).toBe('openai:gpt-4.1');
    expect(docBBody.workspaceDir).toBe(workspaceB);

    // Switch back to workspaceA and confirm workspaceA was untouched
    const switchBackRes = await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: workspaceA }),
    });
    expect(switchBackRes.status).toBe(200);
    const switchBackBody = await switchBackRes.json();
    expect(switchBackBody.workspaceDir).toBe(workspaceA);
    expect(switchBackBody.document.title).toBe('Topic: Workspace A Notebook');
    expect(switchBackBody.modelId).toBe('anthropic:claude-opus-4-6');

    // Switch to workspaceB and verify a newly created app instance sharing the same profilePath boots directly into workspaceB
    const sharedProfilePath = path.join(workspaceA, '.folio', 'profile.json');
    await app.request('/api/workspaces/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceDir: workspaceB }),
    });

    const restartedApp = createApp({
      workspaceDir: workspaceA,
      profilePath: sharedProfilePath,
      modelId: 'anthropic:claude-opus-4-6',
    });
    const restartedRes = await restartedApp.request('/api/doc');
    expect(restartedRes.status).toBe(200);
    const restartedBody = await restartedRes.json();
    expect(restartedBody.workspaceDir).toBe(workspaceB);
    expect(restartedBody.document.title).toBe('Topic: Workspace B Notebook');
  });
});
