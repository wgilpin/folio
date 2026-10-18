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
        id: generateBlockId(index),
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

  return app;
}
