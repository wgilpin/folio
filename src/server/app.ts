import { Hono } from 'hono';
import { z } from 'zod';
import {
  IntegrateResultSchema,
  SeedResultSchema,
  type ChatMessage,
} from '../shared/schema.js';
import { buildBoundedCellContext } from './context.js';
import {
  defaultBranchGenerator,
  defaultCellChatGenerator,
  defaultIntegrateGenerator,
  defaultSeedGenerator,
  getActiveModelId,
  type BranchGenerator,
  type CellChatGenerator,
  type IntegrateGenerator,
  type SeedGenerator,
} from './llm.js';
import { generateBlockId } from './markdown.js';
import { WorkspaceStore } from './store.js';

export interface CreateAppOptions {
  workspaceDir: string;
  seedGenerator?: SeedGenerator;
  cellChatGenerator?: CellChatGenerator;
  integrateGenerator?: IntegrateGenerator;
  branchGenerator?: BranchGenerator;
  modelId?: string;
}

const SeedRequestSchema = z.object({
  prompt: z.string().trim().min(1, 'Topic prompt is required'),
});

const UpdateBlockRequestSchema = z.object({
  markdown: z.string(),
  docId: z.string().optional(),
});

const SplitBlockRequestSchema = z.object({
  offset: z.number().int().optional(),
  docId: z.string().optional(),
});

const MergeBlockRequestSchema = z.object({
  docId: z.string().optional(),
});

const ChatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Chat message is required'),
  docId: z.string().optional(),
});

const IntegrateRequestSchema = z.object({
  docId: z.string().optional(),
});

