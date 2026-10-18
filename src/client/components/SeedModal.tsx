import React, { useState } from 'react';

export interface SeedModalProps {
  isSubmitting: boolean;
  error: string | null;
  onSeed: (prompt: string) => Promise<void>;
  onClose?: () => void;
  mode?: 'inline' | 'modal';
}

export function SeedModal({
  isSubmitting,
  error,
  onSeed,
  onClose,
  mode = 'inline',
}: SeedModalProps): React.ReactElement {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isSubmitting) {
      return;
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
        Seed a New Technical Notebook
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
        Enter a topic or physical/mathematical system to generate 4–8 initial
        Concept Blocks with prose and Mermaid diagrams.
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
          Topic Prompt
        </label>
        <input
          id="seed-topic-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter a topic (e.g., Hamiltonian Mechanics)"
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
