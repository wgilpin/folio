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
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
} from './markdown.js';

export interface LoadedDocument {
  document: DocumentNode | null;
  blocks: ConceptBlock[];
  toc: TocItem[];
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
}
