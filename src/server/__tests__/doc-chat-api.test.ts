import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceStore } from '../store.js';
import { createApp } from '../app.js';
import type {
  DocumentChatGenerator,
  DocumentIntegrateGenerator,
  DocumentBranchGenerator,
} from '../llm.js';

describe('Document-Level Notebook Chat API', () => {
  let tempDir: string;
  let store: WorkspaceStore;
  let initialIndexMd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-doc-chat-test-'));
    store = new WorkspaceStore(tempDir);

    await store.saveDocument('UK Misinformation Strategy', [
      {
        id: 'blk_00',
        markdown: '## Prerequisites & Foundations\n\nRegulatory context.',
      },
      {
        id: 'blk_01',
        markdown: '## 1. Online Safety Act\n\nStatutory duty of care for platforms.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Counter Disinformation Unit\n\nMonitoring and coordinating responses.',
      },
    ]);

    initialIndexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('POST /api/doc/chat passes full document context and sets blockId to null in activeChat', async () => {
    const capturedCalls: Parameters<DocumentChatGenerator>[0][] = [];

    const mockDocChatGenerator: DocumentChatGenerator = async (input) => {
      capturedCalls.push(input);
      return `Answer regarding ${input.context.title}: Misinformation strategy involves multiple departments.`;
    };

    const app = createApp({
      workspaceDir: tempDir,
      documentChatGenerator: mockDocChatGenerator,
      modelId: 'anthropic:claude-opus-4-6',
    });

    const res = await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is the broader UK policy approach?' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.activeChat).toBeDefined();
    expect(body.activeChat.blockId).toBeNull();
    expect(body.activeChat.messages).toHaveLength(2);
    expect(body.activeChat.messages[0]).toEqual({
      role: 'user',
      content: 'What is the broader UK policy approach?',
    });
    expect(body.activeChat.messages[1].role).toBe('assistant');

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0].context.docId).toBe('index');
    expect(capturedCalls[0].context.blocks).toHaveLength(3);

    // Verify index.md is untouched during chat
    const currentIndexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(currentIndexMd).toBe(initialIndexMd);
  });

  it('DELETE /api/doc/chat discards active notebook chat', async () => {
    const mockDocChatGenerator: DocumentChatGenerator = async () => 'Response';
    const app = createApp({
      workspaceDir: tempDir,
      documentChatGenerator: mockDocChatGenerator,
    });

    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });

    const delRes = await app.request('/api/doc/chat', {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
    const delBody = await delRes.json();
    expect(delBody.activeChat).toBeNull();
  });

  it('POST /api/doc/integrate appends new concept blocks to document and clears chat', async () => {
    const mockDocChatGenerator: DocumentChatGenerator = async () => 'Synthesized view';
    const mockDocIntegrateGenerator: DocumentIntegrateGenerator = async () => ({
      insertedBlocksMarkdown: [
        '## 3. Media Literacy Initiatives\n\nPublic campaigns to build critical consumption skills.',
      ],
    });

    const app = createApp({
      workspaceDir: tempDir,
      documentChatGenerator: mockDocChatGenerator,
      documentIntegrateGenerator: mockDocIntegrateGenerator,
    });

    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What about media literacy?' }),
    });

    const intRes = await app.request('/api/doc/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();
    expect(intBody.activeChat).toBeNull();
    expect(intBody.blocks).toHaveLength(4);
    expect(intBody.blocks[3].markdown).toContain('## 3. Media Literacy Initiatives');

    const updatedIndexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(updatedIndexMd).toContain('## 3. Media Literacy Initiatives');
  });

  it('POST /api/doc/integrate stages suggested edits on existing blocks via updatedBlocks without mutating disk directly', async () => {
    const mockDocChatGenerator: DocumentChatGenerator = async () => 'Clarification';
    const mockDocIntegrateGenerator: DocumentIntegrateGenerator = async () => ({
      updatedBlocks: [
        {
          blockId: 'blk_02',
          updatedMarkdown:
            '## 2. National Security Online Information Team\n\nFormerly Counter Disinformation Unit, coordinating cross-government responses.',
          reason: 'Update agency name from CDU to NSOIT',
        },
      ],
      insertedBlocksMarkdown: [],
    });

    const app = createApp({
      workspaceDir: tempDir,
      documentChatGenerator: mockDocChatGenerator,
      documentIntegrateGenerator: mockDocIntegrateGenerator,
    });

    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Update CDU name to NSOIT' }),
    });

    const intRes = await app.request('/api/doc/integrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(intRes.status).toBe(200);
    const intBody = await intRes.json();
    expect(intBody.activeChat).toBeNull();
    // Suggested edit staged
    expect(intBody.pendingEdits).toHaveLength(1);
    expect(intBody.pendingEdits[0].blockId).toBe('blk_02');
    expect(intBody.pendingEdits[0].reason).toBe('Update agency name from CDU to NSOIT');
    expect(intBody.pendingEdits[0].proposedMarkdown).toContain('National Security Online Information Team');

    // Verify index.md is untouched until accepted
    const currentIndexMd = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(currentIndexMd).toBe(initialIndexMd);
  });

  it('POST /api/doc/branch creates child document branched from notebook root', async () => {
    const mockDocChatGenerator: DocumentChatGenerator = async () => 'Deep dive needed';
    const mockDocBranchGenerator: DocumentBranchGenerator = async () => ({
      title: 'Online Safety Act Deep Dive',
      shortTitle: 'Online Safety Act',
      prerequisites: ['Regulatory Frameworks'],
      blocks: [
        '## Prerequisites & Foundations\n\nFoundational legal terms.',
        '## 1. Scope of the Act\n\nCategorisation of user-to-user services.',
        '## 2. Enforcement Powers\n\nOfcom enforcement mechanisms.',
        '## 3. Free Speech Balancing\n\nLegal protections and judicial review.',
      ],
    });

    const app = createApp({
      workspaceDir: tempDir,
      documentChatGenerator: mockDocChatGenerator,
      documentBranchGenerator: mockDocBranchGenerator,
    });

    await app.request('/api/doc/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Let us branch a deep dive' }),
    });

    const branchRes = await app.request('/api/doc/branch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(branchRes.status).toBe(200);
    const branchBody = await branchRes.json();
    expect(branchBody.activeChat).toBeNull();
    expect(branchBody.document.parentId).toBe('index');
    expect(branchBody.document.parentBlockId).toBeNull();
    expect(branchBody.document.title).toBe('Online Safety Act Deep Dive');
  });
});
