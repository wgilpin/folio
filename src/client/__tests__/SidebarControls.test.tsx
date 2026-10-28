// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';

describe('SidebarControls (Epic 02 — BYOM, Pedagogical Profile & Workspace UI)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('switches BYOM model and reasoning budget in SidebarTree and sends PUT /api/settings', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Statistical Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Statistical Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
        },
      },
      blocks: [{ id: 'b-001', markdown: '## Canonical Ensemble' }],
      toc: [{ level: 2, text: 'Canonical Ensemble', blockId: 'b-001' }],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      settings: {
        modelId: 'anthropic:claude-opus-4-6',
        reasoningEffort: 'high',
        activeProfileId: 'intuitive-physical',
        customSystemPrompt: '',
      },
      workspaceDir: '/tmp/workspace-statmech',
      workspaces: ['/tmp/workspace-statmech'],
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(initialDocPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        const nextSettings = {
          ...initialDocPayload.settings,
          ...body,
        };
        initialDocPayload.settings = nextSettings;
        initialDocPayload.modelId = nextSettings.modelId;
        return new Response(
          JSON.stringify({
            settings: nextSettings,
            modelId: nextSettings.modelId,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Statistical Mechanics' })
      ).toBeTruthy();
    });

    const modelSelect = screen.getByLabelText('Active Model') as HTMLSelectElement;
    expect(modelSelect.value).toBe('anthropic:claude-opus-4-6');

    fireEvent.change(modelSelect, { target: { value: 'openai:o3' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ modelId: 'openai:o3' }),
        })
      );
      expect((screen.getByLabelText('Active Model') as HTMLSelectElement).value).toBe(
        'openai:o3'
      );
    });

    const reasoningSelect = screen.getByLabelText(
      'Reasoning Effort'
    ) as HTMLSelectElement;
    expect(reasoningSelect.value).toBe('high');

    fireEvent.change(reasoningSelect, { target: { value: 'medium' } });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ reasoningEffort: 'medium' }),
        })
      );
      expect(
        (screen.getByLabelText('Reasoning Effort') as HTMLSelectElement).value
      ).toBe('medium');
    });
  });

  it('switches pedagogical prompt profile and saves custom pedagogical instructions via PUT /api/settings', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Hamiltonian Mechanics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Hamiltonian Mechanics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
        },
      },
      blocks: [{ id: 'b-001', markdown: '## Phase Space' }],
      toc: [{ level: 2, text: 'Phase Space', blockId: 'b-001' }],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      settings: {
        modelId: 'anthropic:claude-opus-4-6',
        reasoningEffort: 'high',
        activeProfileId: 'intuitive-physical',
        customSystemPrompt: '',
      },
      workspaceDir: '/tmp/workspace-hamiltonian',
      workspaces: ['/tmp/workspace-hamiltonian'],
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(initialDocPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/settings' && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        const nextSettings = {
          ...initialDocPayload.settings,
          ...body,
        };
        initialDocPayload.settings = nextSettings;
        return new Response(
          JSON.stringify({
            settings: nextSettings,
            modelId: nextSettings.modelId,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Hamiltonian Mechanics' })
      ).toBeTruthy();
    });

    const profileSelect = screen.getByLabelText(
      'Pedagogical Profile'
    ) as HTMLSelectElement;
    expect(profileSelect.value).toBe('intuitive-physical');

    fireEvent.change(profileSelect, { target: { value: 'custom' } });

    const customTextarea = await waitFor(() =>
      screen.getByLabelText('Custom Pedagogical Prompt')
    );

    fireEvent.change(customTextarea, {
      target: { value: 'Derive every equation from Symplectic geometry' },
    });

    const saveBtn = screen.getByRole('button', {
      name: 'Save custom pedagogical prompt',
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            activeProfileId: 'custom',
            customSystemPrompt: 'Derive every equation from Symplectic geometry',
          }),
        })
      );
    });
  });

  it('does not render the vestigial Root Folder input or Switch Workspace button in SidebarTree', async () => {
    const initialDocPayload = {
      document: {
        id: 'index',
        title: 'Workspace A Topic',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Workspace A Topic',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
        },
      },
      blocks: [{ id: 'b-001', markdown: '## Overview A' }],
      toc: [{ level: 2, text: 'Overview A', blockId: 'b-001' }],
      activeChat: null,
      pendingEdits: [],
      modelId: 'anthropic:claude-opus-4-6',
      settings: {
        modelId: 'anthropic:claude-opus-4-6',
        reasoningEffort: 'high',
        activeProfileId: 'intuitive-physical',
        customSystemPrompt: '',
      },
      workspaceDir: '/tmp/workspace-a',
      workspaces: ['/tmp/workspace-a'],
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(initialDocPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 1, name: 'Workspace A Topic' })
      ).toBeTruthy();
    });

    // Core Sidebar controls are present
    expect(screen.getByLabelText('Search library')).toBeTruthy();
    expect(screen.getByText('Document Tree')).toBeTruthy();
    expect(screen.getByText('Current Doc ToC')).toBeTruthy();
    expect(screen.getByLabelText('Active Model')).toBeTruthy();
    expect(screen.getByLabelText('Reasoning Effort')).toBeTruthy();
    expect(screen.getByLabelText('Pedagogical Profile')).toBeTruthy();
    expect(screen.getByText('Learner Ability Record')).toBeTruthy();

    // Vestigial Root Folder / Switch Workspace controls are absent (ISS-6)
    expect(screen.queryByText('Root Folder')).toBeNull();
    expect(screen.queryByLabelText('Workspace directory path')).toBeNull();
    expect(screen.queryByRole('button', { name: /Switch workspace/i })).toBeNull();
  });
});
