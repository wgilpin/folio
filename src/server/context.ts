import type { ConceptBlock, TocItem } from '../shared/schema.js';
import type { WorkspaceStore } from './store.js';

export interface AncestorToc {
  docId: string;
  title: string;
  toc: TocItem[];
}

export interface BoundedCellContext {
  docId: string;
  title: string;
  toc: TocItem[];
  ancestorTocs: AncestorToc[];
  previousBlock: ConceptBlock | null;
  targetBlock: ConceptBlock;
  nextBlock: ConceptBlock | null;
}

export async function buildBoundedCellContext(
  store: WorkspaceStore,
  docId: string,
  blockId: string
): Promise<BoundedCellContext> {
  const loaded = await store.loadDocument(docId);
  if (!loaded.document) {
    throw new Error(`Document not found: ${docId}`);
  }

  const index = loaded.blocks.findIndex((b) => b.id === blockId);
  if (index === -1) {
    throw new Error(`Block not found: ${blockId}`);
  }

  const previousBlock = index > 0 ? loaded.blocks[index - 1] : null;
  const targetBlock = loaded.blocks[index];
  const nextBlock =
    index < loaded.blocks.length - 1 ? loaded.blocks[index + 1] : null;

  const ancestorTocs: AncestorToc[] = [];
  let currentParentId = loaded.document.parentId;
  const visited = new Set<string>([docId]);

  while (currentParentId && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parentLoaded = await store.loadDocument(currentParentId);
    if (!parentLoaded.document) {
      break;
    }
    ancestorTocs.unshift({
      docId: parentLoaded.document.id,
      title: parentLoaded.document.title,
      toc: parentLoaded.toc,
    });
    currentParentId = parentLoaded.document.parentId;
  }

  return {
    docId: loaded.document.id,
    title: loaded.document.title,
    toc: loaded.toc,
    ancestorTocs,
    previousBlock,
    targetBlock,
    nextBlock,
  };
}
