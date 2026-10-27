// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('Sidebar Library Search UI (AC-3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('searches library blocks from the sidebar, displays matching snippets, and navigates to the target document and block on click', async () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    const documentsMap = {
      'lagrangian-mechanics': {
        id: 'lagrangian-mechanics',
        title: 'Lagrangian Mechanics',
        shortTitle: 'Lagrangian Mechanics',
        filename: 'lagrangian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: ['noethers-theorem'],
      },
      'noethers-theorem': {
        id: 'noethers-theorem',
        title: "Noether's Theorem and Continuous Symmetries",
        shortTitle: "Noether's Theorem",
        filename: 'noethers-theorem.md',
        parentId: 'lagrangian-mechanics',
        parentBlockId: 'blk_02',
        childDocIds: [],
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.startsWith('/api/search')) {
        return new Response(
          JSON.stringify({
            query: 'conserved current',
            mode: 'hybrid',
            results: [
              {
                docId: 'noethers-theorem',
                docTitle: "Noether's Theorem and Continuous Symmetries",
                blockId: 'blk_02',
                heading: '2. Cyclic Coordinates and Conserved Current',
                snippet:
                  'Every continuous symmetry yields a conserved current and conjugate momentum.',
                score: 0.94,
                matchType: 'hybrid',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/api/doc?id=noethers-theorem')) {
        return new Response(
          JSON.stringify({
            document: documentsMap['noethers-theorem'],
            documents: documentsMap,
            blocks: [
              {
                id: 'blk_01',
                markdown: "## 1. Statement of Noether's Theorem\n\nSymmetries of the action.",
              },
              {
                id: 'blk_02',
                markdown:
                  '## 2. Cyclic Coordinates and Conserved Current\n\nEvery continuous symmetry yields a conserved current and conjugate momentum.',
              },
            ],
            toc: [
              {
                level: 2,
                text: "1. Statement of Noether's Theorem",
                blockId: 'blk_01',
              },
              {
                level: 2,
                text: '2. Cyclic Coordinates and Conserved Current',
                blockId: 'blk_02',
              },
            ],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          document: documentsMap['lagrangian-mechanics'],
          documents: documentsMap,
          blocks: [
            {
              id: 'blk_01',
              markdown: '## 1. The Lagrangian Function\n\n$$\\mathcal{L} = T - V$$',
            },
          ],
          toc: [
            {
              level: 2,
              text: '1. The Lagrangian Function',
              blockId: 'blk_01',
            },
          ],
          modelId: 'anthropic:claude-opus-4-6',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Lagrangian Mechanics' })
      ).toBeTruthy();
    });

    const searchInput = screen.getByLabelText('Search library');
    fireEvent.change(searchInput, { target: { value: 'conserved current' } });

    await waitFor(() => {
      expect(
        screen.getByText(
          /Every continuous symmetry yields a conserved current/i
        )
      ).toBeTruthy();
    });

    const resultButton = screen
      .getByText(/Every continuous symmetry yields a conserved current/i)
      .closest('button');
    expect(resultButton).toBeTruthy();
    fireEvent.click(resultButton!);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([arg]) =>
          String(arg).includes('/api/doc?id=noethers-theorem')
        )
      ).toBe(true);
      expect(
        screen.getByRole('heading', {
          name: "Noether's Theorem and Continuous Symmetries",
        })
      ).toBeTruthy();
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});
