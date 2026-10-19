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

export function isPrerequisiteBlock(block: ConceptBlock): boolean {
  return (
    block.id === 'blk_00' ||
    /^#{1,3}\s*(?:0\b|prerequisites\b)/im.test(block.markdown)
  );
}

function extractBulletTopic(rawLine: string): string | null {
  const line = rawLine.trim();
  const bulletMatch = line.match(/^[-*]\s+(.+)$/);
  if (!bulletMatch) return null;

  const content = bulletMatch[1]
    .replace(/\[→\s*Deep dive:.*?\]\(.*?\)/g, '')
    .trim();
  if (!content) return null;

  let candidate: string | null = null;
  const boldMatch =
    content.match(/^\*\*(.+?)\*\*\s*(?:[:—–-].*|$)/) ??
    content.match(/^\*\*(.+?[:—–-])\*\*(?:\s+.*|$)/);
  if (boldMatch) {
    candidate = boldMatch[1].replace(/[:—–-]+\s*$/, '').trim();
  } else {
    const colonMatch = content.match(/^([^:(\n—–-]+?)\s*[:—–-]\s+.+$/);
    if (colonMatch) {
      candidate = colonMatch[1].replace(/^[*`]+|[*`]+$/g, '').trim();
    } else if (content.length <= 60) {
      candidate = content.replace(/^[*`]+|[*`]+$/g, '').trim();
    }
  }

  if (
    candidate &&
    candidate.length > 1 &&
    !candidate.startsWith('$') &&
    !candidate.startsWith('\\')
  ) {
    return candidate;
  }

  return null;
}

export function extractPrerequisitesFromBlock0(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const topics: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const candidate = extractBulletTopic(rawLine);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      topics.push(candidate);
    }
  }

  return topics;
}

