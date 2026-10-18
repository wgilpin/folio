import React from 'react';
import type { PendingSuggestedEdit } from '../../shared/schema.js';

export interface GateBannerProps {
  pendingEdits: PendingSuggestedEdit[];
  onJumpToNextDiff?: () => void;
}

export function GateBanner({
  pendingEdits,
  onJumpToNextDiff,
}: GateBannerProps): React.ReactElement | null {
  if (pendingEdits.length === 0) {
    return null;
  }

  const count = pendingEdits.length;
  const countLabel =
    count === 1
      ? '1 pending suggested edit'
      : `${count} pending suggested edits`;

  const handleJump = () => {
    if (onJumpToNextDiff) {
      onJumpToNextDiff();
      return;
    }
    const firstBlockId = pendingEdits[0]?.blockId;
    if (firstBlockId) {
      const el = document.getElementById(`block-${firstBlockId}`);
      el?.scrollIntoView?.({ behavior: 'smooth' });
    }
  };

  return (
    <aside
      role="status"
      data-testid="gate-banner"
      style={{
        position: 'sticky',
        top: '16px',
        zIndex: 10,
        backgroundColor: '#FEF3C7',
        border: '1px solid #F59E0B',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: '13px',
        color: '#B45309',
        boxShadow: '0 2px 6px rgba(180, 83, 9, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#F59E0B',
            color: '#FFFFFF',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          !
        </span>
        <span style={{ fontWeight: 600 }}>{countLabel}</span>
      </div>

      <button
        type="button"
        aria-label="Jump to next diff"
        onClick={handleJump}
        style={{
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '12px',
          fontWeight: 500,
          padding: '6px 12px',
          borderRadius: '6px',
          border: '1px solid #F59E0B',
          backgroundColor: '#FFFFFF',
          color: '#B45309',
          cursor: 'pointer',
        }}
      >
        Jump to next diff
      </button>
    </aside>
  );
}
