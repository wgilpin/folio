import * as fs from 'node:fs/promises';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  BranchResultSchema,
  DocumentIntegrateResultSchema,
  IntegrateResultSchema,
  PedagogicalProfileIdSchema,
  ReasoningEffortSchema,
  SearchModeSchema,
  SeedResultSchema,
  SeedSourceInputSchema,
  TopicFamiliaritySchema,
  type ChatMessage,
  type SeedSourceInput,
} from '../shared/schema.js';
import { buildBoundedCellContext, buildDocumentContext } from './context.js';
import { searchWorkspaceLibrary } from './search.js';
import {
  ADVERSARIAL_REVIEW_INSTRUCTIONS,
  defaultBranchGenerator,
  defaultCellChatGenerator,
  defaultDocumentBranchGenerator,
  defaultDocumentChatGenerator,
  defaultDocumentIntegrateGenerator,
  defaultIntegrateGenerator,
  defaultSeedGenerator,
  getActiveModelId,
  hasLearnerProfileContent,
  resolvePedagogicalPrompt,
  type BranchGenerator,
  type CellChatGenerator,
  type DocumentBranchGenerator,
  type DocumentChatGenerator,
  type DocumentIntegrateGenerator,
  type IntegrateGenerator,
  type SeedGenerator,
} from './llm.js';
import { generateBlockId, isPrerequisiteBlock } from './markdown.js';

import { LearnerProfileStore } from './profile.js';
import { WorkspaceStore } from './store.js';

export interface CreateAppOptions {
  workspaceDir: string;
  profilePath?: string;
  clientDistDir?: string;
  apiKey?: string;
  proxySecret?: string;
  seedGenerator?: SeedGenerator;
  cellChatGenerator?: CellChatGenerator;
  integrateGenerator?: IntegrateGenerator;
  branchGenerator?: BranchGenerator;
  documentChatGenerator?: DocumentChatGenerator;
  documentIntegrateGenerator?: DocumentIntegrateGenerator;
  documentBranchGenerator?: DocumentBranchGenerator;
  modelId?: string;
}

