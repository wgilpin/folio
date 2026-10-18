// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import type { ConceptBlock, DocumentNode } from '../../shared/schema.js';

describe('Sub-Document Branching, SubDocLinkCard, SidebarTree & Breadcrumb Navigation UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('branches active cell chat via Branch Doc button into child document and renders SubDocLinkCard on parent block', async () => {
    let documentsState: Record<string, DocumentNode> = {
      index: {
        id: 'index',
        title: 'Hamiltonian Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
    };

    let blocksByDoc: Record<string, ConceptBlock[]> = {
      index: [
        {
          id: 'blk_01',
          markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the system state.',
        },
        {
          id: 'blk_02',
          markdown: '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.',
        },
      ],
    };

    let activeChatState: {
      docId: string;
      blockId: string;
      modelId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/doc') && (!init?.method || init.method === 'GET')) {
        const parsed = new URL(url, 'http://localhost');
        const docId = parsed.searchParams.get('id') ?? 'index';
        const doc = documentsState[docId] ?? null;
        const blocks = blocksByDoc[docId] ?? [];
        return new Response(
          JSON.stringify({
            document: doc,
            documents: documentsState,
            blocks,
            toc: blocks.map((b) => ({
              level: 2,
              text: b.markdown.split('\n')[0].replace(/^##\s*/, ''),
              blockId: b.id,
            })),
            activeChat: activeChatState,
            pendingEdits: [],
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
              content: 'Generating functions produce canonical transformations.',
            },
          ],
        };
        return new Response(
          JSON.stringify({ activeChat: activeChatState }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_02/branch') && init?.method === 'POST') {
        const childDoc: DocumentNode = {
          id: 'canonical-transformations',
          title: 'Canonical Transformations',
          filename: 'canonical-transformations.md',
          parentId: 'index',
          parentBlockId: 'blk_02',
          childDocIds: [],
        };

        documentsState = {
          index: {
            ...documentsState.index,
            childDocIds: ['canonical-transformations'],
          },
          'canonical-transformations': childDoc,
        };

        blocksByDoc.index = [
          blocksByDoc.index[0],
          {
            id: 'blk_02',
            markdown:
              '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.\n\n[→ Deep dive: Canonical Transformations](canonical-transformations.md)',
          },
        ];

        const childBlocks: ConceptBlock[] = [
          {
            id: 'blk_00',
            markdown: '## 0. Overview\n\nDeep dive into canonical transformations.',
          },
          {
            id: 'blk_01',
            markdown: '## 1. Generating Functions\n\nType $F_1(q, Q)$ transformations.',
          },
        ];
        blocksByDoc['canonical-transformations'] = childBlocks;
        activeChatState = null;

        return new Response(
          JSON.stringify({
            document: childDoc,
            documents: documentsState,
            blocks: childBlocks,
            toc: [
              { level: 2, text: '0. Overview', blockId: 'blk_00' },
              { level: 2, text: '1. Generating Functions', blockId: 'blk_01' },
            ],
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

    // Open chat on blk_02
    await user.click(within(block2Card).getByRole('button', { name: 'Ask cell blk_02' }));

    const drawer = within(block2Card).getByTestId('inline-chat-drawer-blk_02');
    const branchBtnBefore = within(drawer).getByRole('button', {
      name: 'Branch chat from blk_02 into sub-document',
    });
    expect(branchBtnBefore).toBeDisabled();

    // Send a message
    const chatInput = within(drawer).getByPlaceholderText(/ask a question about this cell/i);
    await user.type(chatInput, 'How do canonical transformations work?');
    await user.click(within(drawer).getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(
        within(drawer).getByText(/Generating functions produce canonical transformations/i)
      ).toBeInTheDocument();
    });

    // AC-1: Branch Doc button is enabled and clicking it branches into the child document
    const branchBtn = within(drawer).getByRole('button', {
      name: 'Branch chat from blk_02 into sub-document',
    });
    expect(branchBtn).toBeEnabled();
    await user.click(branchBtn);

    // Wait for child document to load in the Workbench
    expect(
      await screen.findByRole('heading', { name: 'Canonical Transformations' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: '1. Generating Functions' })
    ).toBeInTheDocument();

    // Drawer is closed
    expect(
      screen.queryByTestId('inline-chat-drawer-blk_02')
    ).not.toBeInTheDocument();

    // Breadcrumb shows ancestor Hamiltonian Mechanics -> Canonical Transformations
    const breadcrumbs = screen.getByTestId('document-breadcrumbs');
    const parentCrumbBtn = within(breadcrumbs).getByRole('button', {
      name: 'Hamiltonian Mechanics',
    });
    expect(parentCrumbBtn).toBeInTheDocument();
    expect(within(breadcrumbs).getByText('Canonical Transformations')).toBeInTheDocument();

    // AC-2: Click parent breadcrumb to return to root document and verify SubDocLinkCard on blk_02
    await user.click(parentCrumbBtn);

    expect(
      await screen.findByRole('heading', { name: 'Hamiltonian Mechanics' })
    ).toBeInTheDocument();

    const updatedBlock2Card = screen.getByTestId('concept-block-blk_02');
    const subDocCard = within(updatedBlock2Card).getByTestId(
      'subdoc-link-card-canonical-transformations'
    );
    expect(subDocCard).toBeInTheDocument();
    expect(subDocCard).toHaveTextContent('→ Deep dive: Canonical Transformations');
  });

  it('navigates between root and child documents via breadcrumbs, SidebarTree nodes, and SubDocLinkCard', async () => {
    const documentsState: Record<string, DocumentNode> = {
      index: {
        id: 'index',
        title: 'Hamiltonian Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: ['canonical-transformations'],
      },
      'canonical-transformations': {
        id: 'canonical-transformations',
        title: 'Canonical Transformations',
        filename: 'canonical-transformations.md',
        parentId: 'index',
        parentBlockId: 'blk_02',
        childDocIds: [],
      },
    };

    const blocksByDoc: Record<string, ConceptBlock[]> = {
      index: [
        {
          id: 'blk_01',
          markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the system state.',
        },
        {
          id: 'blk_02',
          markdown:
            '## 2. Legendre Transform\n\nMaps velocities to canonical momenta.\n\n[→ Deep dive: Canonical Transformations](canonical-transformations.md)',
        },
      ],
      'canonical-transformations': [
        {
          id: 'blk_00',
          markdown: '## 0. Overview\n\nDeep dive into canonical transformations.',
        },
        {
          id: 'blk_01',
          markdown: '## 1. Generating Functions\n\nType $F_1(q, Q)$ transformations.',
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/doc') && (!init?.method || init.method === 'GET')) {
        const parsed = new URL(url, 'http://localhost');
        const docId = parsed.searchParams.get('id') ?? 'index';
        const doc = documentsState[docId] ?? null;
        const blocks = blocksByDoc[docId] ?? [];
        return new Response(
          JSON.stringify({
            document: doc,
            documents: documentsState,
            blocks,
            toc: blocks.map((b) => ({
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
      await screen.findByRole('heading', { name: 'Hamiltonian Mechanics' })
    ).toBeInTheDocument();

    // AC-3: Click SubDocLinkCard on blk_02 to navigate to child document
    const block2Card = screen.getByTestId('concept-block-blk_02');
    const subDocCard = within(block2Card).getByTestId(
      'subdoc-link-card-canonical-transformations'
    );
    expect(subDocCard).toHaveAttribute(
      'aria-label',
      'Open sub-document Canonical Transformations'
    );

    // Ensure raw markdown link is not duplicated in prose while SubDocLinkCard is rendered
    const deepDiveMatches = within(block2Card).getAllByText(
      /→ Deep dive: Canonical Transformations/i
    );
    expect(deepDiveMatches).toHaveLength(1);

    await user.click(subDocCard);

    expect(
      await screen.findByRole('heading', { name: 'Canonical Transformations' })
    ).toBeInTheDocument();

    // AC-2: Navigate back to root via SidebarTree node
    const sidebar = screen.getByRole('navigation', { name: 'Notebook Sidebar' });
    const rootTreeBtn = within(sidebar).getByRole('button', {
      name: 'Open document Hamiltonian Mechanics',
    });
    await user.click(rootTreeBtn);

    expect(
      await screen.findByRole('heading', { name: 'Hamiltonian Mechanics' })
    ).toBeInTheDocument();

    // AC-3: Navigate to child via SidebarTree node
    const childTreeBtn = within(sidebar).getByRole('button', {
      name: 'Open document Canonical Transformations',
    });
    await user.click(childTreeBtn);

    expect(
      await screen.findByRole('heading', { name: 'Canonical Transformations' })
    ).toBeInTheDocument();
  });
});
