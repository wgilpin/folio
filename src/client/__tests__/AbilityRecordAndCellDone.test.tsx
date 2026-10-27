// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { App } from '../App.js';

describe('Epic 02: Cell Done Check-Off UI, Document Progress Counter & Central Ability Record Editor UI', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('toggles ConceptBlockCard Done status in place without hiding content and updates the document progress badge', async () => {
    const initialDocPayload = {
      document: {
        id: 'lagrangian-mechanics',
        title: 'Lagrangian Mechanics',
        filename: 'lagrangian-mechanics.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        prerequisites: [],
      },
      documents: {
        'lagrangian-mechanics': {
          id: 'lagrangian-mechanics',
          title: 'Lagrangian Mechanics',
          filename: 'lagrangian-mechanics.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
          prerequisites: [],
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown: '## Prerequisites & Foundations\n\nCalculus of variations.',
        },
        {
          id: 'blk_01',
          markdown: '## 1. Generalized Coordinates\n\nConfiguration space coordinates and constraints.',
        },
        {
          id: 'blk_02',
          markdown: '## 2. Euler-Lagrange Equations\n\nStationary action principle.',
        },
      ],
      toc: [
        { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
        { level: 2, text: '1. Generalized Coordinates', blockId: 'blk_01' },
        { level: 2, text: '2. Euler-Lagrange Equations', blockId: 'blk_02' },
      ],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      profile: {
        topics: {},
        background: '',
        learningInstructions: '',
        engagedSources: [],
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
      if (url === '/api/blocks/blk_01/done' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...initialDocPayload,
            blocks: initialDocPayload.blocks.map((b) =>
              b.id === 'blk_01' ? { ...b, done: body.done } : b
            ),
            profile: {
              topics: {
                'Lagrangian Mechanics': body.done ? 'learning' : 'unseen',
              },
              background: '',
              learningInstructions: '',
              engagedSources: body.done
                ? [
                    {
                      docId: 'lagrangian-mechanics',
                      docTitle: 'Lagrangian Mechanics',
                      completedBlockIds: ['blk_01'],
                      completedSectionHeadings: ['1. Generalized Coordinates'],
                      totalBlocks: 3,
                    },
                  ]
                : [],
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    const progressBadge = await screen.findByLabelText('Document completion progress');
    expect(progressBadge.textContent).toBe('0/3 blocks done');

    const block1Card = screen.getByTestId('concept-block-blk_01');
    expect(block1Card.textContent).toContain('Configuration space coordinates and constraints.');
    expect(block1Card.getAttribute('data-done')).toBe('false');

    const markDoneBtn = screen.getByRole('button', {
      name: 'Mark block blk_01 as done',
    });
    expect(markDoneBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(markDoneBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/blocks/blk_01/done',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            done: true,
            docId: 'lagrangian-mechanics',
          }),
        })
      );
    });

    await waitFor(() => {
      const unmarkBtn = screen.getByRole('button', {
        name: 'Unmark block blk_01 as done',
      });
      expect(unmarkBtn.getAttribute('aria-pressed')).toBe('true');
      expect(unmarkBtn.textContent).toContain('✓ Done');
    });

    // Block prose remains completely visible in place (not hidden or collapsed)
    const updatedBlock1Card = screen.getByTestId('concept-block-blk_01');
    expect(updatedBlock1Card.getAttribute('data-done')).toBe('true');
    expect(updatedBlock1Card.textContent).toContain(
      'Configuration space coordinates and constraints.'
    );

    // Document header progress counter updates to 1/3 blocks done
    expect(screen.getByLabelText('Document completion progress').textContent).toBe(
      '1/3 blocks done'
    );
  });

  it('edits and saves Learner Background and Standing Learning Instructions via PUT /api/profile and displays engaged sources', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Quantum Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
        prerequisites: [],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Quantum Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
          prerequisites: [],
        },
      },
      blocks: [
        {
          id: 'blk_00',
          markdown: '## Prerequisites & Foundations\n\nLinear algebra.',
          done: true,
        },
        {
          id: 'blk_01',
          markdown: '## 1. Wavefunctions\n\nHilbert space state vectors.',
          done: false,
        },
      ],
      toc: [
        { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
        { level: 2, text: '1. Wavefunctions', blockId: 'blk_01' },
      ],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      profile: {
        topics: { 'Quantum Mechanics': 'learning' },
        background: 'Initial background',
        learningInstructions: 'Initial instructions',
        engagedSources: [
          {
            docId: 'index',
            docTitle: 'Quantum Mechanics',
            completedBlockIds: ['blk_00'],
            completedSectionHeadings: ['Prerequisites & Foundations'],
            totalBlocks: 2,
          },
        ],
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
      if (url === '/api/profile' && init?.method === 'PUT') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            profile: {
              ...initialDocPayload.profile,
              background: body.background,
              learningInstructions: body.learningInstructions,
            },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<App />);

    const backgroundInput = (await screen.findByLabelText(
      'Learner Background'
    )) as HTMLTextAreaElement;
    const instructionsInput = screen.getByLabelText(
      'Standing Learning Instructions'
    ) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(backgroundInput.value).toBe('Initial background');
      expect(instructionsInput.value).toBe('Initial instructions');
    });

    // Verify engaged sources summary is displayed in the sidebar
    const sidebar = screen.getByLabelText('Notebook Sidebar');
    expect(sidebar.textContent).toContain('Quantum Mechanics');
    expect(sidebar.textContent).toContain('1/2 blocks done');

    fireEvent.change(backgroundInput, {
      target: { value: 'First year Nat Sci (Physical) at Cambridge.' },
    });
    fireEvent.change(instructionsInput, {
      target: {
        value: 'I am a visual learner. Explain terms as they are introduced.',
      },
    });

    const saveBtn = screen.getByRole('button', {
      name: 'Save learner ability record',
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/profile',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            background: 'First year Nat Sci (Physical) at Cambridge.',
            learningInstructions:
              'I am a visual learner. Explain terms as they are introduced.',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Learner Background') as HTMLTextAreaElement).value
      ).toBe('First year Nat Sci (Physical) at Cambridge.');
      expect(
        (
          screen.getByLabelText(
            'Standing Learning Instructions'
          ) as HTMLTextAreaElement
        ).value
      ).toBe('I am a visual learner. Explain terms as they are introduced.');
    });
  });
});
