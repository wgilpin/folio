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

export const TopicFamiliaritySchema = z.enum(['unseen', 'learning', 'known']);

export type TopicFamiliarity = z.infer<typeof TopicFamiliaritySchema>;

export const LearnerProfileSchema = z.object({
  topics: z.record(z.string(), TopicFamiliaritySchema).default({}),
  workspaceDir: z.string().optional(),
  workspaces: z.array(z.string()).optional(),
});

export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

export const DocumentNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  shortTitle: z.string().optional(),
  filename: z.string(),
  parentId: z.string().nullable(),
  parentBlockId: z.string().nullable(),
  childDocIds: z.array(z.string()),
  prerequisites: z.array(z.string()).optional(),
  prerequisiteDocIds: z.record(z.string(), z.string()).optional(),
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
  blockId: z.string().nullable(),
  modelId: z.string(),
  messages: z.array(ChatMessageSchema),
});

export type EphemeralChatThread = z.infer<typeof EphemeralChatThreadSchema>;

export const DocumentIntegrateBlockUpdateSchema = z.object({
  blockId: z.string(),
  updatedMarkdown: z.string(),
  reason: z.string(),
});

export type DocumentIntegrateBlockUpdate = z.infer<
  typeof DocumentIntegrateBlockUpdateSchema
>;

export const DocumentIntegrateResultSchema = z.object({
  updatedBlocks: z.array(DocumentIntegrateBlockUpdateSchema).default([]),
  insertedBlocksMarkdown: z.array(z.string()).default([]),
});

export type DocumentIntegrateResult = z.infer<
  typeof DocumentIntegrateResultSchema
>;

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
  activeDocId: z.string().optional(),
  topicDocIds: z.record(z.string(), z.string()).optional(),
});

export type NotebookState = z.infer<typeof NotebookStateSchema>;

export const SeedResultSchema = z.object({
  title: z.string().describe('Full chapter header for the reading view'),
  shortTitle: z
    .string()
    .optional()
    .describe(
      'Concise 2 to 4 word core topic name omitting subtitles or colons, used for navigation and filenames'
    ),
  toc: z
    .array(z.string())
    .optional()
    .describe(
      'Planned Table of Contents: ordered list of numbered body section headings (e.g. "1. ...", "2. ...") that this document itself will explain in blocks[1..N]'
    ),
  prerequisites: z
    .array(z.string())
    .optional()
    .describe(
      '2 to 5 upstream background topics assumed BEFORE reading this document. Prerequisites may be referenced or applied in the body, but must NOT be topics that a section in `toc` is dedicated to explaining in detail.'
    ),
  blocks: z
    .array(z.string())
    .min(4)
    .max(8)
    .describe(
      'Self-contained Markdown concept blocks: Block 0 is "## Prerequisites & Foundations" (listing only upstream `prerequisites`, never defining concepts that have a dedicated section in `toc` explaining them), followed by the body blocks matching `toc`.'
    ),
});

export type SeedResult = z.infer<typeof SeedResultSchema>;

export function getConciseTitle(title: string, shortTitle?: string): string {
  if (shortTitle && shortTitle.trim()) {
    return shortTitle.trim();
  }
  let concise = title.trim();
  if (concise.includes(':')) {
    concise = concise.split(':')[0].trim();
  }
  concise = concise.replace(
    /\s+(?:in|for)\s+[A-Z][a-zA-Z0-9\s]*$/,
    (match) => {
      const prefix = concise.slice(0, concise.length - match.length).trim();
      if (prefix.split(/\s+/).length >= 2 || prefix.length >= 10) {
        return '';
      }
      return match;
    }
  );
  return concise.trim() || title.trim();
}

export const MultiBranchObjectSchema = z.object({
  branches: z.array(SeedResultSchema).min(1).max(6),
});

export const BranchResultSchema = z.union([
  SeedResultSchema,
  MultiBranchObjectSchema,
  z.array(SeedResultSchema).min(1).max(6),
]);

export type BranchResult = z.infer<typeof BranchResultSchema>;


export const IntegrateResultSchema = z.object({
  updatedBlockMarkdown: z.string().nullable(),
  insertedBlocksMarkdown: z.array(z.string()),
  addedPrerequisites: z.array(z.string()).optional(),
  suggestedEdits: z.array(
    z.object({
      targetBlockId: z.string(),
      proposedMarkdown: z.string(),
      reason: z.string(),
    })
  ),
});

export type IntegrateResult = z.infer<typeof IntegrateResultSchema>;

export const SearchModeSchema = z.enum(['hybrid', 'fts', 'semantic']);

export type SearchMode = z.infer<typeof SearchModeSchema>;

export const SearchResultItemSchema = z.object({
  docId: z.string(),
  docTitle: z.string(),
  blockId: z.string(),
  heading: z.string().nullable(),
  snippet: z.string(),
  score: z.number(),
  matchType: z.enum(['fts', 'semantic', 'hybrid']),
});

export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;

export const SearchResponseSchema = z.object({
  query: z.string(),
  mode: SearchModeSchema,
  results: z.array(SearchResultItemSchema),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

export const RelatedLibraryDocSchema = z.object({
  docId: z.string(),
  title: z.string(),
  filename: z.string(),
  summary: z.string(),
});

export type RelatedLibraryDoc = z.infer<typeof RelatedLibraryDocSchema>;

