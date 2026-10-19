import React from 'react';
import { getConciseTitle, type DocumentNode } from '../../shared/schema.js';

export interface SubDocLinkCardProps {
  childDoc: DocumentNode;
  onSelectDocument?: (docId: string) => void;
}

export function SubDocLinkCard({
  childDoc,
  onSelectDocument,
}: SubDocLinkCardProps): React.ReactElement {
  const navTitle = getConciseTitle(childDoc.title, childDoc.shortTitle);

  return (
    <div style={{ marginTop: '12px' }}>
      <button
        type="button"
        data-testid={`subdoc-link-card-${childDoc.id}`}
        aria-label={`Open sub-document ${navTitle}`}
        title={childDoc.title}
        onClick={() => onSelectDocument?.(childDoc.id)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          backgroundColor: '#FAF8F5',
          border: '1px solid #E4DFD7',
          borderRadius: '6px',
          fontFamily: "'Inter', system-ui, sans-serif",
          fontSize: '13px',
          fontWeight: 500,
          color: '#1D4ED8',
          cursor: 'pointer',
        }}
      >
        <span>→ Deep dive: {navTitle}</span>
      </button>
    </div>
  );
}
