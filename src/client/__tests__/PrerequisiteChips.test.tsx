// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../App.js';

describe('Epic 02: Interactive Block 0 Prerequisite Chips UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders Prerequisite Chips in blk_00 and toggles topic known status via PUT /api/profile/topics', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Hamiltonian Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        prerequisites: ['Lagrangian Mechanics', 'Symplectic Geometry'],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Hamiltonian Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
          prerequisites: ['Lagrangian Mechanics', 'Symplectic Geometry'],
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown:
            '# Hamiltonian Mechanics\n\n## Prerequisites & Context\n- **Lagrangian Mechanics**: Action principle\n- **Symplectic Geometry**: Phase space',
        },
        {
          id: 'blk_01',
          markdown: '## Canonical Coordinates\nPosition and momentum.',
        },
      ],
      toc: [
        { level: 1, text: 'Hamiltonian Mechanics', blockId: 'blk_00' },
        { level: 2, text: 'Canonical Coordinates', blockId: 'blk_01' },
      ],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      profile: {
        topics: {
          'Symplectic Geometry': 'learning',
        },
      },
    };

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/doc' && (!init || !init.method || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => initialDocPayload,
        };
      }
      if (url === '/api/profile/topics' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            profile: {
              topics: {
                'Symplectic Geometry': 'learning',
                [body.topic]: body.status,
              },
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    const chipsBar = await screen.findByTestId('prerequisite-chips-bar');
    expect(chipsBar).toBeTruthy();

    const lagrangianChip = screen.getByTestId('prereq-chip-Lagrangian Mechanics');
    const symplecticChip = screen.getByTestId('prereq-chip-Symplectic Geometry');
    expect(lagrangianChip.textContent).toContain('Lagrangian Mechanics');
    expect(lagrangianChip.textContent).toContain('unseen');
    expect(symplecticChip.textContent).toContain('Symplectic Geometry');
    expect(symplecticChip.textContent).toContain('learning');

    const markKnownBtn = screen.getByRole('button', {
      name: 'Mark Lagrangian Mechanics as known',
    });
    fireEvent.click(markKnownBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/profile/topics',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            topic: 'Lagrangian Mechanics',
            status: 'known',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByTestId('prereq-chip-Lagrangian Mechanics').textContent
      ).toContain('known');
      expect(
        screen.getByRole('button', {
          name: 'Unmark Lagrangian Mechanics as known',
        })
      ).toBeTruthy();
    });
  });

  it('seeds a prerequisite sub-document from blk_00 via POST /api/prerequisites/seed and navigates to the new child document', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Hamiltonian Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        prerequisites: ['Symplectic Geometry'],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Hamiltonian Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
          prerequisites: ['Symplectic Geometry'],
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown:
            '# Hamiltonian Mechanics\n\n## Prerequisites & Context\n- **Symplectic Geometry**: Phase space',
        },
      ],
      toc: [{ level: 1, text: 'Hamiltonian Mechanics', blockId: 'blk_00' }],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      profile: {
        topics: {},
      },
    };

    const seededChildPayload = {
      document: {
        id: 'sub_01_symplectic_geometry',
        title: 'Symplectic Geometry: Foundations',
        filename: 'sub_01_symplectic_geometry.md',
        parentId: 'index',
        parentBlockId: 'blk_00',
        childDocIds: [],
        prerequisites: ['Differential Forms'],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Hamiltonian Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: ['sub_01_symplectic_geometry'],
          prerequisites: ['Symplectic Geometry'],
        },
        sub_01_symplectic_geometry: {
          id: 'sub_01_symplectic_geometry',
          title: 'Symplectic Geometry: Foundations',
          filename: 'sub_01_symplectic_geometry.md',
          parentId: 'index',
          parentBlockId: 'blk_00',
          childDocIds: [],
          prerequisites: ['Differential Forms'],
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown:
            '# Symplectic Geometry: Foundations\n\n## Prerequisites & Context\n- **Differential Forms**: Exterior calculus',
        },
      ],
      toc: [
        {
          level: 1,
          text: 'Symplectic Geometry: Foundations',
          blockId: 'blk_00',
        },
      ],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      profile: {
        topics: {
          'Symplectic Geometry': 'learning',
          'Differential Forms': 'unseen',
        },
      },
    };

    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/doc' && (!init || !init.method || init.method === 'GET')) {
        return {
          ok: true,
          status: 200,
          json: async () => initialDocPayload,
        };
      }
      if (url === '/api/prerequisites/seed' && init?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => seededChildPayload,
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    const seedBtn = await screen.findByRole('button', {
      name: 'Seed prerequisite Symplectic Geometry',
    });
    fireEvent.click(seedBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/prerequisites/seed',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            topic: 'Symplectic Geometry',
            parentDocId: 'index',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getAllByRole('heading', {
          level: 1,
          name: 'Symplectic Geometry: Foundations',
        }).length
      ).toBeGreaterThan(0);
      expect(screen.getByTestId('prereq-chip-Differential Forms')).toBeTruthy();
    });
  });
});
