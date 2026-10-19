// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('Document-Level "Ask Notebook" Chat UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders Ask Notebook FAB, opens drawer, sends message, and integrates new concept blocks into notebook', async () => {
    let currentBlocks = [
      {
        id: 'blk_00',
        markdown: '## Prerequisites & Foundations\n\nMisinformation fundamentals.',
      },
      {
        id: 'blk_01',
        markdown: '## 1. Regulatory Framework\n\nOnline Safety Act statutory regime.',
      },
    ];

    let activeChatState: {
      docId: string;
      blockId: string | null;
      modelId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'UK Government Approach to Misinformation',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Regulatory Framework', blockId: 'blk_01' },
            ],
            activeChat: activeChatState,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/doc/chat') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        activeChatState = {
          docId: 'index',
          blockId: null,
          modelId: 'anthropic:claude-opus-4-6',
          messages: [
            { role: 'user', content: body.message },
            {
              role: 'assistant',
              content:
                'The UK approach combines the Online Safety Act with the Counter Disinformation Unit (now NSOIT) and media literacy initiatives.',
            },
          ],
        };

        return new Response(
          JSON.stringify({ activeChat: activeChatState }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/doc/integrate') && init?.method === 'POST') {
        activeChatState = null;
        currentBlocks = [
          ...currentBlocks,
          {
            id: 'blk_02',
            markdown:
              '## 2. Institutional Response\n\nThe National Security Online Information Team coordinates cross-government responses.',
          },
        ];

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'UK Government Approach to Misinformation',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Regulatory Framework', blockId: 'blk_01' },
              { level: 2, text: '2. Institutional Response', blockId: 'blk_02' },
            ],
            activeChat: null,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/doc/chat') && init?.method === 'DELETE') {
        activeChatState = null;
        return new Response(JSON.stringify({ activeChat: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<App />);

    // Wait for document to load and FAB to appear
    const fabButton = await screen.findByTestId('ask-notebook-fab');
    expect(fabButton).toBeInTheDocument();
    expect(fabButton).toHaveTextContent('Ask Notebook');

    // Click FAB to open document chat drawer
    await user.click(fabButton);

    const drawer = await screen.findByTestId('document-chat-drawer');
    expect(drawer).toBeInTheDocument();
    expect(screen.getByText('Ask Notebook')).toBeInTheDocument();
    expect(screen.getByText('Full Scope')).toBeInTheDocument();

    // Type a question not tied to any cell
    const input = screen.getByRole('textbox', { name: 'Question for notebook' });
    await user.type(input, 'Tell me about the UK gov institutional response');

    const sendBtn = screen.getByRole('button', { name: 'Send' });
    await user.click(sendBtn);

    // Assistant reply should appear
    await waitFor(() => {
      expect(
        screen.getByText(/Online Safety Act with the Counter Disinformation Unit/i)
      ).toBeInTheDocument();
    });

    // Click Integrate button
    const integrateBtn = within(drawer).getByRole('button', {
      name: 'Integrate notebook chat into document',
    });
    await waitFor(() => {
      expect(integrateBtn).toBeEnabled();
    });
    await user.click(integrateBtn);

    // Drawer closes and new concept block is appended
    await waitFor(() => {
      expect(
        screen.queryByTestId('document-chat-drawer')
      ).not.toBeInTheDocument();
    });

    expect(
      screen.getByRole('heading', { name: '2. Institutional Response' })
    ).toBeInTheDocument();
  });

  it('discards document chat when Discard is clicked', async () => {
    let activeChatState: {
      docId: string;
      blockId: string | null;
      modelId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } | null = {
      docId: 'index',
      blockId: null,
      modelId: 'anthropic:claude-opus-4-6',
      messages: [
        { role: 'user', content: 'What about misinformation?' },
        { role: 'assistant', content: 'Here is an overview...' },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Misinformation Notebook',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: [
              { id: 'blk_01', markdown: '## 1. Intro\n\nIntroductory content.' },
            ],
            toc: [{ level: 2, text: '1. Intro', blockId: 'blk_01' }],
            activeChat: activeChatState,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/doc/chat') && init?.method === 'DELETE') {
        activeChatState = null;
        return new Response(JSON.stringify({ activeChat: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<App />);

    // Since activeChat had blockId === null, the drawer should be open automatically
    const drawer = await screen.findByTestId('document-chat-drawer');
    expect(drawer).toBeInTheDocument();
    expect(screen.getByText('Here is an overview...')).toBeInTheDocument();

    const discardBtn = screen.getByRole('button', {
      name: 'Discard notebook chat',
    });
    await user.click(discardBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('document-chat-drawer')).not.toBeInTheDocument();
    });
  });

  it('disables Ask Notebook FAB when pending edits exist', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Test Notebook',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: [
              { id: 'blk_01', markdown: '## 1. Block One\n\nContent.' },
            ],
            toc: [{ level: 2, text: '1. Block One', blockId: 'blk_01' }],
            activeChat: null,
            pendingEdits: [
              {
                id: 'edit_01',
                docId: 'index',
                blockId: 'blk_01',
                originalMarkdown: '## 1. Block One\n\nContent.',
                proposedMarkdown: '## 1. Block One\n\nUpdated content.',
                reason: 'Fix transition',
                sourceBlockId: 'blk_00',
              },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    render(<App />);

    const fabButton = await screen.findByTestId('ask-notebook-fab');
    expect(fabButton).toBeInTheDocument();
    expect(fabButton).toBeDisabled();
    expect(fabButton).toHaveAttribute(
      'title',
      'Resolve pending suggested edits first'
    );
  });

  it('stages suggested edits on existing cards when integrating notebook chat, and allows accepting the edit', async () => {
    let currentBlocks = [
      {
        id: 'blk_01',
        markdown: '## 1. Counter Disinformation Unit\n\nCoordinates Whitehall responses.',
      },
    ];

    let pendingEditsState: any[] = [];
    let activeChatState: any = {
      docId: 'index',
      blockId: null,
      modelId: 'anthropic:claude-opus-4-6',
      messages: [
        { role: 'user', content: 'Rename CDU to NSOIT' },
        { role: 'assistant', content: 'I will revise the unit name in block 1.' },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Misinformation Policy',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [{ level: 2, text: '1. Counter Disinformation Unit', blockId: 'blk_01' }],
            activeChat: activeChatState,
            pendingEdits: pendingEditsState,
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/doc/integrate') && init?.method === 'POST') {
        activeChatState = null;
        pendingEditsState = [
          {
            id: 'edit_01',
            docId: 'index',
            blockId: 'blk_01',
            originalMarkdown: '## 1. Counter Disinformation Unit\n\nCoordinates Whitehall responses.',
            proposedMarkdown: '## 1. National Security Online Information Team\n\nCoordinates Whitehall responses.',
            reason: 'Update agency name from CDU to NSOIT',
            sourceBlockId: 'doc',
          },
        ];

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Misinformation Policy',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [{ level: 2, text: '1. Counter Disinformation Unit', blockId: 'blk_01' }],
            activeChat: null,
            pendingEdits: pendingEditsState,
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/edits/edit_01/accept') && init?.method === 'POST') {
        currentBlocks = [
          {
            id: 'blk_01',
            markdown: '## 1. National Security Online Information Team\n\nCoordinates Whitehall responses.',
          },
        ];
        pendingEditsState = [];

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Misinformation Policy',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [{ level: 2, text: '1. National Security Online Information Team', blockId: 'blk_01' }],
            activeChat: null,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<App />);

    // Drawer is automatically open because activeChat has blockId === null
    const drawer = await screen.findByTestId('document-chat-drawer');
    expect(drawer).toBeInTheDocument();

    const integrateBtn = within(drawer).getByRole('button', {
      name: 'Integrate notebook chat into document',
    });
    expect(integrateBtn).toBeEnabled();
    await user.click(integrateBtn);

    // Verify drawer closed and GateBanner appeared
    await waitFor(() => {
      expect(screen.queryByTestId('document-chat-drawer')).not.toBeInTheDocument();
    });

    const gateBanner = await screen.findByTestId('gate-banner');
    expect(gateBanner).toBeInTheDocument();
    expect(screen.getByText(/1 pending suggested edit/i)).toBeInTheDocument();

    // Verify diff on the card
    const block1Card = screen.getByTestId('concept-block-blk_01');
    expect(within(block1Card).getByText(/Update agency name from CDU to NSOIT/i)).toBeInTheDocument();

    // Accept the edit
    const acceptBtn = within(block1Card).getByRole('button', { name: /accept suggested edit/i });
    await user.click(acceptBtn);

    // Card is updated
    await waitFor(() => {
      expect(screen.queryByTestId('gate-banner')).not.toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: '1. National Security Online Information Team' })
      ).toBeInTheDocument();
    });
  });
});

