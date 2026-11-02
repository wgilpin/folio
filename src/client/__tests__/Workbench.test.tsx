// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('Workbench UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders empty seed state, submits topic prompt, and displays Concept Blocks, Mermaid diagram container, and Sidebar ToC', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: null,
            blocks: [],
            toc: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/doc/seed') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.prompt).toBe('Hamiltonian Mechanics');

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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Phase Space Coordinates\n\nGeneralized coordinates and canonical momenta define the system state.',
              },
              {
                id: 'blk_02',
                markdown:
                  '## 2. Legendre Transformation\n\nTransforming from Lagrangian to Hamiltonian:\n\n```mermaid\nflowchart LR\n  L["Lagrangian L(q, qdot)"] -->|Legendre Transform| H["Hamiltonian H(q, p)"]\n```\n\nPreserves dynamical information.',
              },
              {
                id: 'blk_03',
                markdown:
                  '## 3. Canonical Equations of Motion\n\nSymplectic structure governs time evolution.',
              },
              {
                id: 'blk_04',
                markdown:
                  '## 4. Phase Space Volume Conservation\n\nLiouville theorem guarantees incompressible flow.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
              { level: 2, text: '2. Legendre Transformation', blockId: 'blk_02' },
              {
                level: 2,
                text: '3. Canonical Equations of Motion',
                blockId: 'blk_03',
              },
              {
                level: 2,
                text: '4. Phase Space Volume Conservation',
                blockId: 'blk_04',
              },
            ],
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

    // Verify active model is displayed in sidebar and empty seed prompt is shown
    expect(await screen.findByText('anthropic:claude-opus-4-6')).toBeInTheDocument();

    const promptInput = screen.getByPlaceholderText(/enter a topic/i);
    expect(promptInput).toBeInTheDocument();

    await user.type(promptInput, 'Hamiltonian Mechanics');
    const submitBtn = screen.getByRole('button', { name: /seed topic/i });
    await user.click(submitBtn);

    // Wait for Concept Blocks to render
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '1. Phase Space Coordinates' })
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        /Generalized coordinates and canonical momenta define the system state\./i
      )
    ).toBeInTheDocument();

    // Verify Mermaid diagram container is rendered
    const mermaidContainer = screen.getByTestId('mermaid-diagram');
    expect(mermaidContainer).toBeInTheDocument();
    expect(mermaidContainer.textContent).toContain('Legendre Transform');

    // Verify Sidebar Table of Contents items and document title
    const sidebar = screen.getByRole('navigation', { name: /notebook sidebar/i });
    expect(sidebar).toHaveTextContent('Hamiltonian Mechanics');
    expect(sidebar).toHaveTextContent('1. Phase Space Coordinates');
    expect(sidebar).toHaveTextContent('2. Legendre Transformation');
    expect(sidebar).toHaveTextContent('3. Canonical Equations of Motion');
    expect(sidebar).toHaveTextContent('4. Phase Space Volume Conservation');
  });

  it('edits raw Markdown inline on a Concept Block and persists via PUT /api/blocks/:id', async () => {
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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Phase Space Coordinates\n\nInitial phase space explanation.',
              },
              {
                id: 'blk_02',
                markdown:
                  '## 2. Legendre Transformation\n\nTransforming from Lagrangian to Hamiltonian.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
              { level: 2, text: '2. Legendre Transformation', blockId: 'blk_02' },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_01') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        expect(body.markdown).toBe(
          '## 1. Symplectic Geometry\n\nUpdated symplectic manifold explanation.'
        );

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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Symplectic Geometry\n\nUpdated symplectic manifold explanation.',
              },
              {
                id: 'blk_02',
                markdown:
                  '## 2. Legendre Transformation\n\nTransforming from Lagrangian to Hamiltonian.',
              },
            ],
            toc: [
              { level: 2, text: '1. Symplectic Geometry', blockId: 'blk_01' },
              { level: 2, text: '2. Legendre Transformation', blockId: 'blk_02' },
            ],
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
      await screen.findByRole('heading', { name: '1. Phase Space Coordinates' })
    ).toBeInTheDocument();

    // Open raw Markdown editor and test Escape cancel first
    const editBtn = screen.getByRole('button', {
      name: 'Edit Markdown for blk_01',
    });
    await user.click(editBtn);

    const textarea = screen.getByRole('textbox', {
      name: /raw markdown for blk_01/i,
    });
    expect(textarea).toHaveValue(
      '## 1. Phase Space Coordinates\n\nInitial phase space explanation.'
    );

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('textbox', { name: /raw markdown for blk_01/i })
    ).not.toBeInTheDocument();

    // Re-open raw Markdown editor, change text, and click Save
    await user.click(
      screen.getByRole('button', { name: 'Edit Markdown for blk_01' })
    );
    const activeTextarea = screen.getByRole('textbox', {
      name: /raw markdown for blk_01/i,
    });
    await user.clear(activeTextarea);
    await user.type(
      activeTextarea,
      '## 1. Symplectic Geometry\n\nUpdated symplectic manifold explanation.'
    );

    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: '1. Symplectic Geometry' })
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Updated symplectic manifold explanation\./i)
    ).toBeInTheDocument();

    const sidebar = screen.getByRole('navigation', { name: /notebook sidebar/i });
    expect(sidebar).toHaveTextContent('1. Symplectic Geometry');
  });

  it('splits, merges, and deletes Concept Blocks from the card action bar', async () => {
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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Phase Space Coordinates\n\nFirst paragraph.\n\nSecond paragraph.',
              },
              {
                id: 'blk_02',
                markdown: '## 2. Canonical Equations\n\nEquations of motion.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
              { level: 2, text: '2. Canonical Equations', blockId: 'blk_02' },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_01/split') && init?.method === 'POST') {
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
            blocks: [
              {
                id: 'blk_01',
                markdown: '## 1. Phase Space Coordinates\n\nFirst paragraph.',
              },
              {
                id: 'blk_03',
                markdown: 'Second paragraph.',
              },
              {
                id: 'blk_02',
                markdown: '## 2. Canonical Equations\n\nEquations of motion.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
              { level: 2, text: '2. Canonical Equations', blockId: 'blk_02' },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_01/merge') && init?.method === 'POST') {
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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Phase Space Coordinates\n\nFirst paragraph.\n\nSecond paragraph.',
              },
              {
                id: 'blk_02',
                markdown: '## 2. Canonical Equations\n\nEquations of motion.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
              { level: 2, text: '2. Canonical Equations', blockId: 'blk_02' },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_02') && init?.method === 'DELETE') {
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
            blocks: [
              {
                id: 'blk_01',
                markdown:
                  '## 1. Phase Space Coordinates\n\nFirst paragraph.\n\nSecond paragraph.',
              },
            ],
            toc: [
              { level: 2, text: '1. Phase Space Coordinates', blockId: 'blk_01' },
            ],
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
      await screen.findByRole('heading', { name: '1. Phase Space Coordinates' })
    ).toBeInTheDocument();

    // Verify button bar order: 1. Edit MD, 2. Ask Cell, 3. Overflow
    const actionsFooter = screen.getByTestId('concept-block-actions-blk_01');
    const topLevelButtons = Array.from(
      actionsFooter.querySelectorAll(':scope > button, :scope > div > button')
    );
    expect(topLevelButtons.map((btn) => btn.getAttribute('aria-label'))).toEqual([
      'Edit Markdown for blk_01',
      'Ask cell blk_01',
      'More actions for blk_01',
    ]);

    // Verify Edit MD and Ask Cell are icon buttons (contain SVGs, no text)
    expect(topLevelButtons[0]?.querySelector('svg')).not.toBeNull();
    expect(topLevelButtons[0]?.textContent).toBe('');
    expect(topLevelButtons[1]?.querySelector('svg')).not.toBeNull();
    expect(topLevelButtons[1]?.textContent).toBe('');

    // Split, Merge, Delete are hidden until overflow menu is opened
    expect(
      screen.queryByRole('button', { name: 'Split blk_01' })
    ).not.toBeInTheDocument();

    // 1. Open overflow on blk_01 and Split blk_01
    await user.click(screen.getByRole('button', { name: 'More actions for blk_01' }));
    await user.click(screen.getByRole('button', { name: 'Split blk_01' }));
    expect(await screen.findByTestId('concept-block-blk_03')).toBeInTheDocument();

    // 2. Open overflow on blk_01 and Merge blk_01
    await user.click(screen.getByRole('button', { name: 'More actions for blk_01' }));
    await user.click(screen.getByRole('button', { name: 'Merge blk_01' }));
    await waitFor(() => {
      expect(screen.queryByTestId('concept-block-blk_03')).not.toBeInTheDocument();
    });

    // 3. Open overflow on blk_02 and Delete blk_02
    await user.click(screen.getByRole('button', { name: 'More actions for blk_02' }));
    await user.click(screen.getByRole('button', { name: 'Delete blk_02' }));
    await waitFor(() => {
      expect(screen.queryByTestId('concept-block-blk_02')).not.toBeInTheDocument();
    });

    const sidebar = screen.getByRole('navigation', { name: /notebook sidebar/i });
    expect(sidebar).not.toHaveTextContent('2. Canonical Equations');
  });

  it('renders Mermaid flowchart with unquoted subgraph titles containing parentheses and colons as an SVG diagram instead of raw pre text', async () => {
    const mermaidBlock = [
      '## 1. Recurrent vs Transformer Path',
      '',
      '```mermaid',
      'flowchart LR',
      '    subgraph Recurrent Processing: O(N) Sequential Steps',
      '        x1[x1] --> h1[h1]',
      '        h1 --> h2[h2]',
      '        x2[x2] --> h2',
      '        h2 --> h3[h3]',
      '        x3[x3] --> h3',
      '    end',
      '    subgraph Transformer Attention: O(1) Sequential Path',
      '        tx1[x1] --- A[All-to-All Self-Attention Matrix]',
      '        tx2[x2] --- A',
      '        tx3[x3] --- A',
      '        A --> out1[y1]',
      '        A --> out2[y2]',
      '        A --> out3[y3]',
      '    end',
      '```',
    ].join('\n');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Attention Mechanisms',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: [
              {
                id: 'blk_01',
                markdown: mermaidBlock,
              },
            ],
            toc: [
              { level: 2, text: '1. Recurrent vs Transformer Path', blockId: 'blk_01' },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '1. Recurrent vs Transformer Path' })
    ).toBeInTheDocument();

    const mermaidContainer = screen.getByTestId('mermaid-diagram');
    await waitFor(() => {
      expect(mermaidContainer.querySelector('svg')).not.toBeNull();
    });
    expect(mermaidContainer.querySelector('pre')).toBeNull();
  });
});

