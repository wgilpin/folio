import React from 'react';
import { marked } from 'marked';
import type { ConceptBlock } from '../../shared/schema.js';
import { MermaidDiagram } from './MermaidDiagram.js';

export interface ConceptBlockCardProps {
  block: ConceptBlock;
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

export function ConceptBlockCard({
  block,
}: ConceptBlockCardProps): React.ReactElement {
  const segments = splitMarkdownSegments(block.markdown);

  return (
    <article
      id={`block-${block.id}`}
      data-testid={`concept-block-${block.id}`}
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E4DFD7',
        borderRadius: '8px',
        padding: '24px',
        marginBottom: '16px',
        boxShadow: 'none',
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
      </header>

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

          const html = marked.parse(segment.content, { async: false }) as string;
          return (
            <div
              key={index}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        })}
      </div>
    </article>
  );
}
