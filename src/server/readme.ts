import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ConceptBlock, DocumentNode } from '../shared/schema.js';
import {
  extractToc,
  isPrerequisiteBlock,
  parseMarkdownBlocks,
} from './markdown.js';

export const WORKSPACE_README_FILENAME = 'README.md';

export function isReservedReadmeSlug(slugOrFilename?: string): boolean {
  if (!slugOrFilename) return false;
  const cleaned = slugOrFilename.replace(/\.md$/i, '').trim().toLowerCase();
  return cleaned === 'readme';
}

async function loadDocumentBlocksForReadme(
  workspaceDir: string,
  doc: DocumentNode,
  inMemoryBlocks?: Record<string, ConceptBlock[]>
): Promise<ConceptBlock[]> {
  if (inMemoryBlocks && inMemoryBlocks[doc.id]) {
    return inMemoryBlocks[doc.id];
  }
  try {
    const raw = await fs.readFile(
      path.join(workspaceDir, doc.filename),
      'utf-8'
    );
    return parseMarkdownBlocks(raw);
  } catch {
    return [];
  }
}

function extractBodySectionHeadings(
  doc: DocumentNode,
  blocks: ConceptBlock[]
): string[] {
  const bodyBlocks =
    blocks.length > 0 && isPrerequisiteBlock(blocks[0])
      ? blocks.slice(1)
      : blocks;
  const toc = extractToc(bodyBlocks);
  return toc
    .filter(
      (item) =>
        !(
          item.level === 1 &&
          item.text.trim().toLowerCase() === doc.title.trim().toLowerCase()
        )
    )
    .map((item) => item.text.trim())
    .filter((text) => text.length > 0);
}

export async function generateWorkspaceReadmeMarkdown(
  workspaceDir: string,
  documents: Record<string, DocumentNode>,
  inMemoryBlocks?: Record<string, ConceptBlock[]>
): Promise<string> {
  const lines: string[] = [
    '# Folio Library Index',
    '',
    'Auto-generated hierarchical index of Concept Block documents in this workspace.',
    '',
  ];

  const allDocs = Object.values(documents);
  if (allDocs.length === 0) {
    lines.push('_No documents in this workspace yet._', '');
    return lines.join('\n');
  }

  lines.push('## Documents', '');

  const visited = new Set<string>();

  const renderNode = async (doc: DocumentNode, depth: number): Promise<void> => {
    if (visited.has(doc.id)) return;
    visited.add(doc.id);

    const indent = '  '.repeat(depth);
    lines.push(`${indent}- **[${doc.title}](${doc.filename})**`);

    if (doc.prerequisites && doc.prerequisites.length > 0) {
      const formattedPrereqs = doc.prerequisites.map((topic) => {
        const linkedId = doc.prerequisiteDocIds?.[topic];
        const linkedDoc = linkedId ? documents[linkedId] : undefined;
        return linkedDoc ? `[${topic}](${linkedDoc.filename})` : topic;
      });
      lines.push(`${indent}  - _Prerequisites:_ ${formattedPrereqs.join(', ')}`);
    }

    const blocks = await loadDocumentBlocksForReadme(
      workspaceDir,
      doc,
      inMemoryBlocks
    );
    const sectionHeadings = extractBodySectionHeadings(doc, blocks);
    if (sectionHeadings.length > 0) {
      lines.push(`${indent}  - _Sections:_ ${sectionHeadings.join(' · ')}`);
    }

    for (const childId of doc.childDocIds) {
      const childDoc = documents[childId];
      if (childDoc && !visited.has(childDoc.id)) {
        await renderNode(childDoc, depth + 1);
      }
    }
  };

  const rootDocs = allDocs.filter(
    (doc) => doc.parentId === null || !documents[doc.parentId]
  );

  for (const rootDoc of rootDocs) {
    await renderNode(rootDoc, 0);
  }

  for (const doc of allDocs) {
    if (!visited.has(doc.id)) {
      await renderNode(doc, 0);
    }
  }

  lines.push('');
  return lines.join('\n');
}

export async function writeWorkspaceReadme(
  workspaceDir: string,
  documents: Record<string, DocumentNode>,
  inMemoryBlocks?: Record<string, ConceptBlock[]>
): Promise<void> {
  await fs.mkdir(workspaceDir, { recursive: true });
  const markdown = await generateWorkspaceReadmeMarkdown(
    workspaceDir,
    documents,
    inMemoryBlocks
  );
  await fs.writeFile(
    path.join(workspaceDir, WORKSPACE_README_FILENAME),
    markdown,
    'utf-8'
  );
}
