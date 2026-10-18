import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  NotebookStateSchema,
  type ConceptBlock,
  type DocumentNode,
  type NotebookState,
  type TocItem,
} from '../shared/schema.js';
import {
  extractToc,
  generateBlockId,
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
} from './markdown.js';

export interface LoadedDocument {
  document: DocumentNode | null;
  blocks: ConceptBlock[];
  toc: TocItem[];
}

function splitMarkdownContent(markdown: string, offset?: number): [string, string] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim();
  if (
    typeof offset === 'number' &&
    offset > 0 &&
    offset < normalized.length
  ) {
    const first = normalized.slice(0, offset).trim();
    const second = normalized.slice(offset).trim();
    if (first && second) {
      return [first, second];
    }
  }

  // Split into paragraphs while keeping fenced code blocks intact
  const lines = normalized.split('\n');
  const paragraphs: string[] = [];
  let currentLines: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inFence = !inFence;
    }
    if (!inFence && line.trim() === '') {
      if (currentLines.length > 0) {
        paragraphs.push(currentLines.join('\n').trim());
        currentLines = [];
      }
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    paragraphs.push(currentLines.join('\n').trim());
  }

  if (paragraphs.length >= 2) {
    const mid = Math.ceil(paragraphs.length / 2);
    return [
      paragraphs.slice(0, mid).join('\n\n'),
      paragraphs.slice(mid).join('\n\n'),
    ];
  }

  if (lines.length >= 2) {
    const mid = Math.ceil(lines.length / 2);
    return [
      lines.slice(0, mid).join('\n').trim(),
      lines.slice(mid).join('\n').trim(),
    ];
  }

  const words = normalized.split(/\s+/);
  if (words.length >= 2) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  return [normalized, normalized];
}

export class WorkspaceStore {
  constructor(public readonly workspaceDir: string) {}

  private get sidecarDir(): string {
    return path.join(this.workspaceDir, '.folio');
  }

  private get sidecarPath(): string {
    return path.join(this.sidecarDir, 'notebook.json');
  }

  async loadState(): Promise<NotebookState> {
    try {
      const raw = await fs.readFile(this.sidecarPath, 'utf-8');
      return NotebookStateSchema.parse(JSON.parse(raw));
    } catch {
      return { documents: {}, pendingEdits: [], activeChat: null };
    }
  }

  async saveState(state: NotebookState): Promise<void> {
    await fs.mkdir(this.sidecarDir, { recursive: true });
    await fs.writeFile(
      this.sidecarPath,
      JSON.stringify(state, null, 2) + '\n',
      'utf-8'
    );
  }

  async loadDocument(docId = 'index'): Promise<LoadedDocument> {
    const state = await this.loadState();
    let docNode: DocumentNode | undefined = state.documents[docId];
    const filename = docNode?.filename ?? (docId === 'index' ? 'index.md' : `${docId}.md`);
    const filePath = path.join(this.workspaceDir, filename);

    let rawMarkdown: string;
    try {
      rawMarkdown = await fs.readFile(filePath, 'utf-8');
    } catch {
      return { document: null, blocks: [], toc: [] };
    }

    const blocks = parseMarkdownBlocks(rawMarkdown);
    const toc = extractToc(blocks);

    if (!docNode) {
      const inferredTitle =
        toc.find((item) => item.level === 1)?.text ??
        toc[0]?.text ??
        'Untitled Document';
      docNode = {
        id: docId,
        title: inferredTitle,
        filename,
        parentId: null,
        parentBlockId: null,
        childDocIds: [],
      };
    }

    return {
      document: docNode,
      blocks,
      toc,
    };
  }

