import React, { useEffect, useState } from 'react';
import {
  getConciseTitle,
  type DocumentNode,
  type NotebookSettings,
  type PedagogicalProfileId,
  type ReasoningEffort,
  type TocItem,
} from '../../shared/schema.js';

export interface SidebarTreeProps {
  document: DocumentNode | null;
  documents?: Record<string, DocumentNode>;
  toc: TocItem[];
  modelId: string;
  settings?: NotebookSettings;
  workspaceDir?: string;
  workspaces?: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSeedModal: () => void;
  onSelectDocument?: (docId: string) => void;
  onDeleteDocument?: (docId: string) => Promise<void> | void;
  onUpdateSettings?: (patch: Partial<NotebookSettings>) => Promise<void> | void;
  onSwitchWorkspace?: (workspaceDir: string) => Promise<void> | void;
}

const PRESET_MODELS = [
  'anthropic:claude-opus-4-6',
  'google:gemini-3.1-pro',
  'openai:o3',
];

export function SidebarTree({
  document,
  documents = {},
  toc,
  modelId,
  settings,
  workspaceDir = '',
  workspaces = [],
  collapsed,
  onToggleCollapse,
  onOpenSeedModal,
  onSelectDocument,
  onDeleteDocument,
  onUpdateSettings,
  onSwitchWorkspace,
}: SidebarTreeProps): React.ReactElement {
  const effectiveModelId = settings?.modelId ?? modelId;
  const effectiveReasoningEffort: ReasoningEffort =
    settings?.reasoningEffort ?? 'high';
  const effectiveProfileId: PedagogicalProfileId =
    settings?.activeProfileId ?? 'intuitive-physical';
  const effectiveCustomPrompt = settings?.customSystemPrompt ?? '';

  const [workspaceInput, setWorkspaceInput] = useState<string>(workspaceDir);
  const [customPromptDraft, setCustomPromptDraft] =
    useState<string>(effectiveCustomPrompt);
  const [collapsedDocIds, setCollapsedDocIds] = useState<Record<string, boolean>>(
    {}
  );

  useEffect(() => {
    setWorkspaceInput(workspaceDir);
  }, [workspaceDir]);

  useEffect(() => {
    setCustomPromptDraft(effectiveCustomPrompt);
  }, [effectiveCustomPrompt]);

  const modelOptions = PRESET_MODELS.includes(effectiveModelId)
    ? PRESET_MODELS
    : [...PRESET_MODELS, effectiveModelId];

  const allDocs = Object.values(documents);
  const rootDocs =
    allDocs.length > 0
      ? allDocs.filter((d) => d.parentId === null)
      : document
      ? [document]
      : [];

  const toggleDocCollapse = (docId: string) => {
    setCollapsedDocIds((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

  const renderDocTree = (docNode: DocumentNode, depth: number): React.ReactElement => {
    const isActive = document?.id === docNode.id;
    const navTitle = getConciseTitle(docNode.title, docNode.shortTitle);
    const children = docNode.childDocIds
      .map((childId) => documents[childId])
      .filter((c): c is DocumentNode => Boolean(c));
    const isBranchCollapsed = Boolean(collapsedDocIds[docNode.id]);

    return (
      <li
        key={docNode.id}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            marginBottom: '4px',
            paddingLeft: `${depth * 14}px`,
          }}
        >
          {children.length > 0 && (
            <button
              type="button"
              aria-label={
                isBranchCollapsed
                  ? `Expand children of ${navTitle}`
                  : `Collapse children of ${navTitle}`
              }
              onClick={() => toggleDocCollapse(docNode.id)}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px',
                fontSize: '11px',
                color: '#65635E',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              {isBranchCollapsed ? '▸' : '▾'}
            </button>
          )}
          <button
            type="button"
            aria-label={`Open document ${navTitle}`}
            title={docNode.title}
            onClick={() => onSelectDocument?.(docNode.id)}
            style={{
              flex: 1,
              textAlign: 'left',
              padding: '8px 12px',
              backgroundColor: isActive ? '#FFFFFF' : 'transparent',
              border: isActive ? '1px solid #E4DFD7' : '1px solid transparent',
              borderRadius: '6px',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '13px',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#18181B' : '#65635E',
              cursor: 'pointer',
            }}
          >
            {depth > 0 ? `↳ ${navTitle}` : navTitle}
          </button>
          {onDeleteDocument && (
            <button
              type="button"
              aria-label={`Delete document ${navTitle}`}
              title={`Delete "${docNode.title}"`}
              onClick={(e) => {
                e.stopPropagation();
                void onDeleteDocument(docNode.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 6px',
                fontSize: '14px',
                color: '#65635E',
                cursor: 'pointer',
                lineHeight: 1,
                borderRadius: '4px',
              }}
            >
              ×
            </button>
          )}
        </div>
        {children.length > 0 && !isBranchCollapsed && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {children.map((child) => renderDocTree(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  if (collapsed) {
    return (
      <aside
        aria-label="Notebook Sidebar"
        style={{
          backgroundColor: '#F3EFEA',
          borderRight: '1px solid #E4DFD7',
          padding: '12px',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label="Expand sidebar"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DFD7',
            borderRadius: '6px',
            padding: '8px 12px',
            fontSize: '13px',
            color: '#18181B',
            cursor: 'pointer',
          }}
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <nav
      aria-label="Notebook Sidebar"
      style={{
        width: '260px',
        minWidth: '260px',
        backgroundColor: '#F3EFEA',
        borderRight: '1px solid #E4DFD7',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        fontFamily: "'Inter', system-ui, sans-serif",
        boxSizing: 'border-box',
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
          }}
        >
          <span
            style={{
              fontFamily: "'Newsreader', 'Charter', 'Georgia', serif",
              fontSize: '22px',
              fontWeight: 600,
              color: '#18181B',
            }}
          >
            folio
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onOpenSeedModal}
              style={{
                backgroundColor: '#1D4ED8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              + New
            </button>
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Collapse sidebar"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
                color: '#65635E',
                cursor: 'pointer',
              }}
            >
              ←
            </button>
          </div>
        </div>

        <section style={{ marginBottom: '20px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#65635E',
              marginBottom: '8px',
            }}
          >
            Root Folder
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              type="text"
              aria-label="Workspace directory path"
              value={workspaceInput}
              onChange={(e) => setWorkspaceInput(e.target.value)}
              placeholder="/path/to/workspace"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
                color: '#18181B',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '6px 8px',
              }}
            />
            <button
              type="button"
              aria-label="Switch workspace"
              onClick={() => {
                if (workspaceInput.trim()) {
                  void onSwitchWorkspace?.(workspaceInput.trim());
                }
              }}
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '6px 8px',
                fontSize: '12px',
                color: '#18181B',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Switch Workspace
            </button>
            {workspaces.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {workspaces.map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => void onSwitchWorkspace?.(ws)}
                    style={{
                      textAlign: 'left',
                      fontSize: '11px',
                      fontFamily: "'JetBrains Mono', monospace",
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: 'none',
                      backgroundColor: ws === workspaceDir ? '#FFFFFF' : 'transparent',
                      color: ws === workspaceDir ? '#18181B' : '#65635E',
                      cursor: 'pointer',
                    }}
                  >
                    {ws}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={{ marginBottom: '24px' }}>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#65635E',
              marginBottom: '8px',
            }}
          >
            Document Tree
          </div>
          {rootDocs.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {rootDocs.map((rootDoc) => renderDocTree(rootDoc, 0))}
            </ul>
          ) : (
            <div style={{ fontSize: '13px', color: '#65635E' }}>
              No documents yet
            </div>
          )}
        </section>

        <section>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#65635E',
              marginBottom: '8px',
            }}
          >
            Current Doc ToC
          </div>
          {toc.length > 0 ? (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {toc.map((item, idx) => (
                <li
                  key={`${item.blockId}-${idx}`}
                  style={{
                    paddingLeft: `${(item.level - 1) * 8}px`,
                  }}
                >
                  <a
                    href={`#block-${item.blockId}`}
                    style={{
                      display: 'block',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#65635E',
                      textDecoration: 'none',
                    }}
                  >
                    {idx === 0 || item.blockId === 'blk_00'
                      ? item.text.replace(/^0\.\s*/, '')
                      : item.text}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: '13px', color: '#65635E' }}>
              No headings
            </div>
          )}
        </section>
      </div>

      <footer
        style={{
          borderTop: '1px solid #E4DFD7',
          paddingTop: '12px',
          marginTop: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        <div>
          <label
            htmlFor="sidebar-active-model"
            style={{
              display: 'block',
              fontSize: '12px',
              color: '#65635E',
              marginBottom: '4px',
            }}
          >
            Active Model
          </label>
          <select
            id="sidebar-active-model"
            aria-label="Active Model"
            value={effectiveModelId}
            onChange={(e) => void onUpdateSettings?.({ modelId: e.target.value })}
            style={{
              width: '100%',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              color: '#18181B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >
            {modelOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="sidebar-reasoning-effort"
            style={{
              display: 'block',
              fontSize: '12px',
              color: '#65635E',
              marginBottom: '4px',
            }}
          >
            Reasoning Effort
          </label>
          <select
            id="sidebar-reasoning-effort"
            aria-label="Reasoning Effort"
            value={effectiveReasoningEffort}
            onChange={(e) =>
              void onUpdateSettings?.({
                reasoningEffort: e.target.value as ReasoningEffort,
              })
            }
            style={{
              width: '100%',
              fontSize: '12px',
              color: '#18181B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="sidebar-pedagogical-profile"
            style={{
              display: 'block',
              fontSize: '12px',
              color: '#65635E',
              marginBottom: '4px',
            }}
          >
            Pedagogical Profile
          </label>
          <select
            id="sidebar-pedagogical-profile"
            aria-label="Pedagogical Profile"
            value={effectiveProfileId}
            onChange={(e) =>
              void onUpdateSettings?.({
                activeProfileId: e.target.value as PedagogicalProfileId,
              })
            }
            style={{
              width: '100%',
              fontSize: '12px',
              color: '#18181B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >
            <option value="intuitive-physical">Intuitive & Conceptual</option>
            <option value="rigorous-derivation">Rigorous & Formal</option>
            <option value="custom">Custom Prompt</option>
          </select>
        </div>

        {effectiveProfileId === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <textarea
              aria-label="Custom Pedagogical Prompt"
              value={customPromptDraft}
              onChange={(e) => setCustomPromptDraft(e.target.value)}
              rows={3}
              placeholder="Custom pedagogical system prompt..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                fontSize: '12px',
                color: '#18181B',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '6px 8px',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            />
            <button
              type="button"
              aria-label="Save custom pedagogical prompt"
              onClick={() =>
                void onUpdateSettings?.({
                  activeProfileId: 'custom',
                  customSystemPrompt: customPromptDraft,
                })
              }
              style={{
                backgroundColor: '#1D4ED8',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 8px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Save Prompt
            </button>
          </div>
        )}
      </footer>
    </nav>
  );
}
