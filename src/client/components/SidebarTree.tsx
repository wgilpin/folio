import React from 'react';
import type { DocumentNode, TocItem } from '../../shared/schema.js';

export interface SidebarTreeProps {
  document: DocumentNode | null;
  documents?: Record<string, DocumentNode>;
  toc: TocItem[];
  modelId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSeedModal: () => void;
  onSelectDocument?: (docId: string) => void;
}

export function SidebarTree({
  document,
  documents = {},
  toc,
  modelId,
  collapsed,
  onToggleCollapse,
  onOpenSeedModal,
  onSelectDocument,
}: SidebarTreeProps): React.ReactElement {
  const allDocs = Object.values(documents);
  const rootDocs =
    allDocs.length > 0
      ? allDocs.filter((d) => d.parentId === null)
      : document
      ? [document]
      : [];

  const renderDocTree = (docNode: DocumentNode, depth: number): React.ReactElement => {
    const isActive = document?.id === docNode.id;
    const children = docNode.childDocIds
      .map((childId) => documents[childId])
      .filter((c): c is DocumentNode => Boolean(c));

    return (
      <li
        key={docNode.id}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        <button
          type="button"
          aria-label={`Open document ${docNode.title}`}
          onClick={() => onSelectDocument?.(docNode.id)}
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px 12px',
            paddingLeft: `${12 + depth * 14}px`,
            backgroundColor: isActive ? '#FFFFFF' : 'transparent',
            border: isActive ? '1px solid #E4DFD7' : '1px solid transparent',
            borderRadius: '6px',
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: '13px',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#18181B' : '#65635E',
            cursor: 'pointer',
            marginBottom: '4px',
          }}
        >
          {depth > 0 ? `↳ ${docNode.title}` : docNode.title}
        </button>
        {children.length > 0 && (
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
              + Seed
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

        <section style={{ marginBottom: '24px' }}>
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
            Document Tree
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
                    {item.text}
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
        }}
      >
        <div
          style={{
            fontSize: '12px',
            color: '#65635E',
            marginBottom: '4px',
          }}
        >
          Active Model (.env)
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            color: '#18181B',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4DFD7',
            borderRadius: '6px',
            padding: '4px 8px',
            wordBreak: 'break-all',
          }}
        >
          {modelId}
        </div>
      </footer>
    </nav>
  );
}