const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SeedRequestSchema = z.object({
  prompt: z.string().optional().default(''),
  source: SeedSourceInputSchema.optional(),
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

const ReviewRequestSchema = z.object({
  docId: z.string().optional(),
  prompt: z.string().optional(),
});

const UpdateSettingsRequestSchema = z.object({
  modelId: z.string().trim().min(1).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  activeProfileId: PedagogicalProfileIdSchema.optional(),
  customSystemPrompt: z.string().optional(),
});

const SwitchWorkspaceRequestSchema = z.object({
  workspaceDir: z.string().trim().min(1, 'Workspace directory is required'),
});

const UpdateProfileTopicRequestSchema = z.object({
  topic: z.string().trim().min(1, 'Topic is required'),
  status: TopicFamiliaritySchema,
});

const UpdateProfileRequestSchema = z.object({
  background: z.string().optional(),
  learningInstructions: z.string().optional(),
  topics: z.record(z.string(), TopicFamiliaritySchema).optional(),
});

const SetBlockDoneRequestSchema = z.object({
  done: z.boolean(),
  docId: z.string().optional(),
});

const SeedPrerequisiteRequestSchema = z.object({
  topic: z.string().trim().min(1, 'Prerequisite topic is required'),
  parentDocId: z.string().optional(),
});

import * as path from 'node:path';

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const workspaceRootDir = path.resolve(options.workspaceDir);
  const isWithinWorkspaceRoot = (candidateDir: string): boolean => {
    const resolved = path.resolve(workspaceRootDir, candidateDir);
    return (
      resolved === workspaceRootDir ||
      resolved.startsWith(workspaceRootDir + path.sep)
    );
  };

  let store = new WorkspaceStore(workspaceRootDir);
  const resolvedProfilePath =
    options.profilePath ??
    (process.env.VITEST
      ? path.join(workspaceRootDir, '.folio', 'profile.json')
      : undefined);
  const profileStore = new LearnerProfileStore(resolvedProfilePath);
  const knownWorkspaces = new Set<string>([workspaceRootDir]);
  let workspaceInitialized = false;
  const seedGenerator = options.seedGenerator ?? defaultSeedGenerator;
  const cellChatGenerator =
    options.cellChatGenerator ?? defaultCellChatGenerator;
  const integrateGenerator =
    options.integrateGenerator ?? defaultIntegrateGenerator;
  const branchGenerator = options.branchGenerator ?? defaultBranchGenerator;
  const documentChatGenerator =
    options.documentChatGenerator ?? defaultDocumentChatGenerator;
  const documentIntegrateGenerator =
    options.documentIntegrateGenerator ?? defaultDocumentIntegrateGenerator;
  const documentBranchGenerator =
    options.documentBranchGenerator ?? defaultDocumentBranchGenerator;

  const getDefaultModelId = () => options.modelId ?? getActiveModelId();

  const ensureWorkspaceInitialized = async () => {
    if (workspaceInitialized) {
      return;
    }
    workspaceInitialized = true;
    const profile = await profileStore.loadProfile();
    if (profile.workspaces) {
      for (const ws of profile.workspaces) {
        if (isWithinWorkspaceRoot(ws)) {
          knownWorkspaces.add(path.resolve(workspaceRootDir, ws));
        }
      }
    }
    if (profile.workspaceDir && isWithinWorkspaceRoot(profile.workspaceDir)) {
      const resolvedProfileWs = path.resolve(
        workspaceRootDir,
        profile.workspaceDir
      );
      if (resolvedProfileWs !== store.workspaceDir) {
        store = new WorkspaceStore(resolvedProfileWs);
        knownWorkspaces.add(resolvedProfileWs);
      }
    }
  };

  const effectiveApiKey = (
    options.apiKey ??
    (process.env.VITEST ? undefined : process.env.FOLIO_API_KEY)
  )?.trim();
  const effectiveProxySecret = (
    options.proxySecret ??
    (process.env.VITEST ? undefined : process.env.CADDY_PROXY_SECRET)
  )?.trim();

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/health') {
      return next();
    }
    if (!effectiveApiKey) {
      return next();
    }
    const authHeader = c.req.header('Authorization');
    if (authHeader !== undefined) {
      if (authHeader === `Bearer ${effectiveApiKey}`) {
        return next();
      }
      return c.json({ error: 'Unauthorized' }, 401);
    }
    const remoteUser = c.req.header('Remote-User');
    if (Boolean(remoteUser?.trim())) {
      if (!effectiveProxySecret || c.req.header('X-Proxy-Secret') === effectiveProxySecret) {
        return next();
      }
    }
    return c.json({ error: 'Unauthorized' }, 401);
  });

  const handleGetDocMarkdown = async (
    c: Context,
    rawDocId?: string
  ) => {
    await ensureWorkspaceInitialized();
    const loaded = await store.loadDocument(rawDocId);
    if (!loaded.document) {
      return c.json(
        { error: `Document "${rawDocId ?? 'index'}" not found` },
        404
      );
    }

    const filePath = path.join(store.workspaceDir, loaded.document.filename);
    let rawMarkdown: string;
    try {
      rawMarkdown = await fs.readFile(filePath, 'utf8');
    } catch {
      rawMarkdown = loaded.blocks.map((b) => b.markdown).join('\n\n');
    }

    const clean = c.req.query('clean') === 'true';
    const markdown = clean
      ? rawMarkdown
          .replace(/<!--\s*folio:block\b[^>]*-->\r?\n?/g, '')
          .trim()
      : rawMarkdown;

    return c.json({
      docId: loaded.document.id,
      title: loaded.document.title,
      filename: loaded.document.filename,
      markdown,
      blocks: loaded.blocks,
      doneCount: loaded.blocks.filter((b) => b.done).length,
      totalBlocks: loaded.blocks.length,
    });
  };

  app.get('/api/doc/markdown', (c) =>
    handleGetDocMarkdown(c, c.req.query('id'))
  );

  app.get('/api/doc/:id/markdown', (c) =>
    handleGetDocMarkdown(c, c.req.param('id'))
  );

  const handleGetDocSource = async (c: Context, rawDocId?: string) => {
    await ensureWorkspaceInitialized();
    const sourceData = await store.readSourceAttachment(rawDocId);
    if (!sourceData) {
      return c.json(
        {
          error: `Source attachment for document "${rawDocId ?? 'index'}" not found`,
        },
        404
      );
    }

    const { attachment, buffer } = sourceData;
    const contentType =
      attachment.mediaType === 'application/pdf'
        ? 'application/pdf'
        : `${attachment.mediaType}; charset=utf-8`;
    const safeDispositionFilename = attachment.filename.replace(/["\\]/g, '_');

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${safeDispositionFilename}"`,
        'Content-Length': String(buffer.byteLength),
      },
    });
  };

  app.get('/api/doc/source', (c) =>
    handleGetDocSource(c, c.req.query('id'))
  );

  app.get('/api/doc/:id/source', (c) =>
    handleGetDocSource(c, c.req.param('id'))
  );

  app.get('/api/doc', async (c) => {
    await ensureWorkspaceInitialized();
    const docId = c.req.query('id');
    const loaded = await store.loadDocument(docId);
    const settings = await store.getSettings(getDefaultModelId());
    const profile = await profileStore.loadProfile();

    if (!loaded.document) {
      return c.json({
        document: null,
        blocks: [],
        toc: [],
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        ...(options.profilePath || hasLearnerProfileContent(profile)
          ? { profile }
          : {}),
        modelId: settings.modelId,
      });
    }

    return c.json({
      document: loaded.document,
      blocks: loaded.blocks,
      toc: loaded.toc,
      documents: loaded.documents,
      activeChat: loaded.activeChat,
      pendingEdits: loaded.pendingEdits,
      settings,
      workspaceDir: store.workspaceDir,
      workspaces: Array.from(knownWorkspaces),
      profile,
      modelId: settings.modelId,
    });
  });

  app.get('/api/search', async (c) => {
    await ensureWorkspaceInitialized();
    const q = c.req.query('q') ?? '';
    const rawMode = c.req.query('mode') ?? 'hybrid';
    const parsedMode = SearchModeSchema.safeParse(rawMode);
    const mode = parsedMode.success ? parsedMode.data : 'hybrid';
    const rawLimit = c.req.query('limit');
    const limit = rawLimit ? Number.parseInt(rawLimit, 10) : undefined;

    const response = await searchWorkspaceLibrary(store.workspaceDir, q, {
      mode,
      ...(limit && Number.isFinite(limit) ? { limit } : {}),
    });

    return c.json(response);
  });

  app.get('/api/profile', async (c) => {
    const profile = await profileStore.loadProfile();
    return c.json({ profile });
  });

  app.put('/api/profile', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = UpdateProfileRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid profile payload' }, 400);
    }

    const profile = await profileStore.updateAbilityRecord(parsedReq.data);
    return c.json({ profile });
  });

  app.put('/api/profile/topics', async (c) => {
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = UpdateProfileTopicRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid profile topic payload' }, 400);
    }

    const profile = await profileStore.setTopicStatus(
      parsedReq.data.topic,
      parsedReq.data.status
    );
    return c.json({ profile });
  });

  app.post('/api/prerequisites/seed', async (c) => {
    await ensureWorkspaceInitialized();
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SeedPrerequisiteRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Prerequisite topic is required' }, 400);
    }

    const parentDocId = await store.resolveDocId(parsedReq.data.parentDocId);
    const pendingEdits = await store.getPendingEdits(parentDocId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    try {
      const settings = await store.getSettings(getDefaultModelId());
      const currentProfile = await profileStore.loadProfile();

      const existing = await store.findExistingPrerequisiteDocument(
        parentDocId,
        parsedReq.data.topic
      );
      if (existing && existing.document) {
        return c.json({
          document: existing.document,
          blocks: existing.blocks,
          toc: existing.toc,
          documents: existing.documents,
          activeChat: existing.activeChat,
          pendingEdits: existing.pendingEdits,
          settings,
          workspaceDir: store.workspaceDir,
          workspaces: Array.from(knownWorkspaces),
          profile: currentProfile,
          modelId: settings.modelId,
        });
      }

      const relatedLibraryDocs = await store.findRelatedLibraryDocs(
        parsedReq.data.topic,
        [parentDocId]
      );

      const seedResult = SeedResultSchema.parse(
        await seedGenerator(parsedReq.data.topic, {
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(currentProfile)
            ? { learnerProfile: currentProfile }
            : {}),
          ...(relatedLibraryDocs.length > 0 ? { relatedLibraryDocs } : {}),
        })
      );

      const created = await store.branchPrerequisiteDocument(
        parentDocId,
        parsedReq.data.topic,
        seedResult
      );

      const updatedProfile =
        currentProfile.topics[parsedReq.data.topic] === 'known'
          ? currentProfile
          : await profileStore.setTopicStatus(parsedReq.data.topic, 'learning');

      return c.json({
        document: created.document,
        blocks: created.blocks,
        toc: created.toc,
        documents: created.documents,
        activeChat: created.activeChat,
        pendingEdits: created.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile: updatedProfile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to seed prerequisite sub-document';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.put('/api/settings', async (c) => {
    await ensureWorkspaceInitialized();
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = UpdateSettingsRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid settings payload' }, 400);
    }

    const settings = await store.updateSettings(
      parsedReq.data,
      getDefaultModelId()
    );
    return c.json({
      settings,
      modelId: settings.modelId,
    });
  });

  app.get('/api/workspaces', async (c) => {
    await ensureWorkspaceInitialized();
    return c.json({
      workspaceDir: store.workspaceDir,
      workspaces: Array.from(knownWorkspaces),
    });
  });

  app.post('/api/workspaces/switch', async (c) => {
    await ensureWorkspaceInitialized();
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SwitchWorkspaceRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Workspace directory is required' }, 400);
    }

    if (!isWithinWorkspaceRoot(parsedReq.data.workspaceDir)) {
      return c.json(
        {
          error: `Workspace directory must be within ${workspaceRootDir}`,
        },
        400
      );
    }

    const targetDir = path.resolve(
      workspaceRootDir,
      parsedReq.data.workspaceDir
    );
    await fs.mkdir(targetDir, { recursive: true });
    store = new WorkspaceStore(targetDir);
    knownWorkspaces.add(targetDir);
    const profile = await profileStore.setWorkspaceDir(
      targetDir,
      Array.from(knownWorkspaces)
    );
    if (profile.workspaces) {
      for (const ws of profile.workspaces) {
        if (isWithinWorkspaceRoot(ws)) {
          knownWorkspaces.add(path.resolve(workspaceRootDir, ws));
        }
      }
    }

    const loaded = await store.loadDocument();
    const settings = await store.getSettings(getDefaultModelId());

    return c.json({
      document: loaded.document,
      blocks: loaded.blocks,
      toc: loaded.toc,
      documents: loaded.documents,
      activeChat: loaded.activeChat,
      pendingEdits: loaded.pendingEdits,
      settings,
      workspaceDir: store.workspaceDir,
      workspaces: Array.from(knownWorkspaces),
      profile,
      modelId: settings.modelId,
    });
  });

  app.post('/api/doc/seed', async (c) => {
    await ensureWorkspaceInitialized();
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SeedRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json(
        { error: 'Topic prompt or source material is required' },
        400
      );
    }

    const cleanPrompt = parsedReq.data.prompt.trim();
    const source = parsedReq.data.source;
    if (!cleanPrompt && !source) {
      return c.json(
        { error: 'Topic prompt or source material is required' },
        400
      );
    }

    try {
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      if (!source && cleanPrompt) {
        const existing = await store.findExistingRootOrLibraryDocumentByPrompt(
          cleanPrompt
        );
        if (existing && existing.document) {
          return c.json({
            document: existing.document,
            blocks: existing.blocks,
            toc: existing.toc,
            documents: existing.documents,
            activeChat: existing.activeChat,
            pendingEdits: existing.pendingEdits,
            settings,
            workspaceDir: store.workspaceDir,
            workspaces: Array.from(knownWorkspaces),
            profile,
            modelId: settings.modelId,
          });
        }
      }

      const relatedQuery = cleanPrompt || source?.filename || '';
      const relatedLibraryDocs = relatedQuery
        ? await store.findRelatedLibraryDocs(relatedQuery)
        : [];

      const seedResult = SeedResultSchema.parse(
        await seedGenerator(cleanPrompt, {
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(profile)
            ? { learnerProfile: profile }
            : {}),
          ...(relatedLibraryDocs.length > 0 ? { relatedLibraryDocs } : {}),
          ...(source ? { source } : {}),
        })
      );

      const saved = await store.seedRootDocument(seedResult, source);

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to seed topic';
      return c.json({ error: message }, 500);
    }
  });

  app.post('/api/doc/chat', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    try {
      const context = await buildDocumentContext(store, docId);
      const existingChat = await store.getActiveChat(docId);
      const priorMessages: ChatMessage[] =
        existingChat && existingChat.blockId === null
          ? existingChat.messages
          : [];

      const messagesForGenerator: ChatMessage[] = [
        ...priorMessages,
        { role: 'user', content: parsedReq.data.message },
      ];
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const assistantReply = await documentChatGenerator({
        context,
        messages: messagesForGenerator,
        modelId: settings.modelId,
        reasoningEffort: settings.reasoningEffort,
        pedagogicalPrompt: resolvePedagogicalPrompt(settings),
        ...(hasLearnerProfileContent(profile)
          ? { learnerProfile: profile }
          : {}),
      });

      const activeChat = await store.appendChatMessage(
        docId,
        null,
        settings.modelId,
        parsedReq.data.message,
        assistantReply
      );

      return c.json({ activeChat });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process document chat';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.delete('/api/doc/chat', async (c) => {
    await ensureWorkspaceInitialized();
    const docId = await store.resolveDocId(c.req.query('docId'));
    await store.discardChat(docId, null);
    return c.json({ activeChat: null });
  });

  app.post('/api/doc/review', async (c) => {
    await ensureWorkspaceInitialized();
    let rawBody: unknown = {};
    try {
      const text = await c.req.text();
      if (text.trim()) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = ReviewRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid review request' }, 400);
    }

    const docId = await store.resolveDocId(parsedReq.data.docId);
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    try {
      const context = await buildDocumentContext(store, docId);
      const sourceData = await store.readSourceAttachment(docId);
      let source: SeedSourceInput | undefined;
      if (sourceData) {
        const { attachment, buffer } = sourceData;
        if (attachment.mediaType === 'application/pdf') {
          source = {
            filename: attachment.filename,
            mediaType: attachment.mediaType,
            kind: attachment.kind,
            content: buffer.toString('base64'),
            encoding: 'base64',
          };
        } else {
          source = {
            filename: attachment.filename,
            mediaType: attachment.mediaType,
            kind: attachment.kind,
            content: buffer.toString('utf-8'),
            encoding: 'utf-8',
          };
        }
      }

      const userMessage =
        parsedReq.data.prompt?.trim() ||
        'Run a falsification-first Adversarial Spec Review of this entire notebook.';
      const existingChat = await store.getActiveChat(docId);
      const priorMessages: ChatMessage[] =
        existingChat && existingChat.blockId === null
          ? existingChat.messages
          : [];

      const messagesForGenerator: ChatMessage[] = [
        ...priorMessages,
        { role: 'user', content: userMessage },
      ];
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const assistantReply = await documentChatGenerator({
        context,
        messages: messagesForGenerator,
        modelId: settings.modelId,
        reasoningEffort: settings.reasoningEffort,
        pedagogicalPrompt: ADVERSARIAL_REVIEW_INSTRUCTIONS,
        ...(hasLearnerProfileContent(profile)
          ? { learnerProfile: profile }
          : {}),
        ...(source ? { source } : {}),
      });

      const activeChat = await store.appendChatMessage(
        docId,
        null,
        settings.modelId,
        userMessage,
        assistantReply
      );

      return c.json({ activeChat });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to run document adversarial review';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/doc/integrate', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    const activeChat = await store.getActiveChat(docId);
    if (
      !activeChat ||
      activeChat.blockId !== null ||
      activeChat.messages.length === 0
    ) {
      return c.json(
        { error: 'No active notebook chat to integrate' },
        400
      );
    }

    try {
      const context = await buildDocumentContext(store, docId);
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const integrateResult = DocumentIntegrateResultSchema.parse(
        await documentIntegrateGenerator({
          context,
          messages: activeChat.messages,
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(profile)
            ? { learnerProfile: profile }
            : {}),
        })
      );

      const saved = await store.integrateDocumentChat(docId, integrateResult);

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to integrate document chat';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/doc/branch', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    const activeChat = await store.getActiveChat(docId);
    if (
      !activeChat ||
      activeChat.blockId !== null ||
      activeChat.messages.length === 0
    ) {
      return c.json(
        { error: 'No active notebook chat to branch' },
        400
      );
    }

    try {
      const context = await buildDocumentContext(store, docId);
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();
      const chatQuery = activeChat.messages.map((m) => m.content).join(' ');
      const relatedLibraryDocs = await store.findRelatedLibraryDocs(chatQuery, [
        docId,
      ]);

      const branchResult = BranchResultSchema.parse(
        await documentBranchGenerator({
          context,
          messages: activeChat.messages,
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(profile)
            ? { learnerProfile: profile }
            : {}),
          ...(relatedLibraryDocs.length > 0 ? { relatedLibraryDocs } : {}),
        })
      );

      const created = await store.branchDocumentFromDocChat(
        docId,
        branchResult
      );

      return c.json({
        document: created.document,
        blocks: created.blocks,
        toc: created.toc,
        documents: created.documents,
        activeChat: created.activeChat,
        pendingEdits: created.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to branch sub-document';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.delete('/api/doc/:id', async (c) => {
    await ensureWorkspaceInitialized();
    const docId = c.req.param('id');

    try {
      const nextLoaded = await store.deleteDocument(docId);
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: nextLoaded.document,
        blocks: nextLoaded.blocks,
        toc: nextLoaded.toc,
        documents: nextLoaded.documents,
        activeChat: nextLoaded.activeChat,
        pendingEdits: nextLoaded.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete document';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.put('/api/blocks/:id/done', async (c) => {
    await ensureWorkspaceInitialized();
    const blockId = c.req.param('id');
    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON request body' }, 400);
    }

    const parsedReq = SetBlockDoneRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Block done boolean is required' }, 400);
    }

    try {
      const docId = await store.resolveDocId(parsedReq.data.docId);
      const saved = await store.setBlockDone(
        blockId,
        parsedReq.data.done,
        docId
      );
      const settings = await store.getSettings(getDefaultModelId());
      const profile = saved.document
        ? await profileStore.recordDocumentEngagement({
            docId: saved.document.id,
            docTitle: saved.document.title,
            shortTitle: saved.document.shortTitle,
            workspaceDir: store.workspaceDir,
            blocks: saved.blocks,
          })
        : await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to update block done state';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.put('/api/blocks/:id', async (c) => {
    await ensureWorkspaceInitialized();
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
      const docId = await store.resolveDocId(parsedReq.data.docId);
      const saved = await store.updateBlock(
        blockId,
        parsedReq.data.markdown,
        docId
      );
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/split', async (c) => {
    await ensureWorkspaceInitialized();
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
      const docId = await store.resolveDocId(parsedReq.data.docId);
      const saved = await store.splitBlock(blockId, {
        offset: parsedReq.data.offset,
        docId,
      });
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to split block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/merge', async (c) => {
    await ensureWorkspaceInitialized();
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
      const docId = await store.resolveDocId(parsedReq.data.docId);
      const saved = await store.mergeBlockWithNext(blockId, docId);
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to merge block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.delete('/api/blocks/:id', async (c) => {
    await ensureWorkspaceInitialized();
    const blockId = c.req.param('id');
    const docId = await store.resolveDocId(c.req.query('docId'));

    try {
      const saved = await store.deleteBlock(blockId, docId);
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to delete block';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/chat', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
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
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const assistantReply = await cellChatGenerator({
        context,
        messages: messagesForGenerator,
        modelId: settings.modelId,
        reasoningEffort: settings.reasoningEffort,
        pedagogicalPrompt: resolvePedagogicalPrompt(settings),
        ...(hasLearnerProfileContent(profile)
          ? { learnerProfile: profile }
          : {}),
      });

      const activeChat = await store.appendChatMessage(
        docId,
        blockId,
        settings.modelId,
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
    await ensureWorkspaceInitialized();
    const blockId = c.req.param('id');
    const docId = await store.resolveDocId(c.req.query('docId'));

    await store.discardChat(docId, blockId);
    return c.json({ activeChat: null });
  });

  app.post('/api/blocks/:id/review', async (c) => {
    await ensureWorkspaceInitialized();
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

    const parsedReq = ReviewRequestSchema.safeParse(rawBody);
    if (!parsedReq.success) {
      return c.json({ error: 'Invalid review request' }, 400);
    }

    const docId = await store.resolveDocId(parsedReq.data.docId);
    const pendingEdits = await store.getPendingEdits(docId);
    if (pendingEdits.length > 0) {
      return c.json({ error: 'Resolve pending suggested edits first' }, 409);
    }

    try {
      const context = await buildBoundedCellContext(store, docId, blockId);
      const userMessage =
        parsedReq.data.prompt?.trim() ||
        `Run a falsification-first Adversarial Spec Review of Block [${blockId}] in its [N-1, N, N+1] context.`;
      const existingChat = await store.getActiveChat(docId);
      const priorMessages: ChatMessage[] =
        existingChat && existingChat.blockId === blockId
          ? existingChat.messages
          : [];

      const messagesForGenerator: ChatMessage[] = [
        ...priorMessages,
        { role: 'user', content: userMessage },
      ];
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const assistantReply = await cellChatGenerator({
        context,
        messages: messagesForGenerator,
        modelId: settings.modelId,
        reasoningEffort: settings.reasoningEffort,
        pedagogicalPrompt: ADVERSARIAL_REVIEW_INSTRUCTIONS,
        ...(hasLearnerProfileContent(profile)
          ? { learnerProfile: profile }
          : {}),
      });

      const activeChat = await store.appendChatMessage(
        docId,
        blockId,
        settings.modelId,
        userMessage,
        assistantReply
      );

      return c.json({ activeChat });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to run cell adversarial review';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/integrate', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
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
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const integrateResult = IntegrateResultSchema.parse(
        await integrateGenerator({
          context,
          messages: activeChat.messages,
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(profile)
            ? { learnerProfile: profile }
            : {}),
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
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to integrate block chat';
      const status = message.includes('not found') ? 404 : 500;
      return c.json({ error: message }, status);
    }
  });

  app.post('/api/blocks/:id/branch', async (c) => {
    await ensureWorkspaceInitialized();
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

    const docId = await store.resolveDocId(parsedReq.data.docId);
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
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      const initialParentDoc = (await store.loadDocument(docId)).document;
      const initialPrereqDocIds = {
        ...(initialParentDoc?.prerequisiteDocIds ?? {}),
      };
      const chatQuery = activeChat.messages.map((m) => m.content).join(' ');
      const relatedLibraryDocs = await store.findRelatedLibraryDocs(chatQuery, [
        docId,
      ]);

      const branchResult = BranchResultSchema.parse(
        await branchGenerator({
          context,
          messages: activeChat.messages,
          modelId: settings.modelId,
          reasoningEffort: settings.reasoningEffort,
          pedagogicalPrompt: resolvePedagogicalPrompt(settings),
          ...(hasLearnerProfileContent(profile)
            ? { learnerProfile: profile }
            : {}),
          ...(relatedLibraryDocs.length > 0 ? { relatedLibraryDocs } : {}),
        })
      );

      const created = await store.branchDocumentFromChat(
        docId,
        blockId,
        branchResult
      );

      let updatedProfile = profile;
      if (blockId === 'blk_00' || isPrerequisiteBlock(context.targetBlock)) {
        const parentDoc = created.documents[docId];
        const currentPrereqDocIds = parentDoc?.prerequisiteDocIds ?? {};
        for (const [topic, childId] of Object.entries(currentPrereqDocIds)) {
          if (childId !== initialPrereqDocIds[topic]) {
            if (updatedProfile.topics[topic] !== 'known') {
              updatedProfile = await profileStore.setTopicStatus(
                topic,
                'learning'
              );
            }
          }
        }
      }

      return c.json({
        document: created.document,
        blocks: created.blocks,
        toc: created.toc,
        documents: created.documents,
        activeChat: created.activeChat,
        pendingEdits: created.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile: updatedProfile,
        modelId: settings.modelId,
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
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
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
      const settings = await store.getSettings(getDefaultModelId());
      const profile = await profileStore.loadProfile();

      return c.json({
        document: saved.document,
        blocks: saved.blocks,
        toc: saved.toc,
        documents: saved.documents,
        activeChat: saved.activeChat,
        pendingEdits: saved.pendingEdits,
        settings,
        workspaceDir: store.workspaceDir,
        workspaces: Array.from(knownWorkspaces),
        profile,
        modelId: settings.modelId,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to reject pending edit';
      const status = message.includes('not found') ? 404 : 400;
      return c.json({ error: message }, status);
    }
  });

  if (options.clientDistDir) {
    const distRoot = path.resolve(options.clientDistDir);
    app.get('*', async (c) => {
      if (c.req.path === '/api' || c.req.path.startsWith('/api/')) {
        return c.notFound();
      }
      const relPath =
        c.req.path === '/' ? 'index.html' : c.req.path.replace(/^\/+/, '');
      const candidatePath = path.resolve(distRoot, relPath);
      if (
        candidatePath.startsWith(distRoot + path.sep) ||
        candidatePath === distRoot
      ) {
        try {
          const stat = await fs.stat(candidatePath);
          if (stat.isFile()) {
            const ext = path.extname(candidatePath).toLowerCase();
            const contentType =
              STATIC_CONTENT_TYPES[ext] ?? 'application/octet-stream';
            const body = await fs.readFile(candidatePath);
            return new Response(body, {
              status: 200,
              headers: { 'Content-Type': contentType },
            });
          }
        } catch {
          // Fall through to SPA index.html fallback
        }
      }

      const indexHtmlPath = path.join(distRoot, 'index.html');
      try {
        const html = await fs.readFile(indexHtmlPath, 'utf8');
        return c.html(html);
      } catch {
        return c.notFound();
      }
    });
  }

  return app;
}
