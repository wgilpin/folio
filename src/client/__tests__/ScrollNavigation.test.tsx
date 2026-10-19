// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import type { ConceptBlock, DocumentNode } from '../../shared/schema.js';

describe('Document Navigation Scroll Behavior', () => {
  const originalFetch = globalThis.fetch;
  const originalScrollTo = window.scrollTo;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    window.scrollTo = originalScrollTo;
  });

  it('scrolls to top on forward navigation to a new doc, and preserves scroll position on clicking back', async () => {
    const documentsState: Record<string, DocumentNode> = {
      'doc-a': {
        id: 'doc-a',
        title: 'Document A',
        filename: 'doc-a.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: ['doc-b'],
      },
      'doc-b': {
        id: 'doc-b',
        title: 'Document B',
        filename: 'doc-b.md',
        parentId: 'doc-a',
        parentBlockId: 'blk_01',
        childDocIds: [],
      },
    };

    const blocksByDoc: Record<string, ConceptBlock[]> = {
      'doc-a': [
        {
          id: 'blk_01',
          markdown: '## Document A Content\n\nLong text in document A.',
        },
      ],
      'doc-b': [
        {
          id: 'blk_01',
          markdown: '## Document B Content\n\nLong text in document B.',
        },
      ],
    };

    const scrollToCalls: Array<{ top: number; options?: ScrollToOptions }> = [];
    window.scrollTo = vi.fn((xOrOptions?: number | ScrollToOptions, y?: number) => {
      if (typeof xOrOptions === 'object' && xOrOptions !== null) {
        scrollToCalls.push({ top: xOrOptions.top ?? 0, options: xOrOptions });
        window.scrollY = xOrOptions.top ?? 0;
      } else {
        const top = y ?? 0;
        scrollToCalls.push({ top });
        window.scrollY = top;
      }
    });

    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/api/doc') && (!init?.method || init.method === 'GET')) {
        const parsed = new URL(url, 'http://localhost');
        const docId = parsed.searchParams.get('id') ?? 'doc-a';
        const doc = documentsState[docId] ?? documentsState['doc-a'];
        const blocks = blocksByDoc[docId] ?? blocksByDoc['doc-a'];
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

    // 1. Initial document loads
    expect(
      await screen.findByRole('heading', { name: 'Document A Content' })
    ).toBeInTheDocument();

    // User scrolls down on Document A to 750px
    window.scrollY = 750;
    scrollToCalls.length = 0; // Clear initial calls

    // 2. Forward navigation: User clicks link to Document B in sidebar
    const sidebar = screen.getByRole('navigation', { name: 'Notebook Sidebar' });
    const docBBtn = within(sidebar).getByRole('button', {
      name: 'Open document Document B',
    });
    await user.click(docBBtn);

    // Verify Document B loaded
    expect(
      await screen.findByRole('heading', { name: 'Document B Content' })
    ).toBeInTheDocument();

    // Verify history pushState was called for Document B
    expect(pushStateSpy).toHaveBeenCalledWith(
      { docId: 'doc-b' },
      '',
      expect.stringContaining('id=doc-b')
    );

    // Verify forward navigation scrolled to the top of the page (top: 0)
    expect(scrollToCalls.some((call) => call.top === 0)).toBe(true);

    // 3. User scrolls down on Document B to 320px
    window.scrollY = 320;
    scrollToCalls.length = 0;

    // 4. Back navigation: User clicks browser back button (fires popstate event to doc-a)
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: { docId: 'doc-a' },
      })
    );

    // Wait for Document A to be displayed again
    expect(
      await screen.findByRole('heading', { name: 'Document A Content' })
    ).toBeInTheDocument();

    // Verify that navigating back did NOT scroll to top (top: 0), but restored saved scroll position (750)
    expect(scrollToCalls.some((call) => call.top === 750)).toBe(true);

    // 5. Forward navigation via browser history (popstate to doc-b)
    window.dispatchEvent(
      new PopStateEvent('popstate', {
        state: { docId: 'doc-b' },
      })
    );

    expect(
      await screen.findByRole('heading', { name: 'Document B Content' })
    ).toBeInTheDocument();

    // Verify Document B's previous scroll position (320) is restored
    expect(scrollToCalls.some((call) => call.top === 320)).toBe(true);
  });

  it('scrolls to top when clicking the currently active document in sidebar', async () => {
    const documentsState: Record<string, DocumentNode> = {
      'doc-a': {
        id: 'doc-a',
        title: 'Document A',
        filename: 'doc-a.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
    };

    const blocksByDoc: Record<string, ConceptBlock[]> = {
      'doc-a': [
        {
          id: 'blk_01',
          markdown: '## Document A Content\n\nLong text.',
        },
      ],
    };

    const scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/doc')) {
        return new Response(
          JSON.stringify({
            document: documentsState['doc-a'],
            documents: documentsState,
            blocks: blocksByDoc['doc-a'],
            toc: [],
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
      await screen.findByRole('heading', { name: 'Document A Content' })
    ).toBeInTheDocument();

    scrollToSpy.mockClear();

    // Click Document A in the sidebar while already viewing Document A
    const sidebar = screen.getByRole('navigation', { name: 'Notebook Sidebar' });
    const docABtn = within(sidebar).getByRole('button', {
      name: 'Open document Document A',
    });
    await user.click(docABtn);

    // Verify scrollTo was called with top: 0
    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 })
    );
  });
});
