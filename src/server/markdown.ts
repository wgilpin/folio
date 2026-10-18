import type { ConceptBlock, TocItem } from '../shared/schema.js';

const BLOCK_MARKER_RE = /^<!--\s*folio:block\s+id="([^"]+)"\s*-->\s*$/;
const FENCE_RE = /^(`{3,}|~{3,})/;

export function generateBlockId(index?: number): string {
  if (typeof index === 'number') {
    return `blk_${String(index + 1).padStart(2, '0')}`;
  }
  return `blk_${Math.random().toString(36).slice(2, 10)}`;
}

export function parseMarkdownBlocks(markdown: string): ConceptBlock[] {
  const normalized = markdown.replace(/\r\n/g, '\n');
  if (!normalized.trim()) {
    return [];
  }

  const lines = normalized.split('\n');
  const hasMarkers = lines.some((line) => BLOCK_MARKER_RE.test(line));

  if (hasMarkers) {
    const blocks: ConceptBlock[] = [];
    let currentId: string | null = null;
    let currentLines: string[] = [];
    let leadingLines: string[] = [];
    const usedIds = new Set<string>();

    const nextUniqueId = (preferred?: string): string => {
      if (preferred && !usedIds.has(preferred)) {
        usedIds.add(preferred);
        return preferred;
      }
      let idx = blocks.length;
      let candidate = generateBlockId(idx);
      while (usedIds.has(candidate)) {
        idx += 1;
        candidate = generateBlockId(idx);
      }
      usedIds.add(candidate);
      return candidate;
    };

    for (const line of lines) {
      const match = line.match(BLOCK_MARKER_RE);
      if (match) {
        if (currentId === null && leadingLines.join('\n').trim()) {
          blocks.push({
            id: nextUniqueId(),
            markdown: leadingLines.join('\n').trim(),
          });
          leadingLines = [];
        } else if (currentId !== null) {
          blocks.push({
            id: currentId,
            markdown: currentLines.join('\n').trim(),
          });
        }
        currentId = nextUniqueId(match[1]);
        currentLines = [];
      } else if (currentId !== null) {
        currentLines.push(line);
      } else {
        leadingLines.push(line);
      }
    }

    if (currentId !== null) {
      blocks.push({
        id: currentId,
        markdown: currentLines.join('\n').trim(),
      });
    }

    return blocks;
  }

  // Fallback for unmarked external Markdown: split on top-level `## ` headings outside fenced code blocks
  const sections: string[][] = [];
  let currentSection: string[] = [];
  let activeFence: string | null = null;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (activeFence === null) {
        activeFence = fence;
      } else if (
        line.trimEnd().startsWith(activeFence[0].repeat(activeFence.length)) &&
        line.trim() === fence
      ) {
        activeFence = null;
      }
    }

    if (activeFence === null && line.startsWith('## ')) {
      if (currentSection.join('\n').trim().length > 0) {
        sections.push(currentSection);
      }
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  if (currentSection.join('\n').trim().length > 0) {
    sections.push(currentSection);
  }

  return sections.map((sectionLines, idx) => ({
    id: generateBlockId(idx),
    markdown: sectionLines.join('\n').trim(),
  }));
}

export function serializeMarkdownBlocks(blocks: ConceptBlock[]): string {
  if (blocks.length === 0) {
    return '';
  }

  return (
    blocks
      .map(
        (block) =>
          `<!-- folio:block id="${block.id}" -->\n${block.markdown.trim()}`
      )
      .join('\n\n') + '\n'
  );
}

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/;

export function extractToc(blocks: ConceptBlock[]): TocItem[] {
  const toc: TocItem[] = [];

  for (const block of blocks) {
    const lines = block.markdown.replace(/\r\n/g, '\n').split('\n');
    let activeFence: string | null = null;

    for (const line of lines) {
      const fenceMatch = line.match(FENCE_RE);
      if (fenceMatch) {
        const fence = fenceMatch[1];
        if (activeFence === null) {
          activeFence = fence;
        } else if (
          line.trimEnd().startsWith(activeFence[0].repeat(activeFence.length)) &&
          line.trim() === fence
        ) {
          activeFence = null;
        }
        continue;
      }

      if (activeFence === null) {
        const headingMatch = line.match(HEADING_RE);
        if (headingMatch) {
          const level = headingMatch[1].length as 1 | 2 | 3;
          const text = headingMatch[2].replace(/\s+#+\s*$/, '').trim();
          if (text) {
            toc.push({
              level,
              text,
              blockId: block.id,
            });
          }
        }
      }
    }
  }

  return toc;
}
