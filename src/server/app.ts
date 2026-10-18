import { Hono } from 'hono';
import { z } from 'zod';
import { SeedResultSchema } from '../shared/schema.js';
import {
  defaultSeedGenerator,
  getActiveModelId,
  type SeedGenerator,
} from './llm.js';
import { generateBlockId } from './markdown.js';
import { WorkspaceStore } from './store.js';

export interface CreateAppOptions {
  workspaceDir: string;
  seedGenerator?: SeedGenerator;
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

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const store = new WorkspaceStore(options.workspaceDir);
  const seedGenerator = options.seedGenerator ?? defaultSeedGenerator;

  app.get('/api/doc', async (c) => {
    const docId = c.req.query('id') ?? 'index';
    const loaded = await store.loadDocument(docId);
    const modelId = options.modelId ?? getActiveModelId();

    return c.json({
      document: loaded.document,
      blocks: loaded.blocks,
      toc: loaded.toc,
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
        modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  return app;
}
