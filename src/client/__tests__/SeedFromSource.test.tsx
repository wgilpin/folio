// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('SeedFromSource (Phase 09 Epic 02 — Unified Seed from Source UI & Viewable Source Link)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('seeds a document from an uploaded file or pasted source text with optional steering prompt and renders viewable Source attachment link in document header', async () => {
    const emptyPayload = {
      document: null,
      documents: {},
      blocks: [],
      toc: [],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    const seededDocPayload = {
      document: {
        id: 'attention-paper',
        title: 'Attention Is All You Need: Multi-Head Attention',
        shortTitle: 'Multi-Head Attention',
        filename: 'attention-paper.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        sourceAttachment: {
          filename: 'attention-paper.pdf',
          mediaType: 'application/pdf',
          kind: 'pdf',
          byteSize: 24,
          createdAt: '2026-10-28T15:00:00.000Z',
        },
      },
      documents: {
        'attention-paper': {
          id: 'attention-paper',
          title: 'Attention Is All You Need: Multi-Head Attention',
          shortTitle: 'Multi-Head Attention',
          filename: 'attention-paper.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
          sourceAttachment: {
            filename: 'attention-paper.pdf',
            mediaType: 'application/pdf',
            kind: 'pdf',
            byteSize: 24,
            createdAt: '2026-10-28T15:00:00.000Z',
          },
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown: '## 0. Prerequisites & Foundations\n\nLinear algebra and softmax.',
        },
        {
          id: 'blk_01',
          markdown: '## 1. Scaled Dot-Product Attention\n\nAttention weights from queries and keys.',
        },
      ],
      toc: [
        { level: 2, text: '0. Prerequisites & Foundations', blockId: 'blk_00' },
        { level: 2, text: '1. Scaled Dot-Product Attention', blockId: 'blk_01' },
      ],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    let seedRequestBody: Record<string, unknown> | null = null;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(emptyPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/doc/seed' && init?.method === 'POST') {
        seedRequestBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify(seededDocPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 2, name: 'Seed a New Notebook' })
      ).toBeTruthy();
    });

    const topicInput = screen.getByLabelText(/Topic Prompt/i) as HTMLInputElement;
    const submitBtn = screen.getByRole('button', { name: 'Seed Topic' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    // 1. Paste multi-line AI chat transcript into the topic input -> auto-promotes to source attachment
    const pastedChat =
      'User: Explain scaled dot-product attention.\nAssistant: Scaled dot-product attention computes softmax(QK^T / sqrt(d_k))V so large d_k does not push softmax into tiny-gradient regions.';
    fireEvent.paste(topicInput, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' || type === 'text' ? pastedChat : '',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('seed-source-attachment').textContent).toContain(
        'pasted-source.txt'
      );
    });
    expect(topicInput.value).toBe('');
    expect(submitBtn.disabled).toBe(false);

    // Remove the pasted attachment before testing file upload
    fireEvent.click(screen.getByRole('button', { name: 'Remove source attachment' }));
    expect(screen.queryByTestId('seed-source-attachment')).toBeNull();
    expect(submitBtn.disabled).toBe(true);

    // 2. Upload a PDF source file via the file input and provide an optional steering prompt
    const fileInput = screen.getByLabelText('Upload source file') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4 dummy pdf bytes'], 'attention-paper.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('seed-source-attachment').textContent).toContain(
        'attention-paper.pdf'
      );
    });

    fireEvent.change(topicInput, {
      target: { value: 'Focus on multi-head attention equations' },
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(seedRequestBody).toEqual({
        prompt: 'Focus on multi-head attention equations',
        source: {
          filename: 'attention-paper.pdf',
          mediaType: 'application/pdf',
          kind: 'pdf',
          content: Buffer.from('%PDF-1.4 dummy pdf bytes', 'utf-8').toString('base64'),
          encoding: 'base64',
        },
      });
    });

    // Verify document header renders the clickable Source link
    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Attention Is All You Need: Multi-Head Attention',
        })
      ).toBeTruthy();
    });

    const sourceLink = screen.getByTestId('document-source-link') as HTMLAnchorElement;
    expect(sourceLink.textContent).toContain('Source: attention-paper.pdf');
    expect(sourceLink.getAttribute('href')).toBe('/api/doc/attention-paper/source');
    expect(sourceLink.getAttribute('target')).toBe('_blank');
  });

  it('allows seeding from an uploaded markdown file with an empty steering prompt', async () => {
    const emptyPayload = {
      document: null,
      documents: {},
      blocks: [],
      toc: [],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    const seededMdPayload = {
      document: {
        id: 'raft-notes',
        title: 'Raft Consensus Notes',
        shortTitle: 'Raft Consensus',
        filename: 'raft-notes.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        sourceAttachment: {
          filename: 'raft-notes.md',
          mediaType: 'text/markdown',
          kind: 'markdown',
          byteSize: 42,
          createdAt: '2026-10-28T15:05:00.000Z',
        },
      },
      documents: {},
      blocks: [{ id: 'blk_00', markdown: '## 0. Prerequisites & Foundations' }],
      toc: [],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    let seedRequestBody: Record<string, unknown> | null = null;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(emptyPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/doc/seed' && init?.method === 'POST') {
        seedRequestBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify(seededMdPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText('Upload source file')).toBeTruthy();
    });

    const fileInput = screen.getByLabelText('Upload source file') as HTMLInputElement;
    const mdFile = new File(['# Raft Notes\nLeader election and log replication.'], 'raft-notes.md', {
      type: 'text/markdown',
    });
    fireEvent.change(fileInput, { target: { files: [mdFile] } });

    await waitFor(() => {
      expect(screen.getByTestId('seed-source-attachment').textContent).toContain('raft-notes.md');
    });

    const submitBtn = screen.getByRole('button', { name: 'Seed Topic' }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(seedRequestBody).toEqual({
        prompt: '',
        source: {
          filename: 'raft-notes.md',
          mediaType: 'text/markdown',
          kind: 'markdown',
          content: '# Raft Notes\nLeader election and log replication.',
          encoding: 'utf-8',
        },
      });
    });
  });

  it('inserts a newline without starting generation when Shift-Enter is pressed in the Topic Prompt box, and submits on Enter', async () => {
    const emptyPayload = {
      document: null,
      documents: {},
      blocks: [],
      toc: [],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    const seededDocPayload = {
      document: {
        id: 'hamiltonian-mechanics',
        title: 'Hamiltonian Mechanics',
        shortTitle: 'Hamiltonian Mechanics',
        filename: 'hamiltonian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
      documents: {},
      blocks: [{ id: 'blk_00', markdown: '## 0. Prerequisites & Foundations' }],
      toc: [],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
    };

    let seedRequestCount = 0;
    let seedRequestBody: Record<string, unknown> | null = null;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(emptyPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/doc/seed' && init?.method === 'POST') {
        seedRequestCount += 1;
        seedRequestBody = JSON.parse(String(init.body));
        return new Response(JSON.stringify(seededDocPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Topic Prompt/i)).toBeTruthy();
    });

    const topicInput = screen.getByLabelText(/Topic Prompt/i) as HTMLTextAreaElement;

    await user.click(topicInput);
    await user.keyboard('Hamiltonian Mechanics{Shift>}{Enter}{/Shift}Focus on action-angle variables');

    expect(seedRequestCount).toBe(0);
    expect(topicInput.value).toBe('Hamiltonian Mechanics\nFocus on action-angle variables');

    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(seedRequestCount).toBe(1);
      expect(seedRequestBody).toEqual({
        prompt: 'Hamiltonian Mechanics\nFocus on action-angle variables',
      });
    });
  });

  it('interrupts in-flight block generation when Cancel is clicked', async () => {
    let seedSignal: AbortSignal | undefined;

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              document: null,
              documents: {},
              blocks: [],
              toc: [],
              activeChat: null,
              pendingEdits: [],
              modelId: 'anthropic:claude-opus-4-6',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }
      if (url === '/api/doc/seed' && init?.method === 'POST') {
        seedSignal = init.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }));
    });

    render(<App />);

    const topicInput = await screen.findByLabelText(/Topic Prompt/i);
    fireEvent.change(topicInput, { target: { value: 'Quantum Decoherence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seed Topic' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Generating blocks...' })).toBeTruthy();
    });

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(false);
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(seedSignal?.aborted).toBe(true);
      expect(screen.getByRole('button', { name: 'Seed Topic' })).toBeTruthy();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
