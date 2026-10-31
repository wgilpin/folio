import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import {
  ADVERSARIAL_REVIEW_INSTRUCTIONS,
  PEDAGOGICAL_PROFILES,
  resolvePedagogicalPrompt,
  type CellChatGenerator,
  type DocumentChatGenerator,
} from '../llm.js';

describe('Adversarial Review API (Epic 01)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-adv-review-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts activeProfileId: "adversarial-review" in PUT /api/settings and includes 6-step falsification-first instructions in resolvePedagogicalPrompt and ADVERSARIAL_REVIEW_INSTRUCTIONS', async () => {
    const app = createApp({ workspaceDir: tmpDir });

    const res = await app.request('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProfileId: 'adversarial-review' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.activeProfileId).toBe('adversarial-review');

    expect(PEDAGOGICAL_PROFILES['adversarial-review']).toBeDefined();
    expect(PEDAGOGICAL_PROFILES['adversarial-review'].id).toBe(
      'adversarial-review'
    );
    expect(PEDAGOGICAL_PROFILES['adversarial-review'].label).toBe(
      'Adversarial Spec Review'
    );

    const prompt = resolvePedagogicalPrompt(body.settings);
    expect(prompt).toBe(ADVERSARIAL_REVIEW_INSTRUCTIONS);

    const requiredPhrases = [
      'Adopt a Falsification Mindset',
      'Audit Cross-Layer Boundaries',
      'Re-Derive All Numbers from First Principles',
      'Trace Second-Order Consequences of Fixes',
      'Expose Unstated Dependencies and Closure Gaps',
      'Format the Critique by Severity',
      'Serious / Fatal Gaps',
      'Moderate Gaps',
      'Small Number / Arithmetic Errors',
      'Result and Open Risks',
      'Self-Conditioning in Long Threads',
      'Fixing Without Pricing the Fix',
      'Missing the Passive Elements',
    ];

    for (const phrase of requiredPhrases) {
      expect(ADVERSARIAL_REVIEW_INSTRUCTIONS).toContain(phrase);
      expect(prompt).toContain(phrase);
    }
  });

  it('POST /api/doc/review audits full document context plus saved raw sourceAttachment when present, persists activeChat (blockId: null), and enforces 409 pendingEdits gate', async () => {
    let targetAdjacentBlockId = 'blk_02';
    const documentChatGenerator = vi.fn<DocumentChatGenerator>(
      async () =>
        '### Serious / Fatal Gaps\n- Memory bandwidth bottleneck (requires 4 TB/s, link provides 400 GB/s).\n\n### Moderate Gaps\n- Missing calibration loop.\n\n### Small Number / Arithmetic Errors\n- Factor of 2 error in SRAM capacity.\n\n### Result and Open Risks\n- Unresolved thermal envelope.'
    );
    const integrateGenerator = vi.fn(async () => ({
      updatedBlockMarkdown: '## 1. Architecture\nUpdated architecture.',
      insertedBlocksMarkdown: [],
      suggestedEdits: [
        {
          targetBlockId: targetAdjacentBlockId,
          proposedMarkdown: '## 2. Power Budget\nAdjusted power budget.',
          reason: 'Align power calculation with architecture',
        },
      ],
    }));

    const app = createApp({
      workspaceDir: tmpDir,
      seedGenerator: async () => ({
        title: 'Photonic Accelerator Spec',
        shortTitle: 'Photonic Spec',
        toc: ['1. Architecture', '2. Power Budget', '3. Calibration'],
        prerequisites: ['Silicon Photonics', 'SRAM Arrays'],
        blocks: [
          '## Prerequisites & Foundations\n- Silicon Photonics\n- SRAM Arrays',
          '## 1. Architecture\n128x128 MZI mesh at 10 GHz.',
          '## 2. Power Budget\nTotal power 5W.',
          '## 3. Calibration\nThermal phase shifters.',
        ],
      }),
      documentChatGenerator,
      cellChatGenerator: async () => 'Cell reply',
      integrateGenerator,
    });

    const rawSourceSpec =
      '# Raw Hardware Spec\nClaim: 128x128 mesh consumes 5W total with 16-bit DACs.';
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Audit photonic accelerator',
        source: {
          filename: 'photonic-spec.md',
          mediaType: 'text/markdown',
          kind: 'markdown',
          content: rawSourceSpec,
          encoding: 'utf-8',
        },
      }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = await seedRes.json();
    const docId = seeded.document.id;
    const block1Id = seeded.blocks[1].id;
    targetAdjacentBlockId = seeded.blocks[2].id;

    const reviewRes = await app.request('/api/doc/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();

    expect(reviewBody.activeChat).toBeDefined();
    expect(reviewBody.activeChat.docId).toBe(docId);
    expect(reviewBody.activeChat.blockId).toBeNull();
    expect(reviewBody.activeChat.messages).toHaveLength(2);
    expect(reviewBody.activeChat.messages[0].role).toBe('user');
    expect(reviewBody.activeChat.messages[0].content).toContain(
      'Adversarial Spec Review'
    );
    expect(reviewBody.activeChat.messages[1].role).toBe('assistant');
    expect(reviewBody.activeChat.messages[1].content).toContain(
      'Serious / Fatal Gaps'
    );

    expect(documentChatGenerator).toHaveBeenCalledTimes(1);
    const callArg = documentChatGenerator.mock.calls[0]![0];
    expect(callArg.context.docId).toBe(docId);
    expect(callArg.context.blocks).toHaveLength(4);
    expect(callArg.pedagogicalPrompt).toContain('Adopt a Falsification Mindset');
    expect(callArg.source).toBeDefined();
    expect(callArg.source?.filename).toBe('photonic-spec.md');
    expect(callArg.source?.content).toBe(rawSourceSpec);

    // Discard doc chat, create a pending edit via cell chat + integrate, then verify 409 gate
    await app.request(`/api/doc/chat?docId=${docId}`, { method: 'DELETE' });
    await app.request(`/api/blocks/${block1Id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, message: 'Update architecture' }),
    });
    const intRes = await app.request(`/api/blocks/${block1Id}/integrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(intRes.status).toBe(200);

    const blockedReviewRes = await app.request('/api/doc/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(blockedReviewRes.status).toBe(409);
    const blockedBody = await blockedReviewRes.json();
    expect(blockedBody.error).toBe('Resolve pending suggested edits first');
  });

  it('POST /api/blocks/:id/review audits bounded [N-1, N, N+1] cell context without sourceAttachment, persists activeChat (blockId: id), and enforces 409 pendingEdits gate', async () => {
    let targetAdjacentBlockId = 'blk_02';
    const cellChatGenerator = vi.fn<CellChatGenerator>(
      async () =>
        '### Serious / Fatal Gaps\n- Block 1 MZI mesh clocking ignores DAC RC time constant.\n\n### Result and Open Risks\n- Need pipelined DAC driver spec.'
    );
    const integrateGenerator = vi.fn(async () => ({
      updatedBlockMarkdown: '## 1. Architecture\nUpdated.',
      insertedBlocksMarkdown: [],
      suggestedEdits: [
        {
          targetBlockId: targetAdjacentBlockId,
          proposedMarkdown: '## 2. Power Budget\nAdjusted.',
          reason: 'Sync with architecture block',
        },
      ],
    }));

    const app = createApp({
      workspaceDir: tmpDir,
      seedGenerator: async () => ({
        title: 'Photonic Accelerator Spec',
        shortTitle: 'Photonic Spec',
        toc: ['1. Architecture', '2. Power Budget', '3. Calibration'],
        prerequisites: ['Silicon Photonics'],
        blocks: [
          '## Prerequisites & Foundations\n- Silicon Photonics',
          '## 1. Architecture\n128x128 MZI mesh at 10 GHz.',
          '## 2. Power Budget\nTotal power 5W.',
          '## 3. Calibration\nThermal phase shifters.',
        ],
      }),
      cellChatGenerator,
      integrateGenerator,
    });

    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Audit photonic accelerator',
        source: {
          filename: 'photonic-spec.md',
          mediaType: 'text/markdown',
          kind: 'markdown',
          content: '# Raw Hardware Spec\nSome raw content.',
          encoding: 'utf-8',
        },
      }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = await seedRes.json();
    const docId = seeded.document.id;
    const block0Id = seeded.blocks[0].id;
    const block1Id = seeded.blocks[1].id;
    const block2Id = seeded.blocks[2].id;
    targetAdjacentBlockId = block2Id;

    const reviewRes = await app.request(`/api/blocks/${block1Id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json();

    expect(reviewBody.activeChat).toBeDefined();
    expect(reviewBody.activeChat.docId).toBe(docId);
    expect(reviewBody.activeChat.blockId).toBe(block1Id);
    expect(reviewBody.activeChat.messages).toHaveLength(2);
    expect(reviewBody.activeChat.messages[0].role).toBe('user');
    expect(reviewBody.activeChat.messages[0].content).toContain(block1Id);
    expect(reviewBody.activeChat.messages[1].role).toBe('assistant');
    expect(reviewBody.activeChat.messages[1].content).toContain(
      'Serious / Fatal Gaps'
    );

    expect(cellChatGenerator).toHaveBeenCalledTimes(1);
    const callArg = cellChatGenerator.mock.calls[0]![0] as unknown as Record<
      string,
      unknown
    >;
    expect(callArg.context).toBeDefined();
    const ctx = callArg.context as {
      previousBlock: { id: string } | null;
      targetBlock: { id: string };
      nextBlock: { id: string } | null;
    };
    expect(ctx.previousBlock?.id).toBe(block0Id);
    expect(ctx.targetBlock.id).toBe(block1Id);
    expect(ctx.nextBlock?.id).toBe(block2Id);
    expect(callArg.pedagogicalPrompt).toContain('Adopt a Falsification Mindset');
    expect(callArg.source).toBeUndefined();

    // Trigger pending edit and verify 409 gate on POST /api/blocks/:id/review
    const intRes = await app.request(`/api/blocks/${block1Id}/integrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(intRes.status).toBe(200);

    const blockedRes = await app.request(`/api/blocks/${block1Id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId }),
    });
    expect(blockedRes.status).toBe(409);
    const blockedBody = await blockedRes.json();
    expect(blockedBody.error).toBe('Resolve pending suggested edits first');
  });
});
