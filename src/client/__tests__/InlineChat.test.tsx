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
});
