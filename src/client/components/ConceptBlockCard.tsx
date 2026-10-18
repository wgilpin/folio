import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import type { ConceptBlock } from '../../shared/schema.js';
import { MermaidDiagram } from './MermaidDiagram.js';

export interface ConceptBlockCardProps {
  block: ConceptBlock;
  canMerge?: boolean;
  onUpdateMarkdown?: (blockId: string, markdown: string) => Promise<void> | void;
  onSplitBlock?: (blockId: string) => Promise<void> | void;
  onMergeBlock?: (blockId: string) => Promise<void> | void;
  onDeleteBlock?: (blockId: string) => Promise<void> | void;
}

interface MarkdownSegment {
  type: 'prose' | 'mermaid';
  content: string;
}

const MERMAID_FENCE_RE = /```mermaid\s*\n([\s\S]*?)```/g;

export function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;

  for (const match of markdown.matchAll(MERMAID_FENCE_RE)) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      const prose = markdown.slice(lastIndex, matchIndex).trim();
      if (prose) {
        segments.push({ type: 'prose', content: prose });
      }
    }

    const mermaidCode = match[1].trim();
    if (mermaidCode) {
      segments.push({ type: 'mermaid', content: mermaidCode });
    }

    lastIndex = matchIndex + match[0].length;
  }

  if (lastIndex < markdown.length) {
    const trailing = markdown.slice(lastIndex).trim();
    if (trailing) {
      segments.push({ type: 'prose', content: trailing });
    }
  }

  return segments;
}

const actionBtnStyle: React.CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: '12px',
  padding: '4px 8px',
  borderRadius: '6px',
  border: '1px solid #E4DFD7',
  backgroundColor: '#FAF8F5',
  color: '#65635E',
  cursor: 'pointer',
};

export function ConceptBlockCard({
  block,
  canMerge = true,
  onUpdateMarkdown,
  onSplitBlock,
  onMergeBlock,
  onDeleteBlock,
}: ConceptBlockCardProps): React.ReactElement {
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState(block.markdown);

  useEffect(() => {
    setDraftMarkdown(block.markdown);
  }, [block.markdown]);

  const segments = splitMarkdownSegments(block.markdown);

  const handleSave = async () => {
    if (onUpdateMarkdown) {
      await onUpdateMarkdown(block.id, draftMarkdown);
    }
    setIsEditingRaw(false);
  };

  const handleCancel = () => {
    setDraftMarkdown(block.markdown);
    setIsEditingRaw(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <article
      id={`block-${block.id}`}
      data-testid={`concept-block-${block.id}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: isEditingRaw ? '2px solid #1D4ED8' : '1px solid #E4DFD7',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
        boxShadow: isEditingRaw
          ? '0 2px 8px rgba(24, 24, 27, 0.06)'
          : 'none',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '12px',
          color: '#65635E',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            color: '#65635E',
          }}
        >
          {block.id}
        </span>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            aria-label={`Edit Markdown for ${block.id}`}
            onClick={() => {
              setDraftMarkdown(block.markdown);
              setIsEditingRaw(true);
            }}
            style={actionBtnStyle}
          >
            Edit MD
          </button>
          <button
            type="button"
            aria-label={`Split ${block.id}`}
            onClick={() => void onSplitBlock?.(block.id)}
            style={actionBtnStyle}
          >
            Split
          </button>
          <button
            type="button"
            aria-label={`Merge ${block.id}`}
            disabled={!canMerge}
            onClick={() => void onMergeBlock?.(block.id)}
            style={{
              ...actionBtnStyle,
              opacity: canMerge ? 1 : 0.5,
              cursor: canMerge ? 'pointer' : 'not-allowed',
            }}
          >
            Merge
          </button>
          <button
            type="button"
            aria-label={`Delete ${block.id}`}
            onClick={() => void onDeleteBlock?.(block.id)}
            style={{
              ...actionBtnStyle,
              backgroundColor: '#FEE2E2',
              color: '#B91C1C',
              borderColor: '#FEE2E2',
            }}
          >
            Delete
          </button>
        </div>
      </header>

      {isEditingRaw ? (
        <div>
          <textarea
            autoFocus
            aria-label={`Raw Markdown for ${block.id}`}
            value={draftMarkdown}
            onChange={(e) => setDraftMarkdown(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px',
              lineHeight: 1.5,
              color: '#18181B',
              backgroundColor: '#FAF8F5',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '12px',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '13px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #E4DFD7',
                backgroundColor: '#F3EFEA',
                color: '#18181B',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '13px',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #1D4ED8',
                backgroundColor: '#1D4ED8',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            fontFamily: "'Newsreader', 'Charter', 'Georgia', serif",
            fontSize: '17px',
            lineHeight: 1.65,
            color: '#18181B',
            maxWidth: '68ch',
          }}
        >
          {segments.map((segment, index) => {
            if (segment.type === 'mermaid') {
              return <MermaidDiagram key={index} code={segment.content} />;
            }

            const html = marked.parse(segment.content, { async: false }) as string;
            return (
              <div
                key={index}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
        </div>
      )}
    </article>
  );
}

