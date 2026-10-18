import { z } from 'zod';

export const ConceptBlockSchema = z.object({
  id: z.string(),
  markdown: z.string(),
});

export type ConceptBlock = z.infer<typeof ConceptBlockSchema>;

export const TocItemSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  text: z.string(),
  blockId: z.string(),
});

export type TocItem = z.infer<typeof TocItemSchema>;

export const DocumentNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  filename: z.string(),
  parentId: z.string().nullable(),
  parentBlockId: z.string().nullable(),
  childDocIds: z.array(z.string()),
});

export type DocumentNode = z.infer<typeof DocumentNodeSchema>;

export const PendingSuggestedEditSchema = z.object({
  id: z.string(),
  docId: z.string(),
  blockId: z.string(),
  originalMarkdown: z.string(),
  proposedMarkdown: z.string(),
  reason: z.string(),
  sourceBlockId: z.string(),
});

export type PendingSuggestedEdit = z.infer<typeof PendingSuggestedEditSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const EphemeralChatThreadSchema = z.object({
  docId: z.string(),
  blockId: z.string(),
  modelId: z.string(),
  messages: z.array(ChatMessageSchema),
});

export type EphemeralChatThread = z.infer<typeof EphemeralChatThreadSchema>;

export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high']);

export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const PedagogicalProfileIdSchema = z.enum([
  'intuitive-physical',
  'rigorous-derivation',
  'custom',
]);

export type PedagogicalProfileId = z.infer<typeof PedagogicalProfileIdSchema>;

export const NotebookSettingsSchema = z.object({
  modelId: z.string().default('anthropic:claude-opus-4-6'),
  reasoningEffort: ReasoningEffortSchema.default('high'),
  activeProfileId: PedagogicalProfileIdSchema.default('intuitive-physical'),
  customSystemPrompt: z.string().default(''),
});

export type NotebookSettings = z.infer<typeof NotebookSettingsSchema>;

export const NotebookStateSchema = z.object({
  documents: z.record(z.string(), DocumentNodeSchema),
  pendingEdits: z.array(PendingSuggestedEditSchema).default([]),
  activeChat: EphemeralChatThreadSchema.nullable().optional(),
  settings: NotebookSettingsSchema.optional(),
});

export type NotebookState = z.infer<typeof NotebookStateSchema>;

export const SeedResultSchema = z.object({
  title: z.string(),
  blocks: z.array(z.string()).min(4).max(8),
});

export type SeedResult = z.infer<typeof SeedResultSchema>;

export const IntegrateResultSchema = z.object({
  updatedBlockMarkdown: z.string().nullable(),
  insertedBlocksMarkdown: z.array(z.string()),
  suggestedEdits: z.array(
    z.object({
      targetBlockId: z.string(),
      proposedMarkdown: z.string(),
      reason: z.string(),
    })
  ),
});

export type IntegrateResult = z.infer<typeof IntegrateResultSchema>;
