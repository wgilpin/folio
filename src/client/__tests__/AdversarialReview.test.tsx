// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('Adversarial Review UI (Document, Cell & Seed/Sidebar Profile)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('triggers document-level Adversarial Review via POST /api/doc/review, opens DocumentChatDrawer with severity-ranked findings, and supports Integrate', async () => {
    let currentBlocks = [
      {
        id: 'blk_00',
        markdown: '## Prerequisites & Foundations\n\nLinear algebra and probability basics.',
      },
      {
        id: 'blk_01',
        markdown: '## 1. Estimator Convergence\n\nThe estimator converges at rate O(1/n^2) for all distributions.',
      },
    ];

    let activeChatState: {
      docId: string;
      blockId: string | null;
      modelId: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    } | null = null;

    let currentPendingEdits: Array<{
      id: string;
      docId: string;
      blockId: string;
      originalMarkdown: string;
      proposedMarkdown: string;
      reason: string;
    }> = [];

    const docReviewCalls: Array<{ docId?: string }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Estimator Convergence Spec',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Estimator Convergence', blockId: 'blk_01' },
            ],
            activeChat: activeChatState,
            pendingEdits: currentPendingEdits,
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/doc/review') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        docReviewCalls.push(body);
        activeChatState = {
          docId: body.docId ?? 'index',
          blockId: null,
          modelId: 'anthropic:claude-opus-4-6',
          messages: [
            {
              role: 'user',
              content: 'Run a falsification-first adversarial review across this notebook.',
            },
            {
              role: 'assistant',
              content:
                '### Serious / Fatal Gaps\n\n- **Unbounded variance counterexample**: For Cauchy distributions, O(1/n^2) fails.\n\n### Moderate Gaps\n\n- Missing finite-fourth-moment assumption.\n\n### Small Number / Arithmetic Errors\n\n- Standard variance scales as O(1/n), not O(1/n^2).\n\n### Result & Open Risks\n\n- Add explicit moment conditions.',
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
        currentPendingEdits = [
          {
            id: 'edit_01',
            docId: 'index',
            blockId: 'blk_01',
            originalMarkdown: currentBlocks[1]!.markdown,
            proposedMarkdown:
              '## 1. Estimator Convergence\n\nUnder finite second moments, the estimator variance converges at rate O(1/n).',
            reason: 'Fix convergence rate and state finite moment assumption from adversarial review.',
          },
        ];

        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Estimator Convergence Spec',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: currentBlocks,
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Estimator Convergence', blockId: 'blk_01' },
            ],
            activeChat: null,
            pendingEdits: currentPendingEdits,
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

    const headerReviewBtn = await screen.findByTestId('doc-adversarial-review-btn');
    expect(headerReviewBtn).toBeInTheDocument();
    expect(headerReviewBtn).toBeEnabled();

    await user.click(headerReviewBtn);

    expect(docReviewCalls).toEqual([{ docId: 'index' }]);

    const drawer = await screen.findByTestId('document-chat-drawer');
    expect(drawer).toBeInTheDocument();

    const drawerReviewBtn = within(drawer).getByTestId('drawer-doc-adversarial-review-btn');
    expect(drawerReviewBtn).toBeInTheDocument();

    await waitFor(() => {
      expect(
        within(drawer).getByText(/Unbounded variance counterexample/i)
      ).toBeInTheDocument();
    });

    const integrateBtn = within(drawer).getByRole('button', {
      name: 'Integrate notebook chat into document',
    });
    const branchBtn = within(drawer).getByRole('button', {
      name: 'Branch notebook chat into sub-document',
    });
    const discardBtn = within(drawer).getByRole('button', {
      name: 'Discard notebook chat',
    });

    expect(integrateBtn).toBeEnabled();
    expect(branchBtn).toBeEnabled();
    expect(discardBtn).toBeEnabled();

    await user.click(integrateBtn);

    // After integration produces pendingEdits, diff gate locks both doc-level and cell-level Adversarial Review buttons (AC-3)
    await waitFor(() => {
      expect(screen.getByTestId('doc-adversarial-review-btn')).toBeDisabled();
      expect(screen.getByTestId('cell-adversarial-review-btn-blk_01')).toBeDisabled();
    });
  });

  it('triggers cell-level Adversarial Review via POST /api/blocks/:id/review and renders findings in InlineChatDrawer', async () => {
    const blocks = [
      {
        id: 'blk_00',
        markdown: '## Prerequisites & Foundations\n\nThermodynamics basics.',
      },
      {
        id: 'blk_01',
        markdown: '## 1. Carnot Efficiency\n\nEfficiency is 1 + T_c / T_h.',
      },
    ];

    const cellReviewCalls: Array<{ url: string; body: { docId?: string } }> = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'index',
              title: 'Heat Engines',
              filename: 'index.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks,
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Carnot Efficiency', blockId: 'blk_01' },
            ],
            activeChat: null,
            pendingEdits: [],
            modelId: 'anthropic:claude-opus-4-6',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/blocks/blk_01/review') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        cellReviewCalls.push({ url, body });

        return new Response(
          JSON.stringify({
            activeChat: {
              docId: body.docId ?? 'index',
              blockId: 'blk_01',
              modelId: 'anthropic:claude-opus-4-6',
              messages: [
                {
                  role: 'user',
                  content: 'Run a falsification-first adversarial review on cell blk_01.',
                },
                {
                  role: 'assistant',
                  content:
                    '### Small Number / Arithmetic Errors\n\n- **Sign error in Carnot efficiency**: The formula writes `1 + T_c / T_h` (> 1), violating the First Law; it must be `1 - T_c / T_h`.',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<App />);

    const cellReviewBtn = await screen.findByTestId('cell-adversarial-review-btn-blk_01');
    expect(cellReviewBtn).toBeInTheDocument();
    expect(cellReviewBtn).toBeEnabled();

    await user.click(cellReviewBtn);

    expect(cellReviewCalls).toHaveLength(1);
    expect(cellReviewCalls[0]?.body).toEqual({ docId: 'index' });

    const inlineDrawer = await screen.findByTestId('inline-chat-drawer-blk_01');
    expect(inlineDrawer).toBeInTheDocument();

    const inlineDrawerReviewBtn = within(inlineDrawer).getByTestId(
      'inline-drawer-adversarial-review-btn-blk_01'
    );
    expect(inlineDrawerReviewBtn).toBeInTheDocument();

    await waitFor(() => {
      expect(
        within(inlineDrawer).getByText(/Sign error in Carnot efficiency/i)
      ).toBeInTheDocument();
    });
  });

  it('selects Adversarial Spec Review (adversarial-review) in SeedModal and SidebarTree pedagogical profile dropdowns and persists via PUT /api/settings', async () => {
    const settingsPayloads: Array<Record<string, unknown>> = [];
    let currentSettings = {
      modelId: 'anthropic:claude-opus-4-6',
      reasoningEffort: 'high',
      activeProfileId: 'intuitive-physical',
      customSystemPrompt: '',
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: null,
            blocks: [],
            toc: [],
            activeChat: null,
            pendingEdits: [],
            modelId: currentSettings.modelId,
            settings: currentSettings,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.endsWith('/api/settings') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        settingsPayloads.push(body);
        currentSettings = { ...currentSettings, ...body };
        return new Response(
          JSON.stringify({
            settings: currentSettings,
            modelId: currentSettings.modelId,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    globalThis.fetch = fetchMock;

    const user = userEvent.setup();
    render(<App />);

    // 1. SeedModal pedagogical profile selector (#seed-pedagogical-profile)
    const seedSelect = await screen.findByLabelText('Seed Pedagogical Style');
    expect(seedSelect).toBeInTheDocument();
    await user.selectOptions(seedSelect, 'adversarial-review');

    expect(settingsPayloads).toContainEqual({
      activeProfileId: 'adversarial-review',
    });

    // Switch back to intuitive-physical and then test SidebarTree selector (#sidebar-pedagogical-profile)
    await user.selectOptions(seedSelect, 'intuitive-physical');

    const sidebarSelect = screen.getByLabelText('Pedagogical Profile');
    expect(sidebarSelect).toBeInTheDocument();
    await user.selectOptions(sidebarSelect, 'adversarial-review');

    expect(settingsPayloads[settingsPayloads.length - 1]).toEqual({
      activeProfileId: 'adversarial-review',
    });
  });

  it('downloads clean Markdown without block comments when Download MD is clicked in the notebook header', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/api/doc') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            document: {
              id: 'estimator-convergence',
              title: 'Estimator Convergence Spec',
              filename: 'estimator-convergence.md',
              parentId: null,
              parentBlockId: null,
              childDocIds: [],
            },
            blocks: [
              {
                id: 'blk_00',
                markdown:
                  '<!-- folio:block id="blk_00" done="true" -->\n## Prerequisites & Foundations\n\nLinear algebra and probability basics.',
                done: true,
              },
              {
                id: 'blk_01',
                markdown:
                  '## 1. Estimator Convergence\n\nThe estimator converges at rate O(1/n) under finite variance.',
              },
            ],
            toc: [
              { level: 2, text: 'Prerequisites & Foundations', blockId: 'blk_00' },
              { level: 2, text: '1. Estimator Convergence', blockId: 'blk_01' },
            ],
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

    let capturedBlob: Blob | null = null;
    const createObjectURLSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation((obj: Blob | MediaSource) => {
        capturedBlob = obj as Blob;
        return 'blob:folio-test-download';
      });
    const revokeObjectURLSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});

    let capturedDownloadAttr = '';
    let capturedHrefAttr = '';
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        capturedDownloadAttr = this.download;
        capturedHrefAttr = this.getAttribute('href') ?? '';
      });

    const user = userEvent.setup();
    render(<App />);

    const downloadBtn = await screen.findByTestId('doc-download-md-btn');
    expect(downloadBtn).toBeInTheDocument();
    expect(downloadBtn).toHaveTextContent('Download MD');

    await user.click(downloadBtn);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(capturedDownloadAttr).toBe('estimator-convergence.md');
    expect(capturedHrefAttr).toBe('blob:folio-test-download');
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:folio-test-download');

    expect(capturedBlob).not.toBeNull();
    const downloadedText = await capturedBlob!.text();
    expect(downloadedText).not.toContain('<!-- folio:block');
    expect(downloadedText).toBe(
      '## Prerequisites & Foundations\n\nLinear algebra and probability basics.\n\n## 1. Estimator Convergence\n\nThe estimator converges at rate O(1/n) under finite variance.\n'
    );
  });
});