  async saveDocument(
    title: string,
    blocks: ConceptBlock[],
    options?: {
      id?: string;
      filename?: string;
      parentId?: string | null;
      parentBlockId?: string | null;
    }
  ): Promise<LoadedDocument> {
    const docId = options?.id ?? 'index';
    const filename =
      options?.filename ?? (docId === 'index' ? 'index.md' : `${docId}.md`);
    const state = await this.loadState();
    const existing = state.documents[docId];

    const docNode: DocumentNode = {
      id: docId,
      title,
      filename,
      parentId: options?.parentId ?? existing?.parentId ?? null,
      parentBlockId: options?.parentBlockId ?? existing?.parentBlockId ?? null,
      childDocIds: existing?.childDocIds ?? [],
    };

    state.documents[docId] = docNode;

    await fs.mkdir(this.workspaceDir, { recursive: true });
    const serialized = serializeMarkdownBlocks(blocks);
    await fs.writeFile(
      path.join(this.workspaceDir, filename),
      serialized,
      'utf-8'
    );
    await this.saveState(state);

    const toc = extractToc(blocks);
    return {
      document: docNode,
      blocks,
      toc,
    };
  }

  private nextAvailableBlockId(blocks: ConceptBlock[]): string {
    const used = new Set(blocks.map((b) => b.id));
    let idx = blocks.length;
    let candidate = generateBlockId(idx);
    while (used.has(candidate)) {
      idx += 1;
      candidate = generateBlockId(idx);
    }
    return candidate;
  }

  async updateBlock(
    blockId: string,
    markdown: string,
    docId = 'index'
  ): Promise<LoadedDocument> {
    const loaded = await this.loadDocument(docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = loaded.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const updatedBlocks = [...loaded.blocks];
    updatedBlocks[index] = {
      id: blockId,
      markdown: markdown.trim(),
    };

    return this.saveDocument(loaded.document.title, updatedBlocks, {
      id: loaded.document.id,
      filename: loaded.document.filename,
      parentId: loaded.document.parentId,
      parentBlockId: loaded.document.parentBlockId,
    });
  }

  async splitBlock(
    blockId: string,
    options?: { offset?: number; docId?: string }
  ): Promise<LoadedDocument> {
    const docId = options?.docId ?? 'index';
    const loaded = await this.loadDocument(docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = loaded.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const target = loaded.blocks[index];
    const [firstMarkdown, secondMarkdown] = splitMarkdownContent(
      target.markdown,
      options?.offset
    );
    const newBlockId = this.nextAvailableBlockId(loaded.blocks);

    const updatedBlocks = [
      ...loaded.blocks.slice(0, index),
      { id: target.id, markdown: firstMarkdown },
      { id: newBlockId, markdown: secondMarkdown },
      ...loaded.blocks.slice(index + 1),
    ];

    return this.saveDocument(loaded.document.title, updatedBlocks, {
      id: loaded.document.id,
      filename: loaded.document.filename,
      parentId: loaded.document.parentId,
      parentBlockId: loaded.document.parentBlockId,
    });
  }

  async mergeBlockWithNext(
    blockId: string,
    docId = 'index'
  ): Promise<LoadedDocument> {
    const loaded = await this.loadDocument(docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = loaded.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }
    if (index >= loaded.blocks.length - 1) {
      throw new Error(`Cannot merge last block: ${blockId}`);
    }

    const current = loaded.blocks[index];
    const next = loaded.blocks[index + 1];
    const mergedBlock: ConceptBlock = {
      id: current.id,
      markdown: `${current.markdown.trim()}\n\n${next.markdown.trim()}`,
    };

    const updatedBlocks = [
      ...loaded.blocks.slice(0, index),
      mergedBlock,
      ...loaded.blocks.slice(index + 2),
    ];

    return this.saveDocument(loaded.document.title, updatedBlocks, {
      id: loaded.document.id,
      filename: loaded.document.filename,
      parentId: loaded.document.parentId,
      parentBlockId: loaded.document.parentBlockId,
    });
  }

  async deleteBlock(
    blockId: string,
    docId = 'index'
  ): Promise<LoadedDocument> {
    const loaded = await this.loadDocument(docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = loaded.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const updatedBlocks = loaded.blocks.filter((b) => b.id !== blockId);

    return this.saveDocument(loaded.document.title, updatedBlocks, {
      id: loaded.document.id,
      filename: loaded.document.filename,
      parentId: loaded.document.parentId,
      parentBlockId: loaded.document.parentBlockId,
    });
  }
}
