import React, { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../shared/schema.js';
import { renderMarkdownWithMath } from './ConceptBlockCard.js';

export interface InlineChatDrawerProps {
  blockId: string;
  messages: ChatMessage[];
  isSending?: boolean;
  isIntegrating?: boolean;
  isBranching?: boolean;
  error?: string | null;
  onSendMessage: (message: string) => Promise<void> | void;
  onIntegrate?: () => Promise<void> | void;
  onBranch?: () => Promise<void> | void;
  onDiscard: () => Promise<void> | void;
}

export function InlineChatDrawer({
  blockId,
  messages,
  isSending = false,
  isIntegrating = false,
  isBranching = false,
  error = null,
  onSendMessage,
  onIntegrate,
  onBranch,
  onDiscard,
}: InlineChatDrawerProps): React.ReactElement {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const busy = isSending || isIntegrating || isBranching;

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || busy) {
      return;
    }
    setInput('');
    await onSendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <section
      aria-label={`Inline chat for ${blockId}`}
      data-testid={`inline-chat-drawer-${blockId}`}
      style={{
        marginTop: '20px',
        paddingTop: '16px',
        borderTop: '1px solid #E4DFD7',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '14px',
        color: '#18181B',
      }}
    >
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#1D4ED8',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Ephemeral Cell Chat · {blockId}</span>
        <span style={{ color: '#65635E', fontWeight: 400 }}>
          Context: ToC + [N-1, N, N+1]
        </span>
      </div>

      {messages.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          {messages.map((msg, idx) => (
            <div
              key={idx}
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: msg.role === 'user' ? '#F3EFEA' : '#FAF8F5',
                border: '1px solid #E4DFD7',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
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
                <div style={{ lineHeight: 1.5 }}>{msg.content}</div>
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
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEE2E2',
            color: '#B91C1C',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '13px',
            marginBottom: '12px',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <input
          ref={inputRef}
          autoFocus
          type="text"
          aria-label={`Question for ${blockId}`}
          placeholder="Ask a question about this cell..."
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '14px',
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #E4DFD7',
            backgroundColor: '#FAF8F5',
            color: '#18181B',
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '13px',
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #1D4ED8',
            backgroundColor: '#1D4ED8',
            color: '#FFFFFF',
            cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !input.trim() ? 0.6 : 1,
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            aria-label={`Integrate chat into ${blockId}`}
            disabled={busy || messages.length === 0}
            onClick={() => void onIntegrate?.()}
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
                busy || messages.length === 0 ? 'not-allowed' : 'pointer',
              opacity: busy || messages.length === 0 ? 0.5 : 1,
            }}
          >
            {isIntegrating ? 'Integrating...' : 'Integrate'}
          </button>

          <button
            type="button"
            aria-label={`Branch chat from ${blockId} into sub-document`}
            disabled={busy || messages.length === 0}
            onClick={() => void onBranch?.()}
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
                busy || messages.length === 0 ? 'not-allowed' : 'pointer',
              opacity: busy || messages.length === 0 ? 0.5 : 1,
            }}
          >
            {isBranching ? 'Branching sub-document...' : 'Branch Doc'}
          </button>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void onDiscard()}
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '12px',
            padding: '6px 12px',
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
    </section>
  );
}
