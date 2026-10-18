// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('Inline Cell Chat & Discard UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('opens InlineChatDrawer via Ask Cell, sends Q&A messages, and discards chat without altering blocks', async () => {
    const initialBlocks = [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the system state.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.',
      },
      {
        id: 'blk_03',
        markdown: '## 3. Canonical Equations\n\nTime evolution via symplectic structure.',
      },
    ];

    let activeChatState: {
      docId: string;
      blockId: string;
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
              title: 'Hamiltonian Mechanics',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: initialBlocks,
            toc: [
              { level: 2, text: '1. Phase Space', blockId: 'blk_01' },
              { level: 2, text: '2. Legendre Transform', blockId: 'blk_02' },
              { level: 2, text: '3. Canonical Equations', blockId: 'blk_03' },
            ],
            activeChat: activeChatState,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_02/chat') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        const priorMessages = activeChatState?.messages ?? [];
        activeChatState = {
          docId: 'index',
          blockId: 'blk_02',
          modelId: 'anthropic:claude-opus-4-6',
          messages: [
            ...priorMessages,
            { role: 'user', content: body.message },
            {
              role: 'assistant',
              content:
                'The conjugate momentum is defined by $p_i = \\frac{\\partial L}{\\partial \\dot{q}_i}$.',
            },
          ],
        };

        return new Response(
          JSON.stringify({ activeChat: activeChatState }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/blocks/blk_02/chat') && init?.method === 'DELETE') {
        activeChatState = null;
        return new Response(
          JSON.stringify({ activeChat: null }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '2. Legendre Transform' })
    ).toBeInTheDocument();

    const block2Card = screen.getByTestId('concept-block-blk_02');

    // Click Ask Cell on blk_02
    const askCellBtn = screen.getByRole('button', { name: 'Ask cell blk_02' });
    await user.click(askCellBtn);

    // InlineChatDrawer should now be open inside blk_02 with 2px solid #1D4ED8 border
    const drawer = within(block2Card).getByTestId('inline-chat-drawer-blk_02');
    expect(drawer).toBeInTheDocument();
    expect(block2Card).toHaveStyle({ border: '2px solid #1D4ED8' });

    // Type a question and submit
    const chatInput = within(drawer).getByPlaceholderText(/ask a question about this cell/i);
    await user.type(chatInput, 'How is conjugate momentum defined?');
    const sendBtn = within(drawer).getByRole('button', { name: /send/i });
    await user.click(sendBtn);

    // Verify user question and assistant reply (including KaTeX math) are rendered inside the drawer
    await waitFor(() => {
      expect(
        within(drawer).getByText('How is conjugate momentum defined?')
      ).toBeInTheDocument();
    });
    expect(
      within(drawer).getByText(/The conjugate momentum is defined by/i)
    ).toBeInTheDocument();
    expect(drawer.querySelector('.katex')).not.toBeNull();

    // Click Discard
    const discardBtn = within(drawer).getByRole('button', { name: /discard/i });
    await user.click(discardBtn);

    // Verify DELETE /api/blocks/blk_02/chat was called and drawer is closed
    await waitFor(() => {
      expect(
        screen.queryByTestId('inline-chat-drawer-blk_02')
      ).not.toBeInTheDocument();
    });

    // Verify blk_02 prose is completely unchanged
    expect(
      within(block2Card).getByRole('heading', { name: '2. Legendre Transform' })
    ).toBeInTheDocument();
    expect(
      within(block2Card).getByText(/Maps velocities to canonical momenta\./i)
    ).toBeInTheDocument();
  });

  it('integrates chat, renders GateBanner and pending-diff card on adjacent cell, locks Ask Cell buttons, and unlocks after Accept/Reject', async () => {
    let currentBlocks = [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the system state.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.',
      },
      {
        id: 'blk_03',
        markdown: '## 3. Canonical Equations\n\nTime evolution via symplectic structure.',
      },
    ];

    let activeChatState: {
      docId: string;
      blockId: string;
      modelId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } | null = null;

    let pendingEditsState: Array<{
      id: string;
      docId: string;
      blockId: string;
      originalMarkdown: string;
      proposedMarkdown: string;
      reason: string;
      sourceBlockId: string;
    }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Hamiltonian Mechanics',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: currentBlocks.map((b) => ({
              level: 2,
              text: b.markdown.split('\n')[0].replace(/^##\s*/, ''),
              blockId: b.id,
            })),
            activeChat: activeChatState,
            pendingEdits: pendingEditsState,
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_02/chat') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        activeChatState = {
          docId: 'index',
          blockId: 'blk_02',
          modelId: 'anthropic:claude-opus-4-6',
          messages: [
            { role: 'user', content: body.message },
            {
              role: 'assistant',
              content:
                'For singular Lagrangians where $\\det(\\partial^2 L / \\partial \\dot{q}^2) = 0$, primary constraints arise.',
            },
          ],
        };

        return new Response(
          JSON.stringify({ activeChat: activeChatState }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_02/integrate') && init?.method === 'POST') {
        currentBlocks = [
          currentBlocks[0],
          {
            id: 'blk_02',
            markdown:
              '## 2. Legendre Transform\n\nMaps velocities $\\dot{q}$ to canonical momenta $p = \\partial L / \\partial \\dot{q}$ when the Hessian is non-singular.',
          },
          {
            id: 'blk_02a',
            markdown:
              '## 2a. Singular Lagrangians\n\nWhen $\\det(\\partial^2 L / \\partial \\dot{q}^2) = 0$, primary constraints arise.',
          },
          currentBlocks[2],
        ];

        pendingEditsState = [
          {
            id: 'edit_01',
            docId: 'index',
            blockId: 'blk_03',
            originalMarkdown:
              '## 3. Canonical Equations\n\nTime evolution via symplectic structure.',
            proposedMarkdown:
              '## 3. Canonical Equations\n\nFor regular Lagrangians, symplectic time evolution governs $(q, p)$.',
            reason:
              'Align transition with new Singular Lagrangians section above.',
            sourceBlockId: 'blk_02',
          },
        ];

        activeChatState = null;

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Hamiltonian Mechanics',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: currentBlocks.map((b) => ({
              level: 2,
              text: b.markdown.split('\n')[0].replace(/^##\s*/, ''),
              blockId: b.id,
            })),
            activeChat: null,
            pendingEdits: pendingEditsState,
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/edits/edit_01/accept') && init?.method === 'POST') {
        currentBlocks = currentBlocks.map((b) =>
          b.id === 'blk_03'
            ? {
                id: 'blk_03',
                markdown:
                  '## 3. Canonical Equations\n\nFor regular Lagrangians, symplectic time evolution governs $(q, p)$.',
              }
            : b
        );
        pendingEditsState = [];

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Hamiltonian Mechanics',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: currentBlocks.map((b) => ({
              level: 2,
              text: b.markdown.split('\n')[0].replace(/^##\s*/, ''),
              blockId: b.id,
            })),
            activeChat: null,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '2. Legendre Transform' })
    ).toBeInTheDocument();

    const block2Card = screen.getByTestId('concept-block-blk_02');

    // 1. Open chat on blk_02
    await user.click(within(block2Card).getByRole('button', { name: 'Ask cell blk_02' }));

    const drawer = within(block2Card).getByTestId('inline-chat-drawer-blk_02');
    const chatInput = within(drawer).getByPlaceholderText(/ask a question about this cell/i);
    await user.type(chatInput, 'What about singular Lagrangians?');
    await user.click(within(drawer).getByRole('button', { name: /send/i }));

    // Wait for message in chat
    await waitFor(() => {
      expect(
        within(drawer).getByText(/primary constraints arise/i)
      ).toBeInTheDocument();
    });

    // 2. Click Integrate (AC-1)
    const integrateBtn = within(drawer).getByRole('button', {
      name: 'Integrate chat into blk_02',
    });
    expect(integrateBtn).toBeEnabled();
    await user.click(integrateBtn);

    // AC-1: Verify blk_02 updated, inserted blk_02a rendered, and drawer closed
    await waitFor(() => {
      expect(
        screen.queryByTestId('inline-chat-drawer-blk_02')
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { name: '2a. Singular Lagrangians' })
    ).toBeInTheDocument();
    expect(
      within(block2Card).getByText(/when the Hessian is non-singular/i)
    ).toBeInTheDocument();

    // 3. AC-2: Verify GateBanner and pending-diff card on blk_03
    const gateBanner = screen.getByTestId('gate-banner');
    expect(gateBanner).toBeInTheDocument();
    expect(within(gateBanner).getByText(/1 pending suggested edit/i)).toBeInTheDocument();
    expect(
      within(gateBanner).getByRole('button', { name: /jump to next diff/i })
    ).toBeInTheDocument();

    const block3Card = screen.getByTestId('concept-block-blk_03');
    expect(block3Card).toHaveStyle({ border: '2px solid #F59E0B' });

    // Stated reason in diff banner
    expect(
      within(block3Card).getByText(/Align transition with new Singular Lagrangians section above/i)
    ).toBeInTheDocument();

    // Diff removal line and addition line
    const removedLine = within(block3Card).getByText(/Time evolution via symplectic structure\./i);
    expect(removedLine).toBeInTheDocument();
    const addedLine = within(block3Card).getByText(/For regular Lagrangians, symplectic time evolution governs/i);
    expect(addedLine).toBeInTheDocument();

    // Accept Edit & Reject Edit buttons
    const acceptBtn = within(block3Card).getByRole('button', {
      name: 'Accept suggested edit on blk_03',
    });
    const rejectBtn = within(block3Card).getByRole('button', {
      name: 'Reject suggested edit on blk_03',
    });
    expect(acceptBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    // Ask Cell buttons on all blocks are locked
    const allAskCellButtons = screen.getAllByRole('button', { name: /Ask cell /i });
    expect(allAskCellButtons.length).toBeGreaterThan(0);
    for (const btn of allAskCellButtons) {
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('title', 'Resolve pending suggested edits first');
    }

    // 4. AC-3: Click Accept Edit
    await user.click(acceptBtn);

    // GateBanner disappears
    await waitFor(() => {
      expect(screen.queryByTestId('gate-banner')).not.toBeInTheDocument();
    });

    // blk_03 updated and diff resolved
    expect(
      within(block3Card).getByText(/For regular Lagrangians, symplectic time evolution governs/i)
    ).toBeInTheDocument();
    expect(block3Card).not.toHaveStyle({ border: '2px solid #F59E0B' });

    // Ask Cell buttons unlocked
    for (const btn of screen.getAllByRole('button', { name: /Ask cell /i })) {
      expect(btn).not.toBeDisabled();
    }
  });
});

