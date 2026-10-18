import React from 'react';
import type { DocumentNode, TocItem } from '../../shared/schema.js';

export interface SidebarTreeProps {
  document: DocumentNode | null;
  toc: TocItem[];
  modelId: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenSeedModal: () => void;
}

export function SidebarTree({
  document,
  toc,
  modelId,
  collapsed,
  onToggleCollapse,
  onOpenSeedModal,
}: SidebarTreeProps): React.ReactElement {
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
          {document ? (
            <div
              style={{
                padding: '8px 12px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #E4DFD7',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                color: '#18181B',
              }}
            >
              {document.title}
            </div>
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
