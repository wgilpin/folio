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

  it('switches active notebook workspace folder from SidebarTree via POST /api/workspaces/switch and renders the new workspace document', async () => {
    const workspaceAPayload = {
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

    const workspaceBPayload = {
      document: {
        id: 'index',
        title: 'Workspace B Electrodynamics',
        filename: 'index.md',
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      },
      documents: {
        index: {
          id: 'index',
          title: 'Workspace B Electrodynamics',
          filename: 'index.md',
          parentId: null,
          parentBlockId: null,
          childDocIds: [],
        },
      },
      blocks: [{ id: 'b-001', markdown: '## Maxwell Equations' }],
      toc: [{ level: 2, text: 'Maxwell Equations', blockId: 'b-001' }],
      activeChat: null,
      pendingEdits: [],
      modelId: 'google:gemini-3.1-pro',
      settings: {
        modelId: 'google:gemini-3.1-pro',
        reasoningEffort: 'medium',
        activeProfileId: 'rigorous-derivation',
        customSystemPrompt: '',
      },
      workspaceDir: '/tmp/workspace-b',
      workspaces: ['/tmp/workspace-a', '/tmp/workspace-b'],
    };

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/doc' && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify(workspaceAPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url === '/api/workspaces/switch' && init?.method === 'POST') {
        return new Response(JSON.stringify(workspaceBPayload), {
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

    const workspaceInput = screen.getByLabelText(
      'Workspace directory path'
    ) as HTMLInputElement;
    expect(workspaceInput.value).toBe('/tmp/workspace-a');

    fireEvent.change(workspaceInput, { target: { value: '/tmp/workspace-b' } });

    const switchBtn = screen.getByRole('button', { name: 'Switch workspace' });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/workspaces/switch',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ workspaceDir: '/tmp/workspace-b' }),
        })
      );
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'Workspace B Electrodynamics',
        })
      ).toBeTruthy();
    });

    expect((screen.getByLabelText('Active Model') as HTMLSelectElement).value).toBe(
      'google:gemini-3.1-pro'
    );
    expect(
      (screen.getByLabelText('Reasoning Effort') as HTMLSelectElement).value
    ).toBe('medium');
    expect(
      (screen.getByLabelText('Pedagogical Profile') as HTMLSelectElement).value
    ).toBe('rigorous-derivation');
  });
});
