import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { WorkspaceStore } from '../store.js';
import { defaultSeedGenerator } from '../llm.js';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateObject: vi.fn(),
  };
});

import { generateObject } from 'ai';

describe('Epic 01 — Source-Grounded Seed API, On-Disk Attachment Storage & Viewable Source Route', () => {
  let workspaceDir: string;

  beforeEach(async () => {
    workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'folio-source-seed-api-')
    );
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it('POST /api/doc/seed synthesizes from pasted text, Markdown, or PDF source with optional prompt and persists sourceAttachment in SQLite and .folio/attachments', async () => {
    const seedGenerator = vi.fn().mockImplementation(async (prompt, options) => ({
      title: prompt
        ? `Guided: ${prompt}`
        : `Synthesized from ${options?.source?.filename ?? 'source'}`,
      shortTitle: prompt ? 'Guided Synthesis' : 'Source Synthesis',
      toc: ['1. Core Architecture', '2. Key Mechanisms', '3. Practical Summary'],
      prerequisites: ['Distributed Systems', 'Consensus Protocols'],
      blocks: [
        '## Prerequisites & Foundations\n\n- **Distributed Systems**\n- **Consensus Protocols**',
        '## 1. Core Architecture\n\nSynthesized architecture overview.',
        '## 2. Key Mechanisms\n\nDetailed breakdown of the mechanisms.',
        '## 3. Practical Summary\n\nKey takeaways from the source material.',
      ],
    }));

    const app = createApp({
      workspaceDir,
      seedGenerator,
    });

    // 1. Rejection when neither prompt nor source is provided
    const emptyRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(emptyRes.status).toBe(400);

    // 2. Pasted raw dirty web/chat text with empty prompt
    const rawPasteContent =
      'Navigation | Cookie Banner\nUser: How does Raft leader election work?\nAssistant: Raft uses randomized election timeouts...';
    const pasteRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '',
        source: {
          filename: 'pasted-source.txt',
          mediaType: 'text/plain',
          kind: 'paste',
          content: rawPasteContent,
          encoding: 'utf-8',
        },
      }),
    });
    expect(pasteRes.status).toBe(200);
    const pasteData = await pasteRes.json();
    expect(pasteData.document.id).toBe('source-synthesis');
    expect(pasteData.document.sourceAttachment).toEqual({
      filename: 'pasted-source.txt',
      mediaType: 'text/plain',
      kind: 'paste',
      byteSize: Buffer.byteLength(rawPasteContent, 'utf-8'),
      createdAt: expect.any(String),
    });
    expect(seedGenerator).toHaveBeenLastCalledWith(
      '',
      expect.objectContaining({
        source: expect.objectContaining({
          filename: 'pasted-source.txt',
          mediaType: 'text/plain',
          kind: 'paste',
          content: rawPasteContent,
          encoding: 'utf-8',
        }),
      })
    );

    const diskPastePath = path.join(
      workspaceDir,
      '.folio',
      'attachments',
      'source-synthesis',
      'pasted-source.txt'
    );
    const diskPasteText = await fs.readFile(diskPastePath, 'utf-8');
    expect(diskPasteText).toBe(rawPasteContent);

    // 3. Uploaded PDF (base64) with steering prompt
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF', 'utf-8');
    const pdfBase64 = pdfBytes.toString('base64');
    const pdfRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Focus on the mathematical proof in Section 3',
        source: {
          filename: 'attention-paper.pdf',
          mediaType: 'application/pdf',
          kind: 'pdf',
          content: pdfBase64,
          encoding: 'base64',
        },
      }),
    });
    expect(pdfRes.status).toBe(200);
    const pdfData = await pdfRes.json();
    expect(pdfData.document.id).toBe('guided-synthesis');
    expect(pdfData.document.sourceAttachment).toEqual({
      filename: 'attention-paper.pdf',
      mediaType: 'application/pdf',
      kind: 'pdf',
      byteSize: pdfBytes.byteLength,
      createdAt: expect.any(String),
    });

    const diskPdfPath = path.join(
      workspaceDir,
      '.folio',
      'attachments',
      'guided-synthesis',
      'attention-paper.pdf'
    );
    const diskPdfBuffer = await fs.readFile(diskPdfPath);
    expect(Buffer.compare(diskPdfBuffer, pdfBytes)).toBe(0);

    // 4. Verify SQLite persistence across fresh WorkspaceStore reload and block edits
    const reloadedStore = new WorkspaceStore(workspaceDir);
    const reloadedPdfDoc = await reloadedStore.loadDocument('guided-synthesis');
    expect(reloadedPdfDoc.document?.sourceAttachment).toEqual(
      pdfData.document.sourceAttachment
    );

    // Updating a block or toggling done must preserve sourceAttachment
    const afterUpdate = await reloadedStore.updateBlock(
      reloadedPdfDoc.blocks[1].id,
      '## 1. Core Architecture\n\nUpdated prose.',
      'guided-synthesis'
    );
    expect(afterUpdate.document?.sourceAttachment).toEqual(
      pdfData.document.sourceAttachment
    );

    // 5. Verify defaultSeedGenerator passes source material to generateObject
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        title: 'From LLM Source',
        shortTitle: 'LLM Source',
        toc: ['1. Intro', '2. Details', '3. Conclusion'],
        prerequisites: ['Basics'],
        blocks: [
          '## Prerequisites & Foundations\n\n- **Basics**',
          '## 1. Intro\n\nIntro.',
          '## 2. Details\n\nDetails.',
          '## 3. Conclusion\n\nConclusion.',
        ],
      },
    } as never);

    await defaultSeedGenerator('Extract key equations', {
      modelId: 'anthropic:claude-opus-4-6',
      source: {
        filename: 'notes.md',
        mediaType: 'text/markdown',
        kind: 'markdown',
        content: '# Raw Notes\n\nSome markdown content.',
        encoding: 'utf-8',
      },
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it('GET /api/doc/:id/source serves raw attachment bytes/text with original Content-Type and subsequent cell chats exclude raw source attachment from bounded context', async () => {
    const secretSourcePhrase =
      'UNMODIFIED_RAW_SOURCE_SECRET_TOKEN_998877_NEVER_IN_CELL_CHAT';
    const markdownSourceContent = `# Original Research Notes\n\n${secretSourcePhrase}\n\nDetailed transcript notes.`;

    const seedGenerator = vi.fn().mockResolvedValue({
      title: 'Research Synthesis: Memory Consistency',
      shortTitle: 'Memory Consistency',
      toc: ['1. Sequential Consistency', '2. Relaxed Models', '3. Fences'],
      prerequisites: ['Computer Architecture'],
      blocks: [
        '## Prerequisites & Foundations\n\n- **Computer Architecture**',
        '## 1. Sequential Consistency\n\nLamport definition of sequential consistency.',
        '## 2. Relaxed Models\n\nTotal store order and weak ordering.',
        '## 3. Fences\n\nMemory barriers in hardware.',
      ],
    });

    const cellChatGenerator = vi.fn().mockResolvedValue('Here is how fences work.');

    const app = createApp({
      workspaceDir,
      seedGenerator,
      cellChatGenerator,
    });

    // Seed with Markdown source
    const seedRes = await app.request('/api/doc/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Synthesize memory consistency models',
        source: {
          filename: 'research-notes.md',
          mediaType: 'text/markdown',
          kind: 'markdown',
          content: markdownSourceContent,
          encoding: 'utf-8',
        },
      }),
    });
    expect(seedRes.status).toBe(200);
    const seeded = await seedRes.json();
    const docId = seeded.document.id;
    expect(docId).toBe('memory-consistency');

    // GET /api/doc/:id/source returns 200 with exact raw text and Content-Type
    const sourceRes = await app.request(`/api/doc/${docId}/source`);
    expect(sourceRes.status).toBe(200);
    expect(sourceRes.headers.get('content-type')).toContain('text/markdown');
    expect(sourceRes.headers.get('content-disposition')).toContain(
      'research-notes.md'
    );
    const servedText = await sourceRes.text();
    expect(servedText).toBe(markdownSourceContent);

    // GET /api/doc/source?id=<docId> also works
    const querySourceRes = await app.request(
      `/api/doc/source?id=${encodeURIComponent(docId)}`
    );
    expect(querySourceRes.status).toBe(200);
    expect(await querySourceRes.text()).toBe(markdownSourceContent);

    // Subsequent cell chat on Block 1 receives only bounded [N-1, N, N+1] context and NOT raw source
    const targetBlockId = seeded.blocks[1].id;
    const chatRes = await app.request(`/api/blocks/${targetBlockId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docId,
        message: 'Can you clarify sequential consistency?',
      }),
    });
    expect(chatRes.status).toBe(200);
    expect(cellChatGenerator).toHaveBeenCalledTimes(1);
    const chatCallInput = cellChatGenerator.mock.calls[0][0];
    expect(JSON.stringify(chatCallInput)).not.toContain(secretSourcePhrase);
    expect(chatCallInput.context.targetBlock.id).toBe(targetBlockId);

    // Deleting the document removes .folio/attachments/<docId> and returns 404 on /source
    const deleteRes = await app.request(`/api/doc/${docId}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const afterDeleteRes = await app.request(`/api/doc/${docId}/source`);
    expect(afterDeleteRes.status).toBe(404);
  });
});
