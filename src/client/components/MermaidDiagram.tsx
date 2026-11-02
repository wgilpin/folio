import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

let mermaidInitialized = false;
let renderSequence = 0;

function ensureSvgBBoxSupport(): void {
  if (typeof SVGElement === 'undefined') {
    return;
  }
  const proto = SVGElement.prototype as SVGElement & {
    getBBox?: () => { x: number; y: number; width: number; height: number };
    getComputedTextLength?: () => number;
  };
  if (typeof proto.getBBox !== 'function') {
    proto.getBBox = function getBBoxFallback() {
      const text = (this.textContent ?? '').trim();
      return {
        x: 0,
        y: 0,
        width: Math.max(40, text.length * 8),
        height: 24,
      };
    };
  }
  if (typeof proto.getComputedTextLength !== 'function') {
    proto.getComputedTextLength = function getComputedTextLengthFallback() {
      const text = (this.textContent ?? '').trim();
      return Math.max(20, text.length * 8);
    };
  }
}

export function sanitizeMermaidCode(code: string): string {
  const trimmed = code.trim();
  const isFlowchart = /^(?:flowchart|graph)\b/i.test(trimmed);
  if (!isFlowchart) {
    return trimmed;
  }

  let subgraphIndex = 0;

  return trimmed
    .split(/\r?\n/)
    .map((line) => {
      const subgraphMatch = line.match(/^(\s*subgraph\s+)(.+?)\s*$/);
      if (subgraphMatch) {
        const [, prefix, rawRest] = subgraphMatch;
        const rest = rawRest.trim();

        // Already valid: subgraph id["Label"]
        if (/^[A-Za-z0-9_-]+\s*\["[^"]*"\]$/.test(rest)) {
          return line;
        }

        // Valid simple single-token ID without spaces or special characters
        if (/^[A-Za-z0-9_-]+$/.test(rest)) {
          return line;
        }

        // subgraph id[Unquoted Label] -> subgraph id["Unquoted Label"]
        const idBracketMatch = rest.match(/^([A-Za-z0-9_-]+)\s*\[([^[\]]+)\]$/);
        if (idBracketMatch) {
          const [, id, label] = idBracketMatch;
          const cleanLabel = label.trim().replace(/^["']|["']$/g, '').replace(/"/g, "'");
          return `${prefix}${id}["${cleanLabel}"]`;
        }

        // e.g. subgraph Forward Proxy [Forward Proxy Context] or subgraph Recurrent Processing: O(N) Steps
        let label = rest;
        const trailingBracketMatch = rest.match(/^(.+?)\s*\[([^[\]]+)\]$/);
        if (trailingBracketMatch && /\s/.test(trailingBracketMatch[2])) {
          label = trailingBracketMatch[2];
        }

        const cleanLabel = label.trim().replace(/^["']|["']$/g, '').replace(/"/g, "'");
        subgraphIndex += 1;
        return `${prefix}subgraph_${subgraphIndex}["${cleanLabel}"]`;
      }

      if (/^\s*(?:end|direction\s+|style\s+|linkStyle\s+|classDef\s+|class\s+|click\s+|%%)/.test(line)) {
        return line;
      }

      // Quote unquoted rectangular node labels: id[label] -> id["label"]
      let updated = line.replace(
        /\b([A-Za-z0-9_.-]+)\[(?![\["(\/\\])([^\]\n]+)\]/g,
        (_, id: string, label: string) => {
          const cleanLabel = label.trim().replace(/"/g, "'");
          return `${id}["${cleanLabel}"]`;
        }
      );

      // Quote unquoted decision/rhombus node labels: id{label} -> id{"label"}
      updated = updated.replace(
        /\b([A-Za-z0-9_.-]+)\{(?![{"])([^\}\n]+)\}/g,
        (_, id: string, label: string) => {
          const cleanLabel = label.trim().replace(/"/g, "'");
          return `${id}{"${cleanLabel}"}`;
        }
      );

      return updated;
    })
    .join('\n');
}

export interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({
  code,
}: MermaidDiagramProps): React.ReactElement {
  const rawId = useId();
  const baseDiagramId = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderSequence += 1;
    const diagramId = `${baseDiagramId}-${renderSequence}`;

    async function renderDiagram() {
      try {
        ensureSvgBBoxSupport();
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'strict',
          });
          mermaidInitialized = true;
        }
        const normalizedCode = sanitizeMermaidCode(code);
        const result = await mermaid.render(diagramId, normalizedCode);
        if (!cancelled && result?.svg) {
          setSvg(result.svg);
        }
      } catch {
        const orphan = globalThis.document?.getElementById(`d${diagramId}`);
        orphan?.remove();
        if (!cancelled) {
          setSvg(null);
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, baseDiagramId]);

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
