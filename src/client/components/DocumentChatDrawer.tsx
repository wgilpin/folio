import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../shared/schema.js';
import { renderMarkdownWithMath } from './ConceptBlockCard.js';

export interface DocumentChatDrawerProps {
  documentTitle: string;
  isOpen: boolean;
  messages: ChatMessage[];
  isSending?: boolean;
  isIntegrating?: boolean;
  isBranching?: boolean;
  isReviewing?: boolean;
  isChatLocked?: boolean;
  error?: string | null;
  onToggleOpen: () => void;
  onSendMessage: (message: string) => Promise<void> | void;
  onIntegrate: () => Promise<void> | void;
  onBranch: () => Promise<void> | void;
  onDiscard: () => Promise<void> | void;
  onRunAdversarialReview?: () => Promise<void> | void;
}

export function DocumentChatDrawer({
  documentTitle,
  isOpen,
  messages,
  isSending = false,
  isIntegrating = false,
  isBranching = false,
  isReviewing = false,
  isChatLocked = false,
  error = null,
  onToggleOpen,
  onSendMessage,
  onIntegrate,
  onBranch,
  onDiscard,
  onRunAdversarialReview,
}: DocumentChatDrawerProps): React.ReactElement {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  const busy = isSending || isIntegrating || isBranching || isReviewing;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy || isChatLocked) {
      return;
    }
    setInput('');
    await onSendMessage(trimmed);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <aside
      aria-label="Document Chat Interface"
      data-testid="document-chat-container"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 50,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {!isOpen ? (
        <button
          type="button"
          aria-label="Ask Notebook"
          aria-expanded={false}
          data-testid="ask-notebook-fab"
          disabled={isChatLocked}
          title={
            isChatLocked
              ? 'Resolve pending suggested edits first'
              : 'Ask a question about this notebook'
          }
          onClick={onToggleOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: isChatLocked ? '#A1A1AA' : '#1D4ED8',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '28px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 500,
            cursor: isChatLocked ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 16px rgba(29, 78, 216, 0.35)',
            transition: 'all 0.15s ease',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Ask Notebook</span>
          {messages.length > 0 && (
            <span
              style={{
                backgroundColor: '#FFFFFF',
                color: '#1D4ED8',
                borderRadius: '10px',
                padding: '1px 6px',
                fontSize: '11px',
                fontWeight: 700,
                marginLeft: '4px',
              }}
            >
              {messages.length}
            </span>
          )}
        </button>
      ) : (
        <section
          aria-label="Ask Notebook Drawer"
          data-testid="document-chat-drawer"
          style={{
            width: '440px',
            maxWidth: 'calc(100vw - 32px)',
            height: '560px',
            maxHeight: 'calc(100vh - 48px)',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DFD7',
            borderRadius: '12px',
            boxShadow: '0 12px 36px rgba(24, 24, 27, 0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid #E4DFD7',
              backgroundColor: '#F3EFEA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0, flex: 1, marginRight: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '2px',
                }}
              >
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#18181B',
                  }}
                >
                  Ask Notebook
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    backgroundColor: '#DBEAFE',
                    color: '#1D4ED8',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  Full Scope
                </span>
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#65635E',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={documentTitle}
              >
                {documentTitle}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                aria-label="Run Adversarial Review in Ask Notebook"
                data-testid="drawer-doc-adversarial-review-btn"
                disabled={busy || isChatLocked}
                onClick={() => void onRunAdversarialReview?.()}
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '11px',
                  fontWeight: 500,
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #F59E0B',
                  backgroundColor: '#FEF3C7',
                  color: '#B45309',
                  cursor: busy || isChatLocked ? 'not-allowed' : 'pointer',
                  opacity: busy || isChatLocked ? 0.5 : 1,
                }}
              >
                {isReviewing ? 'Auditing...' : 'Adversarial Review'}
              </button>

              <button
                type="button"
                aria-label="Close Ask Notebook drawer"
                data-testid="close-document-chat"
                onClick={onToggleOpen}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#65635E',
                  fontSize: '18px',
                  lineHeight: 1,
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '4px',
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              backgroundColor: '#FAF8F5',
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  margin: 'auto',
                  textAlign: 'center',
                  color: '#65635E',
                  fontSize: '13px',
                  maxWidth: '300px',
                  lineHeight: 1.5,
                }}
              >
                <p style={{ marginTop: 0, marginBottom: '8px', fontWeight: 500 }}>
                  Ask questions across this entire notebook.
                </p>
                <p style={{ margin: 0, fontSize: '12px' }}>
                  Ask holistic questions, request new angles, or explore topics not
                  tied to a single cell. You can then <strong>Integrate</strong>{' '}
                  to append new concept blocks, <strong>Branch Doc</strong> into a
                  dedicated deep dive, or <strong>Discard</strong>.
                </p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    backgroundColor: msg.role === 'user' ? '#F3EFEA' : '#FFFFFF',
                    border: '1px solid #E4DFD7',
                    fontSize: '13px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: '#65635E',
                      marginBottom: '4px',
                    }}
                  >
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  {msg.role === 'user' ? (
                    <div style={{ lineHeight: 1.5, color: '#18181B' }}>
                      {msg.content}
                    </div>
                  ) : (
                    <div
                      className="markdown-content"
                      style={{
                        lineHeight: 1.55,
                        minWidth: 0,
                        maxWidth: '100%',
                        overflowWrap: 'break-word',
                        wordBreak: 'break-word',
                      }}
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownWithMath(msg.content),
                      }}
                    />
                  )}
                </div>
              ))
            )}

            {error && (
              <div
                role="alert"
                style={{
                  backgroundColor: '#FEE2E2',
                  color: '#B91C1C',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Footer Controls */}
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid #E4DFD7',
              backgroundColor: '#FFFFFF',
            }}
          >
            <form
              onSubmit={(e) => void handleSubmit(e)}
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                aria-label="Question for notebook"
                placeholder="Ask about this notebook..."
                value={input}
                disabled={busy || isChatLocked}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '13px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #E4DFD7',
                  backgroundColor: '#FAF8F5',
                  color: '#18181B',
                }}
              />
              <button
                type="submit"
                disabled={busy || !input.trim() || isChatLocked}
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '13px',
                  fontWeight: 500,
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: '1px solid #1D4ED8',
                  backgroundColor: '#1D4ED8',
                  color: '#FFFFFF',
                  cursor:
                    busy || !input.trim() || isChatLocked
                      ? 'not-allowed'
                      : 'pointer',
                  opacity: busy || !input.trim() || isChatLocked ? 0.6 : 1,
                }}
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </form>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  aria-label="Integrate notebook chat into document"
                  disabled={busy || messages.length === 0 || isChatLocked}
                  onClick={() => void onIntegrate()}
                  title="Append synthesized concept block(s) to this notebook"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #1D4ED8',
                    backgroundColor: '#1D4ED8',
                    color: '#FFFFFF',
                    cursor:
                      busy || messages.length === 0 || isChatLocked
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      busy || messages.length === 0 || isChatLocked ? 0.5 : 1,
                  }}
                >
                  {isIntegrating ? 'Integrating...' : 'Integrate'}
                </button>

                <button
                  type="button"
                  aria-label="Branch notebook chat into sub-document"
                  disabled={busy || messages.length === 0 || isChatLocked}
                  onClick={() => void onBranch()}
                  title="Branch a new child deep dive from this discussion"
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    fontSize: '12px',
                    fontWeight: 500,
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #1D4ED8',
                    backgroundColor: '#FAF8F5',
                    color: '#1D4ED8',
                    cursor:
                      busy || messages.length === 0 || isChatLocked
                        ? 'not-allowed'
                        : 'pointer',
                    opacity:
                      busy || messages.length === 0 || isChatLocked ? 0.5 : 1,
                  }}
                >
                  {isBranching ? 'Branching...' : 'Branch Doc'}
                </button>
              </div>

              <button
                type="button"
                aria-label="Discard notebook chat"
                disabled={busy}
                onClick={() => void onDiscard()}
                style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: '12px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid #E4DFD7',
                  backgroundColor: '#FAF8F5',
                  color: '#65635E',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Discard
              </button>
            </div>
          </div>
        </section>
      )}
    </aside>
  );
}
