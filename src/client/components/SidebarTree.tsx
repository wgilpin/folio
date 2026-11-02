import React, { useEffect, useState } from 'react';
import {
  getConciseTitle,
  type DocumentNode,
  type LearnerProfile,
  type NotebookSettings,
  type PedagogicalProfileId,
  type ReasoningEffort,
  type SearchResultItem,
  type TocItem,
} from '../../shared/schema.js';

export interface SidebarTreeProps {
  document: DocumentNode | null;
  documents?: Record<string, DocumentNode>;
  toc: TocItem[];
  modelId: string;
  settings?: NotebookSettings;
  profile?: LearnerProfile;
  workspaceDir?: string;
  workspaces?: string[];
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSeedModal: () => void;
  onSelectDocument?: (docId: string) => void;
  onSelectSearchResult?: (docId: string, blockId: string) => Promise<void> | void;
  onDeleteDocument?: (docId: string) => Promise<void> | void;
  onUpdateSettings?: (patch: Partial<NotebookSettings>) => Promise<void> | void;
  onUpdateAbilityRecord?: (patch: {
    background?: string;
    learningInstructions?: string;
  }) => Promise<void> | void;
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
  profile,
  workspaceDir = '',
  workspaces = [],
  collapsed,
  onToggleCollapse,
  onOpenSeedModal,
  onSelectDocument,
  onSelectSearchResult,
  onDeleteDocument,
  onUpdateSettings,
  onUpdateAbilityRecord,
  onSwitchWorkspace,
}: SidebarTreeProps): React.ReactElement {
  const effectiveModelId = settings?.modelId ?? modelId;
  const effectiveReasoningEffort: ReasoningEffort =
    settings?.reasoningEffort ?? 'high';
  const effectiveProfileId: PedagogicalProfileId =
    settings?.activeProfileId ?? 'intuitive-physical';
  const effectiveCustomPrompt = settings?.customSystemPrompt ?? '';
  const effectiveBackground = profile?.background ?? '';
  const effectiveLearningInstructions = profile?.learningInstructions ?? '';
  const engagedSources = profile?.engagedSources ?? [];

  const [workspaceInput, setWorkspaceInput] = useState<string>(workspaceDir);
  const [customPromptDraft, setCustomPromptDraft] =
    useState<string>(effectiveCustomPrompt);
  const [backgroundDraft, setBackgroundDraft] =
    useState<string>(effectiveBackground);
  const [learningInstructionsDraft, setLearningInstructionsDraft] =
    useState<string>(effectiveLearningInstructions);
  const [isAbilityRecordDirty, setIsAbilityRecordDirty] =
    useState<boolean>(false);
  const [collapsedDocIds, setCollapsedDocIds] = useState<Record<string, boolean>>(
    {}
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);

  useEffect(() => {
    setBackgroundDraft(effectiveBackground);
  }, [effectiveBackground]);

  useEffect(() => {
    setLearningInstructionsDraft(effectiveLearningInstructions);
  }, [effectiveLearningInstructions]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    let cancelled = false;
    async function runSearch() {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&mode=hybrid`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results?: SearchResultItem[] };
        if (!cancelled) {
          setSearchResults(data.results ?? []);
        }
      } catch {
        // Ignore network errors during live search typing
      }
    }

    void runSearch();
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

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

  const collapseAllDocs = () => {
    const next: Record<string, boolean> = {};
    for (const docNode of allDocs) {
      if (docNode.childDocIds.length > 0) {
        next[docNode.id] = true;
      }
    }
    if (document && document.childDocIds.length > 0) {
      next[document.id] = true;
    }
    setCollapsedDocIds(next);
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
            Search Library
          </div>
          <input
            type="search"
            aria-label="Search library"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search concepts, formulas..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '13px',
              color: '#18181B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '6px 8px',
            }}
          />
          {searchQuery.trim().length > 0 && (
            <div
              role="region"
              aria-label="Library search results"
              style={{
                marginTop: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    key={`${item.docId}-${item.blockId}`}
                    type="button"
                    onClick={() => {
                      if (onSelectSearchResult) {
                        void onSelectSearchResult(item.docId, item.blockId);
                      } else {
                        onSelectDocument?.(item.docId);
                      }
                    }}
                    style={{
                      textAlign: 'left',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E4DFD7',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      cursor: 'pointer',
                      fontFamily: "'Inter', system-ui, sans-serif",
                    }}
                  >
                    <div
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: '#18181B',
                        marginBottom: '2px',
                      }}
                    >
                      {getConciseTitle(item.docTitle)}
                      {item.heading ? ` — ${item.heading}` : ''}
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#65635E',
                        lineHeight: 1.4,
                      }}
                    >
                      {item.snippet}
                    </div>
                  </button>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: '#65635E' }}>
                  No matching blocks
                </div>
              )}
            </div>
          )}
        </section>

        <section style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: '#65635E',
              }}
            >
              Document Tree
            </span>
            {rootDocs.length > 0 && (
              <button
                type="button"
                aria-label="Collapse all documents"
                onClick={collapseAllDocs}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid #E4DFD7',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  fontFamily: "'Inter', system-ui, sans-serif",
                  color: '#65635E',
                  cursor: 'pointer',
                  lineHeight: 1.2,
                }}
              >
                Collapse all
              </button>
            )}
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
            <option value="adversarial-review">Adversarial Spec Review</option>
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

        <div
          style={{
            borderTop: '1px solid #E4DFD7',
            paddingTop: '12px',
            marginTop: '4px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: '#65635E',
            }}
          >
            Learner Ability Record
          </div>
          <div>
            <label
              htmlFor="sidebar-learner-background"
              style={{
                display: 'block',
                fontSize: '12px',
                color: '#65635E',
                marginBottom: '4px',
              }}
            >
              Learner Background
            </label>
            <textarea
              id="sidebar-learner-background"
              aria-label="Learner Background"
              value={backgroundDraft}
              onFocus={() => setIsAbilityRecordDirty(true)}
              onChange={(e) => {
                setBackgroundDraft(e.target.value);
                setIsAbilityRecordDirty(true);
              }}
              rows={2}
              placeholder="e.g. First year Nat Sci (Physical) at Cambridge."
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
                resize: 'vertical',
              }}
            />
          </div>
          <div>
            <label
              htmlFor="sidebar-standing-learning-instructions"
              style={{
                display: 'block',
                fontSize: '12px',
                color: '#65635E',
                marginBottom: '4px',
              }}
            >
              Standing Learning Instructions
            </label>
            <textarea
              id="sidebar-standing-learning-instructions"
              aria-label="Standing Learning Instructions"
              value={learningInstructionsDraft}
              onFocus={() => setIsAbilityRecordDirty(true)}
              onChange={(e) => {
                setLearningInstructionsDraft(e.target.value);
                setIsAbilityRecordDirty(true);
              }}
              rows={2}
              placeholder="e.g. I am a visual learner. Explain terms as they are introduced."
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
                resize: 'vertical',
              }}
            />
          </div>
          {(isAbilityRecordDirty ||
            backgroundDraft !== effectiveBackground ||
            learningInstructionsDraft !== effectiveLearningInstructions) && (
            <button
              type="button"
              aria-label="Save learner ability record"
              onClick={() =>
                void onUpdateAbilityRecord?.({
                  background: backgroundDraft,
                  learningInstructions: learningInstructionsDraft,
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
              Save Ability Record
            </button>
          )}

          {engagedSources.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                marginTop: '4px',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#65635E',
                }}
              >
                Engaged Sources
              </div>
              {engagedSources.map((source) => (
                <div
                  key={`${source.workspaceDir ?? ''}-${source.docId}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    padding: '4px 6px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E4DFD7',
                    borderRadius: '6px',
                    color: '#18181B',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={source.docTitle}
                  >
                    {source.docTitle}
                  </span>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      color: '#15803D',
                      flexShrink: 0,
                    }}
                  >
                    {source.completedBlockIds.length}/{source.totalBlocks} blocks done
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </footer>
    </nav>
  );
}
