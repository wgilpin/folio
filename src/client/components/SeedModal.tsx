import React, { useEffect, useMemo, useState } from 'react';
import {
  getConciseTitle,
  type DocumentNode,
  type NotebookSettings,
  type PedagogicalProfileId,
} from '../../shared/schema.js';

const SEARCH_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'include',
  'including',
  'about',
  'what',
  'how',
  'why',
  'when',
  'where',
  'age',
  'approaches',
  'new',
  'notebook',
  'topic',
]);

function findMatchingDocuments(
  documents: Record<string, DocumentNode>,
  rawQuery: string
): DocumentNode[] {
  const allDocs = Object.values(documents);
  if (allDocs.length === 0) {
    return [];
  }

  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return allDocs;
  }

  const tokens = query
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !SEARCH_STOP_WORDS.has(t));

  const scored: { doc: DocumentNode; score: number }[] = [];

  for (const doc of allDocs) {
    const concise = getConciseTitle(doc.title, doc.shortTitle).toLowerCase();
    const haystack = [
      doc.title,
      doc.shortTitle ?? '',
      doc.filename.replace(/\.md$/i, ''),
      ...(doc.prerequisites ?? []),
    ]
      .join(' ')
      .toLowerCase();

    let score = 0;
    if (haystack.includes(query) || (concise.length >= 3 && query.includes(concise))) {
      score += 10;
    }

    for (const token of tokens) {
      if (haystack.includes(token)) {
        score += 3;
      } else if (token.length >= 5) {
        const stem = token.slice(0, 5);
        if (haystack.includes(stem)) {
          score += 1;
        }
      }
    }

    if (score > 0) {
      scored.push({ doc, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.doc);
}

export interface SeedModalProps {
  isSubmitting: boolean;
  error: string | null;
  onSeed: (prompt: string) => Promise<void>;
  documents?: Record<string, DocumentNode>;
  onSelectDocument?: (docId: string) => void;
  onDeleteDocument?: (docId: string) => Promise<void> | void;
  settings?: NotebookSettings;
  onUpdateSettings?: (patch: Partial<NotebookSettings>) => Promise<void> | void;
  onClose?: () => void;
  mode?: 'inline' | 'modal';
}

export function SeedModal({
  isSubmitting,
  error,
  onSeed,
  documents = {},
  onSelectDocument,
  onDeleteDocument,
  settings,
  onUpdateSettings,
  onClose,
  mode = 'inline',
}: SeedModalProps): React.ReactElement {
  const [prompt, setPrompt] = useState('');
  const effectiveProfileId: PedagogicalProfileId =
    settings?.activeProfileId ?? 'intuitive-physical';
  const effectiveCustomPrompt = settings?.customSystemPrompt ?? '';
  const [customPromptDraft, setCustomPromptDraft] =
    useState<string>(effectiveCustomPrompt);

  useEffect(() => {
    setCustomPromptDraft(effectiveCustomPrompt);
  }, [effectiveCustomPrompt]);

  const allDocsCount = Object.keys(documents).length;
  const matchingDocs = useMemo(
    () => findMatchingDocuments(documents, prompt),
    [documents, prompt]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isSubmitting) {
      return;
    }
    if (
      effectiveProfileId === 'custom' &&
      customPromptDraft !== effectiveCustomPrompt &&
      onUpdateSettings
    ) {
      await onUpdateSettings({
        activeProfileId: 'custom',
        customSystemPrompt: customPromptDraft,
      });
    }
    await onSeed(trimmed);
  };

  const card = (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E4DFD7',
        borderRadius: '8px',
        padding: '32px',
        maxWidth: '560px',
        width: '100%',
        boxShadow: '0 2px 8px rgba(24, 24, 27, 0.06)',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <h2
        style={{
          fontFamily: "'Newsreader', 'Charter', 'Georgia', serif",
          fontSize: '22px',
          color: '#18181B',
          marginTop: 0,
          marginBottom: '8px',
        }}
      >
        Seed a New Notebook
      </h2>
      <p
        style={{
          fontSize: '14px',
          color: '#65635E',
          marginTop: 0,
          marginBottom: '16px',
          lineHeight: 1.5,
        }}
      >
        Enter a topic to generate 4–8 initial Concept Blocks, or search existing notebooks below.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            border: '1px solid #B91C1C',
            borderRadius: '6px',
            padding: '12px',
            fontSize: '13px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <label
          htmlFor="seed-topic-input"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            color: '#18181B',
            marginBottom: '8px',
          }}
        >
          Topic Prompt / Search Existing
        </label>
        <input
          id="seed-topic-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a topic (e.g., Hamiltonian Mechanics, Adlerian Psychology, Information Warfare)"
          disabled={isSubmitting}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px',
            fontSize: '14px',
            fontFamily: "'Inter', system-ui, sans-serif",
            color: '#18181B',
            backgroundColor: '#FAF8F5',
            border: '1px solid #E4DFD7',
            borderRadius: '6px',
            marginBottom: '16px',
          }}
        />

        {allDocsCount > 0 && (
          <div
            data-testid="seed-existing-docs"
            style={{
              marginBottom: '16px',
              backgroundColor: '#FAF8F5',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: '#65635E',
                marginBottom: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {prompt.trim()
                  ? `Matching Existing Notebooks (${matchingDocs.length})`
                  : `Existing Notebooks (${allDocsCount})`}
              </span>
            </div>

            {matchingDocs.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#65635E' }}>
                No existing notebooks match &ldquo;{prompt.trim()}&rdquo;.
              </div>
            ) : (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  maxHeight: '160px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {matchingDocs.map((doc) => {
                  const navTitle = getConciseTitle(doc.title, doc.shortTitle);
                  return (
                    <li
                      key={doc.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E4DFD7',
                        borderRadius: '6px',
                        padding: '6px 10px',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#18181B',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={doc.title}
                        >
                          {doc.parentId ? `↳ ${navTitle}` : navTitle}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#65635E',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                          title={doc.title}
                        >
                          {doc.title !== navTitle ? `${doc.title} • ` : ''}
                          {doc.filename}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {onSelectDocument && (
                          <button
                            type="button"
                            onClick={() => onSelectDocument(doc.id)}
                            style={{
                              backgroundColor: '#FAF8F5',
                              color: '#1D4ED8',
                              border: '1px solid #E4DFD7',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            Open
                          </button>
                        )}
                        {onDeleteDocument && (
                          <button
                            type="button"
                            aria-label={`Delete notebook ${navTitle}`}
                            onClick={() => void onDeleteDocument(doc.id)}
                            style={{
                              backgroundColor: '#FEF2F2',
                              color: '#B91C1C',
                              border: '1px solid #FECACA',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              fontSize: '12px',
                              cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label
            htmlFor="seed-pedagogical-profile"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: '#18181B',
              marginBottom: '6px',
            }}
          >
            Pedagogical Style
          </label>
          <select
            id="seed-pedagogical-profile"
            aria-label="Seed Pedagogical Style"
            value={effectiveProfileId}
            disabled={isSubmitting}
            onChange={(e) =>
              void onUpdateSettings?.({
                activeProfileId: e.target.value as PedagogicalProfileId,
              })
            }
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              fontSize: '13px',
              fontFamily: "'Inter', system-ui, sans-serif",
              color: '#18181B',
              backgroundColor: '#FAF8F5',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
            }}
          >
            <option value="intuitive-physical">
              Intuitive & Conceptual (Big-picture mental models & analogies)
            </option>
            <option value="rigorous-derivation">
              Rigorous & Formal (Deep structural analysis & formal derivations)
            </option>
            <option value="custom">Custom Prompt</option>
          </select>

          {effectiveProfileId === 'custom' && (
            <textarea
              aria-label="Seed Custom Pedagogical Prompt"
              value={customPromptDraft}
              disabled={isSubmitting}
              onChange={(e) => setCustomPromptDraft(e.target.value)}
              rows={3}
              placeholder="Optional custom instructions for how to explain this topic..."
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                fontFamily: "'Inter', system-ui, sans-serif",
                color: '#18181B',
                backgroundColor: '#FAF8F5',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
              }}
            />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          {mode === 'modal' && onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                backgroundColor: '#FAF8F5',
                color: '#18181B',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !prompt.trim()}
            style={{
              backgroundColor: '#1D4ED8',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: isSubmitting ? 'wait' : 'pointer',
            }}
          >
            {isSubmitting ? 'Generating blocks...' : 'Seed Topic'}
          </button>
        </div>
      </form>
    </div>
  );

  if (mode === 'modal') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Seed Topic Modal"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(24, 24, 27, 0.24)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          zIndex: 50,
        }}
      >
        {card}
      </div>
    );
  }

  return card;
}