function normalizePhraseForOverlap(text: string): string {
  return text
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^#+\s*/, '')
    .replace(/^\d+(?:\.\d+)*\.?\s+/, '')
    .replace(/[*_`~]/g, '')
    .replace(/[:—–-]+$/, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isTopicCoveredByBodyOrTitle(
  topic: string,
  bodyHeadings: string[],
  docTitle?: string
): boolean {
  const cleanTopic = normalizePhraseForOverlap(topic).replace(/^the\s+/, '');
  if (cleanTopic.length < 4) {
    return false;
  }

  if (docTitle) {
    const cleanDocTitle = normalizePhraseForOverlap(
      docTitle.split(':')[0] ?? docTitle
    ).replace(/^the\s+/, '');
    if (cleanDocTitle.length >= 4 && cleanDocTitle === cleanTopic) {
      return true;
    }
  }

  for (const rawHeading of bodyHeadings) {
    const cleanHeading = normalizePhraseForOverlap(rawHeading);
    if (!cleanHeading) continue;

    // Split heading into its standalone subject clauses (e.g. "2. Russian Doctrine: Epistemic Chaos, Reflexive Control, and Domestic Fracture")
    // so we match when a section is dedicated to the topic, not when a heading merely says "Applying X to Y" or "From X to Y".
    const clauses = cleanHeading
      .split(/\s*(?:[:;—–-]|\band\b|,)\s*/)
      .map((clause) => clause.replace(/^the\s+/, '').trim())
      .filter((clause) => clause.length > 0);

    if (clauses.some((clause) => clause === cleanTopic)) {
      return true;
    }
  }

  return false;
}

export function sanitizePrerequisitesAndBlock0(
  blocks: ConceptBlock[],
  explicitPrerequisites?: string[],
  options?: { docTitle?: string; plannedToc?: string[] }
): { blocks: ConceptBlock[]; prerequisites: string[] | undefined } {
  if (blocks.length === 0) {
    return { blocks, prerequisites: explicitPrerequisites };
  }

  const bodyBlocks = isPrerequisiteBlock(blocks[0]) ? blocks.slice(1) : blocks;
  const bodyTocItems = extractToc(bodyBlocks);
  const bodyHeadings = [
    ...bodyTocItems.map((item) => item.text),
    ...(options?.plannedToc ?? []),
  ];

  const filteredPrerequisites = explicitPrerequisites
    ? explicitPrerequisites.filter(
        (topic) =>
          !isTopicCoveredByBodyOrTitle(topic, bodyHeadings, options?.docTitle)
      )
    : undefined;

  if (!isPrerequisiteBlock(blocks[0]) || bodyHeadings.length === 0) {
    return { blocks, prerequisites: filteredPrerequisites };
  }

  const block0Lines = blocks[0].markdown.replace(/\r\n/g, '\n').split('\n');
  const keptLines: string[] = [];

  for (const line of block0Lines) {
    const bulletTopic = extractBulletTopic(line);
    if (
      bulletTopic &&
      isTopicCoveredByBodyOrTitle(bulletTopic, bodyHeadings, options?.docTitle)
    ) {
      continue;
    }
    keptLines.push(line);
  }

  const cleanedBlock0Markdown = keptLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const updatedBlocks: ConceptBlock[] = [
    { ...blocks[0], markdown: cleanedBlock0Markdown },
    ...blocks.slice(1),
  ];

  return {
    blocks: updatedBlocks,
    prerequisites: filteredPrerequisites,
  };
}

export function splitMultiSectionMarkdown(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split('\n');
  let activeFence: string | null = null;
  const taggedLines: { text: string; outsideFence: boolean }[] = [];

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      if (activeFence === null) {
        activeFence = fence;
        taggedLines.push({ text: line, outsideFence: false });
        continue;
      } else if (
        line.trimEnd().startsWith(activeFence[0].repeat(activeFence.length)) &&
        line.trim() === fence
      ) {
        activeFence = null;
        taggedLines.push({ text: line, outsideFence: false });
        continue;
      }
    }
    taggedLines.push({ text: line, outsideFence: activeFence === null });
  }

  // 1. Check for 2 or more top-level `## ` headings outside fenced code blocks
  const h2Indices: number[] = [];
  for (let i = 0; i < taggedLines.length; i++) {
    if (taggedLines[i].outsideFence && /^##\s+/.test(taggedLines[i].text)) {
      h2Indices.push(i);
    }
  }

  if (h2Indices.length >= 2) {
    const sections: string[] = [];
    const leading = taggedLines
      .slice(0, h2Indices[0])
      .map((l) => l.text)
      .join('\n')
      .trim();

    for (let i = 0; i < h2Indices.length; i++) {
      const start = h2Indices[i];
      const end =
        i < h2Indices.length - 1 ? h2Indices[i + 1] : taggedLines.length;
      const sectionText = taggedLines
        .slice(start, end)
        .map((l) => l.text)
        .join('\n')
        .trim();
      if (sectionText) {
        sections.push(sectionText);
      }
    }

    if (leading) {
      if (/^#\s+[^\n]+$/.test(leading)) {
        if (sections.length > 0) {
          sections[0] = `${leading}\n\n${sections[0]}`;
        } else {
          sections.push(leading);
        }
      } else {
        sections.unshift(leading);
      }
    }

    return sections;
  }

  // 2. Check for 2 or more `### ` headings outside fenced code blocks
  const h3Indices: number[] = [];
  for (let i = 0; i < taggedLines.length; i++) {
    if (taggedLines[i].outsideFence && /^###\s+/.test(taggedLines[i].text)) {
      h3Indices.push(i);
    }
  }

  if (h3Indices.length >= 2) {
    const sections: string[] = [];
    const leading = taggedLines
      .slice(0, h3Indices[0])
      .map((l) => l.text)
      .join('\n')
      .trim();

    for (let i = 0; i < h3Indices.length; i++) {
      const start = h3Indices[i];
      const end =
        i < h3Indices.length - 1 ? h3Indices[i + 1] : taggedLines.length;
      const sectionLines = taggedLines.slice(start, end).map((l) => l.text);
      if (sectionLines.length > 0) {
        // Promote `### ` to `## `
        sectionLines[0] = sectionLines[0].replace(/^###\s+/, '## ');
        const sectionText = sectionLines.join('\n').trim();
        if (sectionText) {
          sections.push(sectionText);
        }
      }
    }

    if (leading) {
      if (/^#{1,2}\s+[^\n]+$/.test(leading)) {
        if (sections.length > 0) {
          sections[0] = `${leading}\n\n${sections[0]}`;
        } else {
          sections.push(leading);
        }
      } else {
        sections.unshift(leading);
      }
    }

    return sections;
  }

  // 3. Check for 2 or more numbered bold topic headers (only when no ## or ### headings exist)
  if (h2Indices.length === 0 && h3Indices.length === 0) {
    const boldIndices: number[] = [];
    for (let i = 0; i < taggedLines.length; i++) {
      if (
        taggedLines[i].outsideFence &&
        /^(?:\d+\.\s+\*\*[^*]+\*\*|\*\*[^*]+\*\*\s*[:—–-])/.test(
          taggedLines[i].text.trim()
        )
      ) {
        boldIndices.push(i);
      }
    }

    if (boldIndices.length >= 2) {
      const sections: string[] = [];
      const leading = taggedLines
        .slice(0, boldIndices[0])
        .map((l) => l.text)
        .join('\n')
        .trim();

      for (let i = 0; i < boldIndices.length; i++) {
        const start = boldIndices[i];
        const end =
          i < boldIndices.length - 1 ? boldIndices[i + 1] : taggedLines.length;
        const sectionLines = taggedLines.slice(start, end).map((l) => l.text);
        if (sectionLines.length > 0) {
          const firstLine = sectionLines[0].trim();
          const match = firstLine.match(
            /^(?:(\d+\.)\s+)?\*\*([^*]+)\*\*(?:\s*[:—–-]\s*(.*))?$/
          );
          if (match) {
            const numPrefix = match[1] ? `${match[1]} ` : '';
            const topicTitle = match[2].trim();
            const remainder = match[3]?.trim();
            const promotedHeading = `## ${numPrefix}${topicTitle}`;
            sectionLines[0] = remainder
              ? `${promotedHeading}\n\n${remainder}`
              : promotedHeading;
          }
          const sectionText = sectionLines.join('\n').trim();
          if (sectionText) {
            sections.push(sectionText);
          }
        }
      }

      if (leading) {
        if (/^#{1,2}\s+[^\n]+$/.test(leading)) {
          if (sections.length > 0) {
            sections[0] = `${leading}\n\n${sections[0]}`;
          } else {
            sections.push(leading);
          }
        } else {
          sections.unshift(leading);
        }
      }

      return sections;
    }
  }

  return [normalized];
}

