import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  NotebookSettingsSchema,
  NotebookStateSchema,
  type BranchResult,
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
  extractPrerequisitesFromBlock0,
  extractToc,
  generateBlockId,
  isPrerequisiteBlock,
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
  splitMultiSectionMarkdown,
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

  async resolveDocId(requestedDocId?: string): Promise<string> {
    const state = await this.loadState();
    if (requestedDocId && requestedDocId !== 'index') {
      return requestedDocId;
    }
    if (requestedDocId === 'index') {
      if (state.documents['index']) {
        return 'index';
      }
      try {
        await fs.access(path.join(this.workspaceDir, 'index.md'));
        return 'index';
      } catch {
        // Fall through to activeDocId / first root doc
      }
    }
    if (state.activeDocId && state.documents[state.activeDocId]) {
      return state.activeDocId;
    }
    const firstRoot = Object.values(state.documents).find(
      (d) => d.parentId === null
    );
    if (firstRoot) {
      return firstRoot.id;
    }
    const firstAny = Object.keys(state.documents)[0];
    return firstAny ?? 'index';
  }

  async seedRootDocument(seedResult: SeedResult): Promise<LoadedDocument> {
    const state = await this.loadState();
    const baseSlug = slugifyTitle(seedResult.title);
    let docId = baseSlug;
    let suffix = 2;
    while (state.documents[docId]) {
      docId = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    const blocks = seedResult.blocks.map((markdown, index) => ({
      id:
        index === 0 && /^#{1,3}\s*0\b|prerequisites/i.test(markdown)
          ? 'blk_00'
          : generateBlockId(index),
      markdown: markdown.trim(),
    }));

    return this.saveDocument(seedResult.title.trim(), blocks, {
      id: docId,
      filename: `${docId}.md`,
      parentId: null,
      parentBlockId: null,
      prerequisites: seedResult.prerequisites,
    });
  }

  async loadDocument(requestedDocId?: string): Promise<LoadedDocument> {
    const docId = await this.resolveDocId(requestedDocId);
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

    if (state.activeDocId !== docId && state.documents[docId]) {
      state.activeDocId = docId;
      await this.saveState(state);
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
      prerequisites?: string[];
      prerequisiteDocIds?: Record<string, string>;
    }
  ): Promise<LoadedDocument> {
    const docId = options?.id ?? 'index';
    const filename =
      options?.filename ?? (docId === 'index' ? 'index.md' : `${docId}.md`);
    const state = await this.loadState();
    const existing = state.documents[docId];

    const resolvedPrerequisites =
      options?.prerequisites ??
      existing?.prerequisites ??
      (blocks[0]?.id === 'blk_00'
        ? extractPrerequisitesFromBlock0(blocks[0].markdown)
        : undefined);

    const resolvedPrerequisiteDocIds =
      options?.prerequisiteDocIds ?? existing?.prerequisiteDocIds;

    const docNode: DocumentNode = {
      id: docId,
      title,
      filename,
      parentId: options?.parentId ?? existing?.parentId ?? null,
      parentBlockId: options?.parentBlockId ?? existing?.parentBlockId ?? null,
      childDocIds: existing?.childDocIds ?? [],
      ...(resolvedPrerequisites && resolvedPrerequisites.length > 0
        ? { prerequisites: resolvedPrerequisites }
        : {}),
      ...(resolvedPrerequisiteDocIds &&
      Object.keys(resolvedPrerequisiteDocIds).length > 0
        ? { prerequisiteDocIds: resolvedPrerequisiteDocIds }
        : {}),
    };

    state.documents[docId] = docNode;
    state.activeDocId = docId;

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

  async getActiveChat(requestedDocId?: string): Promise<EphemeralChatThread | null> {
    const docId = await this.resolveDocId(requestedDocId);
    const state = await this.loadState();
    if (state.activeChat && state.activeChat.docId === docId) {
      return state.activeChat;
    }
    return null;
  }

  async getPendingEdits(requestedDocId?: string): Promise<PendingSuggestedEdit[]> {
    const docId = await this.resolveDocId(requestedDocId);
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

  async discardChat(requestedDocId?: string, blockId?: string): Promise<null> {
    const docId = await this.resolveDocId(requestedDocId);
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
    const rawInsertedList = [...integrateResult.insertedBlocksMarkdown];
    let updatedTargetBlock: ConceptBlock = targetBlock;

    if (isPrerequisiteBlock(targetBlock)) {
      const existingPrereqs =
        loaded.document.prerequisites &&
        loaded.document.prerequisites.length > 0
          ? [...loaded.document.prerequisites]
          : extractPrerequisitesFromBlock0(targetBlock.markdown);
      const existingPrereqLower = new Set(
        existingPrereqs.map((p) => p.trim().toLowerCase())
      );

      const origNormalized = targetBlock.markdown.replace(/\r\n/g, '\n').trim();
      const candNormalized =
        integrateResult.updatedBlockMarkdown !== null
          ? integrateResult.updatedBlockMarkdown.replace(/\r\n/g, '\n').trim()
          : '';

      const origTrimmedLines = new Set(
        origNormalized
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      );
      const candLines = candNormalized ? candNormalized.split('\n') : [];
      const addedNonEmptyLines = candLines
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !origTrimmedLines.has(l));

      const explicitNewPrereqs = (integrateResult.addedPrerequisites ?? [])
        .map((p) => p.trim())
        .filter(
          (p) => p.length > 0 && !existingPrereqLower.has(p.toLowerCase())
        );

      const bulletExtractedNewPrereqs =
        addedNonEmptyLines.length > 0 &&
        addedNonEmptyLines.every((l) => /^[-*]\s+/.test(l))
          ? extractPrerequisitesFromBlock0(addedNonEmptyLines.join('\n')).filter(
              (p) => !existingPrereqLower.has(p.toLowerCase())
            )
          : [];

      const newPrereqs =
        explicitNewPrereqs.length > 0
          ? explicitNewPrereqs
          : bulletExtractedNewPrereqs;

      if (newPrereqs.length > 0) {
        const addedBulletLines = addedNonEmptyLines.filter((l) =>
          /^[-*]\s+/.test(l)
        );
        const addedNonBulletLines = candLines.filter((l) => {
          const t = l.trim();
          return (
            t.length === 0 ||
            (!origTrimmedLines.has(t) && !/^[-*]\s+/.test(t))
          );
        });

        if (
          candNormalized.length > 0 &&
          addedNonEmptyLines.every((l) => /^[-*]\s+/.test(l))
        ) {
          updatedTargetBlock = {
            id: targetBlock.id,
            markdown: candNormalized,
          };
        } else if (addedBulletLines.length > 0) {
          updatedTargetBlock = {
            id: targetBlock.id,
            markdown: `${origNormalized}\n${addedBulletLines.join('\n')}`,
          };
          const extraProse = addedNonBulletLines
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
          if (extraProse && rawInsertedList.length === 0) {
            rawInsertedList.push(extraProse);
          }
        } else {
          const generatedBullets = newPrereqs.map((topic) => `- **${topic}**`);
          updatedTargetBlock = {
            id: targetBlock.id,
            markdown: `${origNormalized}\n${generatedBullets.join('\n')}`,
          };
        }

        const mergedPrereqs = [...existingPrereqs];
        for (const topic of [
          ...newPrereqs,
          ...extractPrerequisitesFromBlock0(updatedTargetBlock.markdown),
        ]) {
          if (
            !mergedPrereqs.some(
              (p) => p.toLowerCase() === topic.toLowerCase()
            )
          ) {
            mergedPrereqs.push(topic);
          }
        }
        loaded.document = {
          ...loaded.document,
          prerequisites: mergedPrereqs,
        };
      } else if (candNormalized.length > 0 && candNormalized !== origNormalized) {
        // Not adding prerequisites: do NOT expand blk_00; create a new card below instead
        if (rawInsertedList.length === 0) {
          const extractedNewCard = candNormalized.startsWith(origNormalized)
            ? candNormalized.slice(origNormalized.length).trim()
            : candLines
                .filter((l) => {
                  const t = l.trim();
                  return t.length === 0 || !origTrimmedLines.has(t);
                })
                .join('\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

          rawInsertedList.push(extractedNewCard || candNormalized);
        }
      }
    } else if (
      integrateResult.updatedBlockMarkdown !== null &&
      integrateResult.updatedBlockMarkdown.trim().length > 0
    ) {
      updatedTargetBlock = {
        id: targetBlock.id,
        markdown: integrateResult.updatedBlockMarkdown.trim(),
      };
    }

    const workingBlocks: ConceptBlock[] = [
      ...loaded.blocks.slice(0, index),
      updatedTargetBlock,
      ...loaded.blocks.slice(index + 1),
    ];

    const insertedBlocks: ConceptBlock[] = [];
    const expandedInsertedList = rawInsertedList.flatMap((raw) =>
      splitMultiSectionMarkdown(raw)
    );
    for (const rawInserted of expandedInsertedList) {
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
    branchResult: BranchResult
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

    const branchItems: SeedResult[] = Array.isArray(branchResult)
      ? branchResult
      : 'branches' in branchResult
        ? branchResult.branches
        : [branchResult];

    if (branchItems.length === 0) {
      throw new Error('No branches to create');
    }

    const parentTargetBlock = parentLoaded.blocks[blockIndex];
    const isPrereq =
      isPrerequisiteBlock(parentTargetBlock) || blockId === 'blk_00';
    const parentPrereqList =
      parentLoaded.document.prerequisites &&
      parentLoaded.document.prerequisites.length > 0
        ? [...parentLoaded.document.prerequisites]
        : extractPrerequisitesFromBlock0(parentTargetBlock.markdown);

    const parentDocNode: DocumentNode = {
      ...parentLoaded.document,
      childDocIds: [...parentLoaded.document.childDocIds],
      ...(isPrereq &&
      (!parentLoaded.document.prerequisites ||
        parentLoaded.document.prerequisites.length === 0) &&
      parentPrereqList.length > 0
        ? { prerequisites: parentPrereqList }
        : {}),
    };

    let updatedTargetMarkdown = parentTargetBlock.markdown.trim();
    const allocatedDocIds = new Set<string>();
    const claimedPrereqTopics = new Set<string>();
    const createdDocs: { docNode: DocumentNode; blocks: ConceptBlock[] }[] = [];

    await fs.mkdir(this.workspaceDir, { recursive: true });

    for (const item of branchItems) {
      const baseSlug = slugifyTitle(item.title);
      let childDocId = baseSlug;
      let suffix = 2;
      while (
        state.documents[childDocId] ||
        childDocId === docId ||
        allocatedDocIds.has(childDocId)
      ) {
        childDocId = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      allocatedDocIds.add(childDocId);

      const childFilename = `${childDocId}.md`;
      const childTitle = item.title.trim();

      const childBlocks: ConceptBlock[] = item.blocks.map(
        (markdown, index) => ({
          id:
            index === 0 && /^#{1,3}\s*0\b|prerequisites/i.test(markdown)
              ? 'blk_00'
              : generateBlockId(index),
          markdown: markdown.trim(),
        })
      );

      const resolvedPrerequisites =
        item.prerequisites ??
        (childBlocks[0]?.id === 'blk_00'
          ? extractPrerequisitesFromBlock0(childBlocks[0].markdown)
          : undefined);

      const linkMarkdown = `[→ Deep dive: ${childTitle}](${childFilename})`;
      if (!updatedTargetMarkdown.includes(linkMarkdown)) {
        updatedTargetMarkdown = `${updatedTargetMarkdown}\n\n${linkMarkdown}`;
      }

      if (!parentDocNode.childDocIds.includes(childDocId)) {
        parentDocNode.childDocIds.push(childDocId);
      }

      if (isPrereq) {
        const normTitle = childTitle.toLowerCase();
        const sortedCandidateTopics = parentPrereqList
          .filter((topic) => !claimedPrereqTopics.has(topic.trim()))
          .sort((a, b) => {
            const cleanA = a.trim();
            const cleanB = b.trim();
            const exactA =
              normTitle === cleanA.toLowerCase() ||
              childDocId === slugifyTitle(cleanA);
            const exactB =
              normTitle === cleanB.toLowerCase() ||
              childDocId === slugifyTitle(cleanB);
            if (exactA && !exactB) return -1;
            if (!exactA && exactB) return 1;
            return cleanB.length - cleanA.length;
          });

        for (const topic of sortedCandidateTopics) {
          const cleanTopic = topic.trim();
          const normTopic = cleanTopic.toLowerCase();
          const topicSlug = slugifyTitle(cleanTopic);
          const topicWords = normTopic
            .split(/[^a-z0-9]+/)
            .filter(
              (w) =>
                w.length > 2 &&
                !['with', 'from', 'into', 'that', 'and', 'the', 'for'].includes(
                  w
                )
            );

          const matches =
            normTitle === normTopic ||
            normTitle.includes(normTopic) ||
            normTopic.includes(normTitle) ||
            childDocId === topicSlug ||
            childDocId.includes(topicSlug) ||
            topicSlug.includes(childDocId) ||
            (topicWords.length > 0 &&
              topicWords.every(
                (w) => normTitle.includes(w) || childDocId.includes(w)
              ));

          if (matches) {
            claimedPrereqTopics.add(cleanTopic);
            parentDocNode.prerequisiteDocIds = {
              ...(parentDocNode.prerequisiteDocIds ?? {}),
              [cleanTopic]: childDocId,
            };
            state.topicDocIds = {
              ...(state.topicDocIds ?? {}),
              [cleanTopic]: childDocId,
            };
            break;
          }
        }
      }


      const childDocNode: DocumentNode = {
        id: childDocId,
        title: childTitle,
        filename: childFilename,
        parentId: docId,
        parentBlockId: blockId,
        childDocIds: [],
        ...(resolvedPrerequisites && resolvedPrerequisites.length > 0
          ? { prerequisites: resolvedPrerequisites }
          : {}),
      };

      state.documents[childDocId] = childDocNode;
      createdDocs.push({ docNode: childDocNode, blocks: childBlocks });

      await fs.writeFile(
        path.join(this.workspaceDir, childFilename),
        serializeMarkdownBlocks(childBlocks),
        'utf-8'
      );
    }

    const updatedParentBlocks: ConceptBlock[] = [...parentLoaded.blocks];
    updatedParentBlocks[blockIndex] = {
      id: parentTargetBlock.id,
      markdown: updatedTargetMarkdown,
    };

    state.documents[docId] = parentDocNode;
    state.activeDocId = createdDocs[0].docNode.id;
    state.activeChat = null;

    await fs.writeFile(
      path.join(this.workspaceDir, parentDocNode.filename),
      serializeMarkdownBlocks(updatedParentBlocks),
      'utf-8'
    );
    await this.saveState(state);

    return {
      document: createdDocs[0].docNode,
      blocks: createdDocs[0].blocks,
      toc: extractToc(createdDocs[0].blocks),
      documents: state.documents,
      activeChat: null,
      pendingEdits: [],
      settings: this.resolveStateSettings(state),
    };
  }


  async findExistingPrerequisiteDocument(
    parentDocId: string,
    topic: string
  ): Promise<LoadedDocument | null> {
    const state = await this.loadState();
    const cleanTopic = topic.trim();
    const parentDoc = state.documents[parentDocId];

    // 1. Check structured prerequisiteDocIds on the parent document or global topicDocIds
    const mappedDocId =
      parentDoc?.prerequisiteDocIds?.[cleanTopic] ??
      state.topicDocIds?.[cleanTopic];
    if (mappedDocId && state.documents[mappedDocId]) {
      if (
        parentDoc &&
        parentDoc.prerequisiteDocIds?.[cleanTopic] !== mappedDocId
      ) {
        parentDoc.prerequisiteDocIds = {
          ...(parentDoc.prerequisiteDocIds ?? {}),
          [cleanTopic]: mappedDocId,
        };
        if (!parentDoc.childDocIds.includes(mappedDocId)) {
          parentDoc.childDocIds = [...parentDoc.childDocIds, mappedDocId];
        }
        await this.saveState(state);
      }
      return this.loadDocument(mappedDocId);
    }

    // 2. Fallback: check existing child documents by title/slug/keyword overlap and backfill structured map
    const normTopic = cleanTopic.toLowerCase();
    const topicSlug = slugifyTitle(cleanTopic);
    const topicWords = normTopic
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !['with', 'from', 'into', 'that'].includes(w));

    const existingDoc = Object.values(state.documents).find((doc) => {
      if (doc.parentId !== parentDocId) return false;
      const normTitle = doc.title.trim().toLowerCase();
      const wordMatches =
        topicWords.length >= 2 &&
        topicWords.every((w) => normTitle.includes(w) || doc.id.includes(w));
      return (
        normTitle === normTopic ||
        normTitle.includes(normTopic) ||
        normTopic.includes(normTitle) ||
        doc.id === topicSlug ||
        doc.id.includes(topicSlug) ||
        wordMatches
      );
    });

    if (!existingDoc) {
      return null;
    }

    if (parentDoc) {
      parentDoc.prerequisiteDocIds = {
        ...(parentDoc.prerequisiteDocIds ?? {}),
        [cleanTopic]: existingDoc.id,
      };
      state.topicDocIds = {
        ...(state.topicDocIds ?? {}),
        [cleanTopic]: existingDoc.id,
      };
      await this.saveState(state);
    }

    return this.loadDocument(existingDoc.id);
  }

  async branchPrerequisiteDocument(
    parentDocId: string,
    topic: string,
    seedResult: SeedResult
  ): Promise<LoadedDocument> {
    const state = await this.loadState();
    if (state.pendingEdits.some((e) => e.docId === parentDocId)) {
      throw new Error('Resolve pending suggested edits first');
    }

    const parentLoaded = await this.loadDocument(parentDocId);
    if (!parentLoaded.document || parentLoaded.blocks.length === 0) {
      throw new Error(`Document not found: ${parentDocId}`);
    }

    const targetBlock =
      parentLoaded.blocks.find((b) => b.id === 'blk_00') ??
      parentLoaded.blocks[0];

    const branched = await this.branchDocumentFromChat(
      parentDocId,
      targetBlock.id,
      seedResult
    );

    const cleanTopic = topic.trim();
    if (cleanTopic && branched.document) {
      const updatedState = await this.loadState();
      const parentNode = updatedState.documents[parentDocId];
      if (parentNode) {
        parentNode.prerequisiteDocIds = {
          ...(parentNode.prerequisiteDocIds ?? {}),
          [cleanTopic]: branched.document.id,
        };
      }
      updatedState.topicDocIds = {
        ...(updatedState.topicDocIds ?? {}),
        [cleanTopic]: branched.document.id,
      };
      await this.saveState(updatedState);
      return {
        ...branched,
        documents: updatedState.documents,
      };
    }

    return branched;
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
