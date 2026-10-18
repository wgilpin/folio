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
});
