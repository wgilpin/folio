import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;

export interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({
  code,
}: MermaidDiagramProps): React.ReactElement {
  const rawId = useId();
  const diagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'strict',
          });
          mermaidInitialized = true;
        }
        const result = await mermaid.render(diagramId, code);
        if (!cancelled && result?.svg) {
          setSvg(result.svg);
        }
      } catch {
        if (!cancelled) {
          setSvg(null);
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, diagramId]);

  return (
    <div
      data-testid="mermaid-diagram"
      style={{
        backgroundColor: '#F3EFEA',
        border: '1px solid #E4DFD7',
        borderRadius: '6px',
        padding: '16px',
        margin: '16px 0',
        overflowX: 'auto',
      }}
    >
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <pre
          style={{
            margin: 0,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13px',
            color: '#18181B',
            whiteSpace: 'pre-wrap',
          }}
        >
          {code}
        </pre>
      )}
    </div>
  );
}