const BranchRequestSchema = z.object({
  docId: z.string().optional(),
});

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const store = new WorkspaceStore(options.workspaceDir);
  const seedGenerator = options.seedGenerator ?? defaultSeedGenerator;
  const cellChatGenerator =
    options.cellChatGenerator ?? defaultCellChatGenerator;
  const integrateGenerator =
    options.integrateGenerator ?? defaultIntegrateGenerator;
  const branchGenerator = options.branchGenerator ?? defaultBranchGenerator;

  app.get('/api/doc', async (c) => {
    const docId = c.req.query('id') ?? 'index';
    const loaded = await store.loadDocument(docId);
    const modelId = options.modelId ?? getActiveModelId();

    if (!loaded.document) {
      return c.json({
        document: null,
        blocks: [],
        toc: [],
        modelId,
      });
    }

    return c.json({
      document: loaded.document,
      blocks: loaded.blocks,
      toc: loaded.toc,
      documents: loaded.documents,
      activeChat: loaded.activeChat,
      pendingEdits: loaded.pendingEdits,
      modelId,
    });
  });

  app.post('/api/doc/seed', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SeedRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Topic prompt is required' }, 400);
    }

    try {
      const seedResult = SeedResultSchema.parse(
        await seedGenerator(parsedReq.data.prompt)
      );
      const blocks = seedResult.blocks.map((markdown, index) => ({
        id:
          index === 0 && /^#{1,3}\s*0\b|prerequisites/i.test(markdown)
            ? 'blk_00'
            : generateBlockId(index),
        markdown: markdown.trim(),
      }));

      const saved = await store.saveDocument(seedResult.title.trim(), blocks, {
        id: 'index',
        filename: 'index.md',
      });
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to seed topic';
      return c.json({ error: message }, 500);
    }
  });

  app.put('/api/blocks/:id', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = UpdateBlockRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Block markdown is required' }, 400);
    }

    try {
      const saved = await store.updateBlock(
        blockId,
        parsedReq.data.markdown,
        parsedReq.data.docId ?? 'index'
      );
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/split', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim()) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SplitBlockRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid split request' }, 400);
    }

    try {
      const saved = await store.splitBlock(blockId, {
        offset: parsedReq.data.offset,
        docId: parsedReq.data.docId ?? 'index',
      });
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to split block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/merge', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim()) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = MergeBlockRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid merge request' }, 400);
    }

    try {
      const saved = await store.mergeBlockWithNext(
        blockId,
        parsedReq.data.docId ?? 'index'
      );
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to merge block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.delete('/api/blocks/:id', async (c) => {
    const blockId = c.req.param('id');
    const docId = c.req.query('docId') ?? 'index';

    try {
      const saved = await store.deleteBlock(blockId, docId);
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/chat', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = ChatRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Chat message is required' }, 400);
    }

    const docId = parsedReq.data.docId ?? 'index';
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    try {
      const context = await buildBoundedCellContext(store, docId, blockId);
      const existingChat = await store.getActiveChat(docId);
      const priorMessages: ChatMessage[] =
        existingChat && existingChat.blockId === blockId
          ? existingChat.messages
          : [];

      const messagesForGenerator: ChatMessage[] = [
        ...priorMessages,
        { role: 'user', content: parsedReq.data.message },
      ];
      const modelId = options.modelId ?? getActiveModelId();

      const assistantReply = await cellChatGenerator({
        context,
        messages: messagesForGenerator,
        modelId,
      });

      const activeChat = await store.appendChatMessage(
        docId,
        blockId,
        modelId,
        parsedReq.data.message,
        assistantReply
      );

      return c.json({ activeChat });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process cell chat';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.delete('/api/blocks/:id/chat', async (c) => {
    const blockId = c.req.param('id');
    const docId = c.req.query('docId') ?? 'index';

    await store.discardChat(docId, blockId);
    return c.json({ activeChat: null });
  });

  app.post('/api/blocks/:id/integrate', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim()) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = IntegrateRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid integrate request' }, 400);
    }

    const docId = parsedReq.data.docId ?? 'index';
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    const activeChat = await store.getActiveChat(docId);
    if (
      !activeChat ||
      activeChat.blockId !== blockId ||
      activeChat.messages.length === 0
    ) {
      return c.json(
        { error: 'No active chat to integrate for this block' },
        400
      );
    }

    try {
      const context = await buildBoundedCellContext(store, docId, blockId);
      const modelId = options.modelId ?? getActiveModelId();

      const integrateResult = IntegrateResultSchema.parse(
        await integrateGenerator({
          context,
          messages: activeChat.messages,
          modelId,
        })
      );

      const saved = await store.integrateBlockChat(
        docId,
        blockId,
        integrateResult
      );

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to integrate block chat';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/branch', async (c) => {
    const blockId = c.req.param('id');
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim()) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = BranchRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid branch request' }, 400);
    }

    const docId = parsedReq.data.docId ?? 'index';
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    const activeChat = await store.getActiveChat(docId);
    if (
      !activeChat ||
      activeChat.blockId !== blockId ||
      activeChat.messages.length === 0
    ) {
      return c.json(
        { error: 'No active chat to branch for this block' },
        400
      );
    }

    try {
      const context = await buildBoundedCellContext(store, docId, blockId);
      const modelId = options.modelId ?? getActiveModelId();

      const branchResult = SeedResultSchema.parse(
        await branchGenerator({
          context,
          messages: activeChat.messages,
          modelId,
        })
      );

      const created = await store.branchDocumentFromChat(
        docId,
        blockId,
        branchResult
      );

      return c.json({
        document: created.document,
        blocks: created.blocks,
        toc: created.toc,
        documents: created.documents,
        activeChat: created.activeChat,
        pendingEdits: created.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to branch sub-document';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/edits/:editId/accept', async (c) => {
    const editId = c.req.param('editId');

    try {
      const saved = await store.acceptPendingEdit(editId);
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to accept pending edit';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/edits/:editId/reject', async (c) => {
    const editId = c.req.param('editId');

    try {
      const saved = await store.rejectPendingEdit(editId);
      const modelId = options.modelId ?? getActiveModelId();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reject pending edit';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  return app;
}
