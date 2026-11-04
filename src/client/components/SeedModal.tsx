import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  getConciseTitle,
  type DocumentNode,
  type NotebookSettings,
  type PedagogicalProfileId,
  type SeedSourceInput,
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

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    const ab = await file.arrayBuffer();
    return new Uint8Array(ab);
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read file bytes'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function readFileAsSeedSource(file: File): Promise<SeedSourceInput> {
  const bytes = await readFileBytes(file);
  const isPdf =
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    return {
      filename: file.name,
      mediaType: 'application/pdf',
      kind: 'pdf',
      content: bytesToBase64(bytes),
      encoding: 'base64',
    };
  }

  const isMarkdown =
    file.type === 'text/markdown' || /\.(md|markdown)$/i.test(file.name);
  const textContent = new TextDecoder('utf-8').decode(bytes);
  return {
    filename: file.name,
    mediaType: isMarkdown ? 'text/markdown' : 'text/plain',
    kind: 'markdown',
    content: textContent,
    encoding: 'utf-8',
  };
}

export interface SeedModalProps {
  isSubmitting: boolean;
  error: string | null;
  onSeed: (prompt: string, source?: SeedSourceInput) => Promise<void>;
  documents?: Record<string, DocumentNode>;
  onSelectDocument?: (docId: string) => void;
  onDeleteDocument?: (docId: string) => Promise<void> | void;
  settings?: NotebookSettings;
  onUpdateSettings?: (patch: Partial<NotebookSettings>) => Promise<void> | void;
  onCancel?: () => void;
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
  onCancel,
  onClose,
  mode = 'inline',
}: SeedModalProps): React.ReactElement {
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState<SeedSourceInput | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      return;
    }
    void readFileAsSeedSource(selectedFile).then((parsed) => {
      setSource(parsed);
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText =
      e.clipboardData?.getData('text/plain') ||
      e.clipboardData?.getData('text') ||
      '';
    if (pastedText.includes('\n')) {
      e.preventDefault();
      setSource({
        filename: 'pasted-source.txt',
        mediaType: 'text/plain',
        kind: 'paste',
        content: pastedText,
        encoding: 'utf-8',
      });
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer?.files?.[0];
    if (droppedFile) {
      void readFileAsSeedSource(droppedFile).then((parsed) => {
        setSource(parsed);
      });
    }
  };

  const handleRemoveSource = () => {
    setSource(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = prompt.trim();
    if ((!trimmed && !source) || isSubmitting) {
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
    await onSeed(trimmed, source ?? undefined);
  };

  const handleTopicKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  const card = (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
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
        Enter a topic, paste multi-line notes or AI chat, or attach a .pdf / .md file to generate 4–8 initial Concept Blocks.
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '8px',
          }}
        >
          <label
            htmlFor="seed-topic-input"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#18181B',
            }}
          >
            Topic Prompt / Search Existing
          </label>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload source file"
              accept=".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain"
              disabled={isSubmitting}
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => fileInputRef.current?.click()}
              style={{
                backgroundColor: '#FAF8F5',
                color: '#1D4ED8',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: 500,
                cursor: isSubmitting ? 'wait' : 'pointer',
              }}
            >
              Attach .pdf or .md
            </button>
          </div>
        </div>

        {source && (
          <div
            data-testid="seed-source-attachment"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              backgroundColor: '#F3EFEA',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '8px 12px',
              marginBottom: '12px',
              fontSize: '13px',
              color: '#18181B',
            }}
          >
            <span
              style={{
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Attached source: {source.filename}
            </span>
            <button
              type="button"
              aria-label="Remove source attachment"
              disabled={isSubmitting}
              onClick={handleRemoveSource}
              style={{
                backgroundColor: '#FFFFFF',
                color: '#B91C1C',
                border: '1px solid #FECACA',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Remove source
            </button>
          </div>
        )}

        <textarea
          id="seed-topic-input"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleTopicKeyDown}
          onPaste={handlePaste}
          placeholder={
            source
              ? 'Optional steering prompt (e.g., Focus on section 3)...'
              : 'Enter a topic (e.g., Hamiltonian Mechanics, Adlerian Psychology, Information Warfare)'
          }
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
            resize: 'vertical',
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
            <option value="adversarial-review">
              Adversarial Spec Review (Falsification-first technical audit)
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
          {((mode === 'modal' && onClose) || (isSubmitting && onCancel)) && (
            <button
              type="button"
              onClick={isSubmitting && onCancel ? onCancel : onClose}
              disabled={isSubmitting && !onCancel}
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
            disabled={isSubmitting || (!prompt.trim() && !source)}
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
