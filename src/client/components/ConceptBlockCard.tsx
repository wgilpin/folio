import React, { useEffect, useState } from 'react';
import katex from 'katex';
import { marked } from 'marked';
import type {
  ChatMessage,
  ConceptBlock,
  DocumentNode,
  LearnerProfile,
  PendingSuggestedEdit,
  TopicFamiliarity,
} from '../../shared/schema.js';
import { InlineChatDrawer } from './InlineChatDrawer.js';
import { MermaidDiagram } from './MermaidDiagram.js';
import { SubDocLinkCard } from './SubDocLinkCard.js';

export function extractPrerequisiteTopicsFromMarkdown(markdown: string): string[] {
  const topics: string[] = [];
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\s*[-*]\s+(?:\*\*([^*]+)\*\*|([^:\n]+?))\s*(?::|$)/);
    const candidate = (match?.[1] ?? match?.[2] ?? '').trim();
    if (candidate && !topics.includes(candidate)) {
      topics.push(candidate);
    }
  }
  return topics;
}

export interface DiffLine {
  type: 'unchanged' | 'removed' | 'added';
  text: string;
}

export function computeLineDiff(original: string, proposed: string): DiffLine[] {
  const orig = original.split('\n');
  const prop = proposed.split('\n');
  const m = orig.length;
  const n = prop.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (orig[i] === prop[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const diff: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === prop[j - 1]) {
      diff.unshift({ type: 'unchanged', text: orig[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ type: 'added', text: prop[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      diff.unshift({ type: 'removed', text: orig[i - 1] });
      i--;
    }
  }

  return diff;
}

export function renderMarkdownWithMath(markdown: string): string {
  const mathTokens: string[] = [];
  const stashMath = (tex: string, displayMode: boolean): string => {
    const html = katex.renderToString(tex.trim(), {
      displayMode,
      throwOnError: false,
    });
    const token = `@@FOLIO_MATH_${mathTokens.length}@@`;
    mathTokens.push(html);
    return token;
  };

  // Preserve inline code spans so `$` inside backticks is never treated as math
  const codeTokens: string[] = [];
  let processed = markdown.replace(/(`+[^`]*`+)/g, (match) => {
    const token = `@@FOLIO_CODE_${codeTokens.length}@@`;
    codeTokens.push(match);
    return token;
  });

  // Display math: $$...$$ and \[...\]
  processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    stashMath(tex, true)
  );
  processed = processed.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex: string) =>
    stashMath(tex, true)
  );

  // Inline math: \(...\) and $...$
  processed = processed.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex: string) =>
    stashMath(tex, false)
  );
  processed = processed.replace(
    /(^|[^\\$])\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$/g,
    (_, prefix: string, tex: string) => `${prefix}${stashMath(tex, false)}`
  );

  // Restore code spans before running marked
  processed = processed.replace(/@@FOLIO_CODE_(\d+)@@/g, (_, idx: string) => {
    return codeTokens[Number(idx)] ?? '';
  });

  const html = marked.parse(processed, { async: false }) as string;

  return html.replace(/@@FOLIO_MATH_(\d+)@@/g, (_, idx: string) => {
    return mathTokens[Number(idx)] ?? '';
  });
}

export interface ConceptBlockCardProps {
  block: ConceptBlock;
  canMerge?: boolean;
  isChatOpen?: boolean;
  chatMessages?: ChatMessage[];
  isSendingChat?: boolean;
  isIntegratingChat?: boolean;
  isBranchingChat?: boolean;
  chatError?: string | null;
  askCellDisabled?: boolean;
  isChatLocked?: boolean;
  pendingEdit?: PendingSuggestedEdit | null;
  childDocuments?: DocumentNode[];
  prerequisites?: string[];
  learnerProfile?: LearnerProfile;
  seedingPrerequisiteTopic?: string | null;
  onSelectDocument?: (docId: string) => void;
  onTogglePrerequisiteKnown?: (
    topic: string,
    nextStatus: TopicFamiliarity
  ) => Promise<void> | void;
  onSeedPrerequisite?: (topic: string) => Promise<void> | void;
  onOpenChat?: (blockId: string) => void;
  onSendChatMessage?: (blockId: string, message: string) => Promise<void> | void;
  onIntegrateChat?: (blockId: string) => Promise<void> | void;
  onBranchChat?: (blockId: string) => Promise<void> | void;
  onDiscardChat?: (blockId: string) => Promise<void> | void;
  onUpdateMarkdown?: (blockId: string, markdown: string) => Promise<void> | void;
  onSplitBlock?: (blockId: string) => Promise<void> | void;
  onMergeBlock?: (blockId: string) => Promise<void> | void;
  onDeleteBlock?: (blockId: string) => Promise<void> | void;
  onAcceptEdit?: (editId: string) => Promise<void> | void;
  onRejectEdit?: (editId: string) => Promise<void> | void;
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
  isChatOpen = false,
  chatMessages = [],
  isSendingChat = false,
  isIntegratingChat = false,
  isBranchingChat = false,
  chatError = null,
  askCellDisabled = false,
  isChatLocked = false,
  pendingEdit = null,
  childDocuments = [],
  prerequisites,
  learnerProfile,
  seedingPrerequisiteTopic = null,
  onSelectDocument,
  onTogglePrerequisiteKnown,
  onSeedPrerequisite,
  onOpenChat,
  onSendChatMessage,
  onIntegrateChat,
  onBranchChat,
  onDiscardChat,
  onUpdateMarkdown,
  onSplitBlock,
  onMergeBlock,
  onDeleteBlock,
  onAcceptEdit,
  onRejectEdit,
}: ConceptBlockCardProps): React.ReactElement {
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [draftMarkdown, setDraftMarkdown] = useState(block.markdown);

  useEffect(() => {
    setDraftMarkdown(block.markdown);
  }, [block.markdown]);

  const renderedMarkdown =
    childDocuments.length > 0
      ? block.markdown
          .replace(/^\s*\[→\s*Deep dive:\s*[^\]]+\]\([^)]+\)\s*$/gm, '')
          .trim()
      : block.markdown;

  const segments = splitMarkdownSegments(renderedMarkdown);
  const resolvedPrerequisites =
    block.id === 'blk_00'
      ? prerequisites && prerequisites.length > 0
        ? prerequisites
        : extractPrerequisiteTopicsFromMarkdown(block.markdown)
      : [];

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

  const isLocked = isChatLocked || askCellDisabled;
  const isDiffPending = Boolean(pendingEdit);
  const isHighlighted = isEditingRaw || isChatOpen;

  const cardBorder = isDiffPending
    ? '2px solid #F59E0B'
    : isHighlighted
    ? '2px solid #1D4ED8'
    : '1px solid #E4DFD7';

  return (
    <article
      id={`block-${block.id}`}
      data-testid={`concept-block-${block.id}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: cardBorder,
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
        boxShadow:
          isDiffPending || isHighlighted
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
            aria-label={`Ask cell ${block.id}`}
            disabled={isLocked}
            title={
              isLocked
                ? 'Resolve pending suggested edits first'
                : undefined
            }
            onClick={() => onOpenChat?.(block.id)}
            style={{
              ...actionBtnStyle,
              backgroundColor: isChatOpen ? '#1D4ED8' : '#FAF8F5',
              color: isChatOpen ? '#FFFFFF' : '#1D4ED8',
              borderColor: '#1D4ED8',
              fontWeight: 500,
              opacity: isLocked ? 0.5 : 1,
              cursor: isLocked ? 'not-allowed' : 'pointer',
            }}
          >
            Ask Cell
          </button>
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
      ) : pendingEdit ? (
        <div style={{ marginTop: '8px' }}>
          <div
            role="note"
            data-testid={`pending-edit-reason-${block.id}`}
            style={{
              backgroundColor: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: '6px',
              padding: '10px 14px',
              marginBottom: '14px',
              color: '#B45309',
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: '13px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontWeight: 600 }}>Suggested Edit: </span>
            {pendingEdit.reason}
          </div>

          <div
            data-testid={`diff-view-${block.id}`}
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '13px',
              lineHeight: 1.6,
              backgroundColor: '#FAF8F5',
              border: '1px solid #E4DFD7',
              borderRadius: '6px',
              padding: '12px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {computeLineDiff(
              pendingEdit.originalMarkdown,
              pendingEdit.proposedMarkdown
            ).map((line, idx) => {
              let bg = 'transparent';
              let color = '#65635E';
              let prefix = '  ';

              if (line.type === 'removed') {
                bg = '#FEE2E2';
                color = '#B91C1C';
                prefix = '- ';
              } else if (line.type === 'added') {
                bg = '#DCFCE7';
                color = '#15803D';
                prefix = '+ ';
              }

              return (
                <div
                  key={idx}
                  data-testid={`diff-${line.type}-line`}
                  style={{
                    backgroundColor: bg,
                    color,
                    padding: '2px 6px',
                    borderRadius: '3px',
                  }}
                >
                  {prefix}{line.text}
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '8px',
              justifyContent: 'flex-end',
              marginTop: '14px',
            }}
          >
            <button
              type="button"
              aria-label={`Reject suggested edit on ${block.id}`}
              onClick={() => void onRejectEdit?.(pendingEdit.id)}
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #E4DFD7',
                backgroundColor: '#FAF8F5',
                color: '#B91C1C',
                cursor: 'pointer',
              }}
            >
              Reject Edit
            </button>
            <button
              type="button"
              aria-label={`Accept suggested edit on ${block.id}`}
              onClick={() => void onAcceptEdit?.(pendingEdit.id)}
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                padding: '6px 14px',
                borderRadius: '6px',
                border: '1px solid #15803D',
                backgroundColor: '#15803D',
                color: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              Accept Edit
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

            const html = renderMarkdownWithMath(segment.content);
            return (
              <div
                key={index}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
          {block.id === 'blk_00' && resolvedPrerequisites.length > 0 && (
            <div
              data-testid="prerequisite-chips-bar"
              aria-label="Prerequisite Chips"
              style={{
                marginTop: '16px',
                paddingTop: '12px',
                borderTop: '1px solid #E4DFD7',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontFamily: "'Inter', system-ui, sans-serif",
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
                Interactive Prerequisites
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {resolvedPrerequisites.map((topic) => {
                  const status: TopicFamiliarity =
                    learnerProfile?.topics?.[topic] ?? 'unseen';
                  const isKnown = status === 'known';
                  return (
                    <div
                      key={topic}
                      data-testid={`prereq-chip-${topic}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: isKnown
                          ? '1px solid #15803D'
                          : '1px solid #E4DFD7',
                        backgroundColor: isKnown ? '#DCFCE7' : '#FAF8F5',
                        fontSize: '12px',
                        color: '#18181B',
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{topic}</span>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: '11px',
                          color: isKnown ? '#15803D' : '#65635E',
                        }}
                      >
                        {status}
                      </span>
                      <button
                        type="button"
                        aria-label={
                          isKnown
                            ? `Unmark ${topic} as known`
                            : `Mark ${topic} as known`
                        }
                        onClick={() =>
                          void onTogglePrerequisiteKnown?.(
                            topic,
                            isKnown ? 'unseen' : 'known'
                          )
                        }
                        style={{
                          ...actionBtnStyle,
                          backgroundColor: isKnown ? '#15803D' : '#FFFFFF',
                          color: isKnown ? '#FFFFFF' : '#18181B',
                          borderColor: isKnown ? '#15803D' : '#E4DFD7',
                        }}
                      >
                        ✓ I know this
                      </button>
                      <button
                        type="button"
                        aria-label={`Seed prerequisite ${topic}`}
                        disabled={isLocked || Boolean(seedingPrerequisiteTopic)}
                        onClick={() => void onSeedPrerequisite?.(topic)}
                        style={{
                          ...actionBtnStyle,
                          backgroundColor: '#FFFFFF',
                          color: '#1D4ED8',
                          borderColor: '#1D4ED8',
                          opacity:
                            isLocked || Boolean(seedingPrerequisiteTopic)
                              ? 0.5
                              : 1,
                          cursor:
                            isLocked || Boolean(seedingPrerequisiteTopic)
                              ? 'not-allowed'
                              : 'pointer',
                        }}
                      >
                        {seedingPrerequisiteTopic === topic
                          ? 'Seeding...'
                          : '↳ Seed Prerequisite'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {childDocuments.map((childDoc) => (
            <SubDocLinkCard
              key={childDoc.id}
              childDoc={childDoc}
              onSelectDocument={onSelectDocument}
            />
          ))}
        </div>
      )}

      {isChatOpen && (
        <InlineChatDrawer
          blockId={block.id}
          messages={chatMessages}
          isSending={isSendingChat}
          isIntegrating={isIntegratingChat}
          isBranching={isBranchingChat}
          error={chatError}
          onSendMessage={(msg) => void onSendChatMessage?.(block.id, msg)}
          onIntegrate={() => void onIntegrateChat?.(block.id)}
          onBranch={() => void onBranchChat?.(block.id)}
          onDiscard={() => void onDiscardChat?.(block.id)}
        />
      )}
    </article>
  );
}

