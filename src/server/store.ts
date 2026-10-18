import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  NotebookSettingsSchema,
  NotebookStateSchema,
  type ConceptBlock,
  type DocumentNode,
  type EphemeralChatThread,
  type IntegrateResult,
  type NotebookSettings,
  type NotebookState,
  type PendingSuggestedEdit,
  type SeedResult,
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
  documents: Record<string, DocumentNode>;
  activeChat: EphemeralChatThread | null;
  pendingEdits: PendingSuggestedEdit[];
  settings: NotebookSettings;
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'subdoc';
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

  private resolveStateSettings(
    state: NotebookState,
    defaultModelId?: string
  ): NotebookSettings {
    return NotebookSettingsSchema.parse({
      ...(defaultModelId ? { modelId: defaultModelId } : {}),
      ...(state.settings ?? {}),
    });
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

  async getSettings(defaultModelId?: string): Promise<NotebookSettings> {
    const state = await this.loadState();
    return this.resolveStateSettings(state, defaultModelId);
  }

  async updateSettings(
    patch: Partial<NotebookSettings>,
    defaultModelId?: string
  ): Promise<NotebookSettings> {
    const state = await this.loadState();
    const current = this.resolveStateSettings(state, defaultModelId);
    const updated = NotebookSettingsSchema.parse({
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ),
    });
    state.settings = updated;
    await this.saveState(state);
    return updated;
  }

  async loadDocument(docId = 'index'): Promise<LoadedDocument> {
    const state = await this.loadState();
    const settings = this.resolveStateSettings(state);
    const activeChat =
      state.activeChat && state.activeChat.docId === docId
        ? state.activeChat
        : null;
    const pendingEdits = state.pendingEdits.filter((e) => e.docId === docId);

    let docNode: DocumentNode | undefined = state.documents[docId];
    const filename = docNode?.filename ?? (docId === 'index' ? 'index.md' : `${docId}.md`);
    const filePath = path.join(this.workspaceDir, filename);

    let rawMarkdown: string;
    try {
      rawMarkdown = await fs.readFile(filePath, 'utf-8');
    } catch {
      return {
        document: null,
        blocks: [],
        toc: [],
        documents: state.documents,
        activeChat,
        pendingEdits,
        settings,
      };
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
      state.documents[docId] = docNode;
    }

    return {
      document: docNode,
      blocks,
      toc,
      documents: state.documents,
      activeChat,
      pendingEdits,
      settings,
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
    const activeChat =
      state.activeChat && state.activeChat.docId === docId
        ? state.activeChat
        : null;
    const pendingEdits = state.pendingEdits.filter((e) => e.docId === docId);

    return {
      document: docNode,
      blocks,
      toc,
      documents: state.documents,
      activeChat,
      pendingEdits,
      settings: this.resolveStateSettings(state),
    };
  }

  async getActiveChat(docId = 'index'): Promise<EphemeralChatThread | null> {
    const state = await this.loadState();
    if (state.activeChat && state.activeChat.docId === docId) {
      return state.activeChat;
    }
    return null;
  }

  async getPendingEdits(docId = 'index'): Promise<PendingSuggestedEdit[]> {
    const state = await this.loadState();
    return state.pendingEdits.filter((e) => e.docId === docId);
  }

  async appendChatMessage(
    docId: string,
    blockId: string,
    modelId: string,
    userMessage: string,
    assistantReply: string
  ): Promise<EphemeralChatThread> {
    const state = await this.loadState();
    if (state.pendingEdits.some((e) => e.docId === docId)) {
      throw new Error('Resolve pending suggested edits first');
    }

    const priorMessages =
      state.activeChat &&
      state.activeChat.docId === docId &&
      state.activeChat.blockId === blockId
        ? state.activeChat.messages
        : [];

    const updatedChat: EphemeralChatThread = {
      docId,
      blockId,
      modelId,
      messages: [
        ...priorMessages,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: assistantReply },
      ],
    };

    state.activeChat = updatedChat;
    await this.saveState(state);
    return updatedChat;
  }

  async discardChat(docId = 'index', blockId?: string): Promise<null> {
    const state = await this.loadState();
    if (
      !blockId ||
      !state.activeChat ||
      (state.activeChat.docId === docId && state.activeChat.blockId === blockId)
    ) {
      state.activeChat = null;
      await this.saveState(state);
    }
    return null;
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

  private nextAvailableEditId(pendingEdits: PendingSuggestedEdit[]): string {
    const used = new Set(pendingEdits.map((e) => e.id));
    let idx = 1;
    let candidate = `edit_${String(idx).padStart(2, '0')}`;
    while (used.has(candidate)) {
      idx += 1;
      candidate = `edit_${String(idx).padStart(2, '0')}`;
    }
    return candidate;
  }

  async integrateBlockChat(
    docId: string,
    blockId: string,
    integrateResult: IntegrateResult
  ): Promise<LoadedDocument> {
    const state = await this.loadState();
    if (state.pendingEdits.some((e) => e.docId === docId)) {
      throw new Error('Resolve pending suggested edits first');
    }

    const loaded = await this.loadDocument(docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const index = loaded.blocks.findIndex((b) => b.id === blockId);
    if (index === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const prevBlock = index > 0 ? loaded.blocks[index - 1] : null;
    const nextBlock =
      index < loaded.blocks.length - 1 ? loaded.blocks[index + 1] : null;

    const targetBlock = loaded.blocks[index];
    const updatedTargetBlock: ConceptBlock =
      integrateResult.updatedBlockMarkdown !== null &&
      integrateResult.updatedBlockMarkdown.trim().length > 0
        ? {
            id: targetBlock.id,
            markdown: integrateResult.updatedBlockMarkdown.trim(),
          }
        : targetBlock;

    const workingBlocks: ConceptBlock[] = [
      ...loaded.blocks.slice(0, index),
      updatedTargetBlock,
      ...loaded.blocks.slice(index + 1),
    ];

    const insertedBlocks: ConceptBlock[] = [];
    for (const rawInserted of integrateResult.insertedBlocksMarkdown) {
      const trimmed = rawInserted.trim();
      if (!trimmed) continue;
      const newId = this.nextAvailableBlockId([
        ...workingBlocks,
        ...insertedBlocks,
      ]);
      insertedBlocks.push({
        id: newId,
        markdown: trimmed,
      });
    }

    const finalBlocks: ConceptBlock[] = [
      ...workingBlocks.slice(0, index + 1),
      ...insertedBlocks,
      ...workingBlocks.slice(index + 1),
    ];

    // Filter suggestedEdits strictly to original N-1 and N+1 adjacent blocks whose proposedMarkdown differs
    const stagedEdits = [...state.pendingEdits];
    const stagedTargets = new Set<string>();

    for (const candidate of integrateResult.suggestedEdits) {
      const adjacentBlock =
        prevBlock && prevBlock.id === candidate.targetBlockId
          ? prevBlock
          : nextBlock && nextBlock.id === candidate.targetBlockId
            ? nextBlock
            : null;

      if (!adjacentBlock) continue;
      if (stagedTargets.has(adjacentBlock.id)) continue;

      const proposed = candidate.proposedMarkdown.trim();
      if (!proposed || proposed === adjacentBlock.markdown.trim()) {
        continue;
      }

      const editId = this.nextAvailableEditId(stagedEdits);
      stagedEdits.push({
        id: editId,
        docId,
        blockId: adjacentBlock.id,
        originalMarkdown: adjacentBlock.markdown,
        proposedMarkdown: proposed,
        reason: candidate.reason,
        sourceBlockId: blockId,
      });
      stagedTargets.add(adjacentBlock.id);
    }

    state.documents[docId] = loaded.document;
    state.activeChat = null;
    state.pendingEdits = stagedEdits;

    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(this.workspaceDir, loaded.document.filename),
      serializeMarkdownBlocks(finalBlocks),
      'utf-8'
    );
    await this.saveState(state);

    return {
      document: loaded.document,
      blocks: finalBlocks,
      toc: extractToc(finalBlocks),
      documents: state.documents,
      activeChat: null,
      pendingEdits: stagedEdits.filter((e) => e.docId === docId),
      settings: this.resolveStateSettings(state),
    };
  }

  async branchDocumentFromChat(
    docId: string,
    blockId: string,
    branchResult: SeedResult
  ): Promise<LoadedDocument> {
    const state = await this.loadState();
    if (state.pendingEdits.some((e) => e.docId === docId)) {
      throw new Error('Resolve pending suggested edits first');
    }

    const parentLoaded = await this.loadDocument(docId);
    if (!parentLoaded.document) {
      throw new Error(`Document not found: ${docId}`);
    }

    const blockIndex = parentLoaded.blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) {
      throw new Error(`Block not found: ${blockId}`);
    }

    const baseSlug = slugifyTitle(branchResult.title);
    let childDocId = baseSlug;
    let suffix = 2;
    while (state.documents[childDocId] || childDocId === docId) {
      childDocId = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const childFilename = `${childDocId}.md`;
    const childTitle = branchResult.title.trim();

    const childBlocks: ConceptBlock[] = branchResult.blocks.map(
      (markdown, index) => ({
        id:
          index === 0 && /^#{1,3}\s*0\b|prerequisites/i.test(markdown)
            ? 'blk_00'
            : generateBlockId(index),
        markdown: markdown.trim(),
      })
    );

    const parentTargetBlock = parentLoaded.blocks[blockIndex];
    const linkMarkdown = `[→ Deep dive: ${childTitle}](${childFilename})`;
    const updatedParentBlocks: ConceptBlock[] = [...parentLoaded.blocks];
    updatedParentBlocks[blockIndex] = {
      id: parentTargetBlock.id,
      markdown: `${parentTargetBlock.markdown.trim()}\n\n${linkMarkdown}`,
    };

    const parentDocNode: DocumentNode = {
      ...parentLoaded.document,
      childDocIds: parentLoaded.document.childDocIds.includes(childDocId)
        ? parentLoaded.document.childDocIds
        : [...parentLoaded.document.childDocIds, childDocId],
    };

    const childDocNode: DocumentNode = {
      id: childDocId,
      title: childTitle,
      filename: childFilename,
      parentId: docId,
      parentBlockId: blockId,
      childDocIds: [],
    };

    state.documents[docId] = parentDocNode;
    state.documents[childDocId] = childDocNode;
    state.activeChat = null;

    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(this.workspaceDir, parentDocNode.filename),
      serializeMarkdownBlocks(updatedParentBlocks),
      'utf-8'
    );
    await fs.writeFile(
      path.join(this.workspaceDir, childFilename),
      serializeMarkdownBlocks(childBlocks),
      'utf-8'
    );
    await this.saveState(state);

    return {
      document: childDocNode,
      blocks: childBlocks,
      toc: extractToc(childBlocks),
      documents: state.documents,
      activeChat: null,
      pendingEdits: [],
      settings: this.resolveStateSettings(state),
    };
  }

  async acceptPendingEdit(editId: string): Promise<LoadedDocument> {
    const state = await this.loadState();
    const editIndex = state.pendingEdits.findIndex((e) => e.id === editId);
    if (editIndex === -1) {
      throw new Error(`Pending edit not found: ${editId}`);
    }

    const edit = state.pendingEdits[editIndex];
    const loaded = await this.loadDocument(edit.docId);
    if (!loaded.document) {
      throw new Error(`Document not found: ${edit.docId}`);
    }

    const blockIndex = loaded.blocks.findIndex((b) => b.id === edit.blockId);
    if (blockIndex === -1) {
      throw new Error(`Block not found: ${edit.blockId}`);
    }

    const updatedBlocks = [...loaded.blocks];
    updatedBlocks[blockIndex] = {
      id: edit.blockId,
      markdown: edit.proposedMarkdown.trim(),
    };

    state.pendingEdits.splice(editIndex, 1);
    state.documents[edit.docId] = loaded.document;

    await fs.mkdir(this.workspaceDir, { recursive: true });
    await fs.writeFile(
      path.join(this.workspaceDir, loaded.document.filename),
      serializeMarkdownBlocks(updatedBlocks),
      'utf-8'
    );
    await this.saveState(state);

    const activeChat =
      state.activeChat && state.activeChat.docId === edit.docId
        ? state.activeChat
        : null;

    return {
      document: loaded.document,
      blocks: updatedBlocks,
      toc: extractToc(updatedBlocks),
      documents: state.documents,
      activeChat,
      pendingEdits: state.pendingEdits.filter((e) => e.docId === edit.docId),
      settings: this.resolveStateSettings(state),
    };
  }

  async rejectPendingEdit(editId: string): Promise<LoadedDocument> {
    const state = await this.loadState();
    const editIndex = state.pendingEdits.findIndex((e) => e.id === editId);
    if (editIndex === -1) {
      throw new Error(`Pending edit not found: ${editId}`);
    }

    const edit = state.pendingEdits[editIndex];
    state.pendingEdits.splice(editIndex, 1);
    await this.saveState(state);

    return this.loadDocument(edit.docId);
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
