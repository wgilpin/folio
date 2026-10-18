import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import {
  IntegrateResultSchema,
  SeedResultSchema,
  type ChatMessage,
  type IntegrateResult,
  type LearnerProfile,
  type NotebookSettings,
  type PedagogicalProfileId,
  type ReasoningEffort,
  type SeedResult,
} from '../shared/schema.js';
import type { BoundedCellContext } from './context.js';

export interface SeedGeneratorOptions {
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
  pedagogicalPrompt?: string;
  learnerProfile?: LearnerProfile;
}

export type SeedGenerator = (
  prompt: string,
  options?: SeedGeneratorOptions
) => Promise<SeedResult>;

export type CellChatGenerator = (input: {
  context: BoundedCellContext;
  messages: ChatMessage[];
  modelId: string;
  reasoningEffort?: ReasoningEffort;
  pedagogicalPrompt?: string;
}) => Promise<string>;

export type IntegrateGenerator = (input: {
  context: BoundedCellContext;
  messages: ChatMessage[];
  modelId: string;
  reasoningEffort?: ReasoningEffort;
  pedagogicalPrompt?: string;
}) => Promise<IntegrateResult>;

export type BranchGenerator = (input: {
  context: BoundedCellContext;
  messages: ChatMessage[];
  modelId: string;
  reasoningEffort?: ReasoningEffort;
  pedagogicalPrompt?: string;
  learnerProfile?: LearnerProfile;
}) => Promise<SeedResult>;

export function formatLearnerProfilePrompt(profile?: LearnerProfile): string {
  if (!profile || Object.keys(profile.topics).length === 0) {
    return 'Learner Profile: No prior topics recorded yet. Assume prerequisites are unseen and ground concepts in plain-English intuition before formalism.';
  }

  const known = Object.entries(profile.topics)
    .filter(([, status]) => status === 'known')
    .map(([topic]) => topic);
  const learning = Object.entries(profile.topics)
    .filter(([, status]) => status === 'learning')
    .map(([topic]) => topic);

  const lines = ['Learner Profile (cross-workspace familiarity):'];
  if (known.length > 0) {
    lines.push(
      `- Known topics (skip basic hand-holding and use standard formalism directly when referencing these): ${known.join(', ')}`
    );
  }
  if (learning.length > 0) {
    lines.push(
      `- Currently learning (bridge intuition with formalism carefully): ${learning.join(', ')}`
    );
  }
  return lines.join('\n');
}

export const DEFAULT_MODEL_ID = 'anthropic:claude-opus-4-6';

export const PEDAGOGICAL_PROFILES: Record<
  PedagogicalProfileId,
  { id: PedagogicalProfileId; label: string; instructions: string }
> = {
  'intuitive-physical': {
    id: 'intuitive-physical',
    label: 'Intuitive & Physical',
    instructions:
      'Pedagogical Profile (Intuitive & Physical): Emphasize physical and geometric intuition, concrete real-world analogies, and plain-English explanation before introducing mathematical formalism.',
  },
  'rigorous-derivation': {
    id: 'rigorous-derivation',
    label: 'Rigorous Derivation',
    instructions:
      'Pedagogical Profile (Rigorous Derivation): Emphasize step-by-step mathematical derivations, explicit assumptions, boundary conditions, and formal precision.',
  },
  custom: {
    id: 'custom',
    label: 'Custom Prompt',
    instructions:
      'Pedagogical Profile (Intuitive & Physical): Emphasize physical and geometric intuition, concrete real-world analogies, and plain-English explanation before introducing mathematical formalism.',
  },
};

export function resolvePedagogicalPrompt(
  settings?: Partial<NotebookSettings>
): string {
  const profileId = settings?.activeProfileId ?? 'intuitive-physical';
  if (profileId === 'custom') {
    const custom = settings?.customSystemPrompt?.trim();
    return custom || PEDAGOGICAL_PROFILES['intuitive-physical'].instructions;
  }
  return (
    PEDAGOGICAL_PROFILES[profileId]?.instructions ??
    PEDAGOGICAL_PROFILES['intuitive-physical'].instructions
  );
}

export function getActiveModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env.FOLIO_MODEL?.trim() || DEFAULT_MODEL_ID;
}

export function resolveLanguageModel(modelSpec: string) {
  const [provider, ...rest] = modelSpec.includes(':')
    ? modelSpec.split(':')
    : ['anthropic', modelSpec];
  const modelName = rest.join(':') || 'claude-opus-4-6';

  switch (provider.toLowerCase()) {
    case 'google':
    case 'gemini':
      return google(modelName);
    case 'openai':
      return openai(modelName);
    case 'anthropic':
    default:
      return anthropic(modelName);
  }
}

export function formatBoundedContextPrompt(context: BoundedCellContext): string {
  const tocLines = context.toc
    .map((item) => `${'  '.repeat(item.level - 1)}- [${item.blockId}] ${item.text}`)
    .join('\n');

  const ancestorSection =
    context.ancestorTocs.length > 0
      ? context.ancestorTocs
          .map(
            (anc) =>
              `Ancestor Document (${anc.title}):\n` +
              anc.toc.map((t) => `  - [${t.blockId}] ${t.text}`).join('\n')
          )
          .join('\n\n') + '\n\n'
      : '';

  return [
    `Document: ${context.title} (${context.docId})`,
    ancestorSection + `Current Document Table of Contents:\n${tocLines || '(empty)'}`,
    `Previous Block (N-1): ${
      context.previousBlock
        ? `[${context.previousBlock.id}]\n${context.previousBlock.markdown}`
        : '(none — target is first block)'
    }`,
    `Target Block (N): [${context.targetBlock.id}]\n${context.targetBlock.markdown}`,
    `Next Block (N+1): ${
      context.nextBlock
        ? `[${context.nextBlock.id}]\n${context.nextBlock.markdown}`
        : '(none — target is last block)'
    }`,
  ].join('\n\n');
}

export const defaultSeedGenerator: SeedGenerator = async (
  prompt: string,
  options?: SeedGeneratorOptions
): Promise<SeedResult> => {
  const modelId = options?.modelId ?? getActiveModelId();
  const reasoningEffort = options?.reasoningEffort ?? 'high';
  const pedagogicalPrompt =
    options?.pedagogicalPrompt ?? resolvePedagogicalPrompt();
  const model = resolveLanguageModel(modelId);

  const { object } = await generateObject({
    model,
    schema: SeedResultSchema,
    system: [
      'You are an editorial technical notebook author writing for a curious learner who may not already know the underlying mathematics or specialist notation.',
      pedagogicalPrompt,
      formatLearnerProfilePrompt(options?.learnerProfile),
      `Reasoning Effort: ${reasoningEffort}`,
      'Generate a clear document title, a structured `prerequisites` array of 2 to 5 concise prerequisite topic names, and 4 to 8 self-contained Markdown concept blocks exploring the user topic:',
      '1. The VERY FIRST block (Block 0) MUST start with `## 0. Prerequisites & Notation`. It must list the mathematical and conceptual prerequisites needed to understand this topic (matching `prerequisites`), define every symbol or notation that will appear later in plain English, and give the intuitive picture before any equations are used.',
      '2. Subsequent blocks (`## 1. ...`, `## 2. ...`) should build step-by-step from intuition to formalism, calibrating explanation depth to the Learner Profile.',
      '3. Only include a ```mermaid diagram in a block if a visual diagram genuinely clarifies a structure or flow; most blocks should be clean prose.',
    ].join('\n'),
    prompt: `Seed a technical notebook document for the topic: ${prompt}`,
  });

  return object;
};

export const defaultCellChatGenerator: CellChatGenerator = async ({
  context,
  messages,
  modelId,
  reasoningEffort = 'high',
  pedagogicalPrompt,
}): Promise<string> => {
  const model = resolveLanguageModel(modelId);
  const resolvedPedagogy = pedagogicalPrompt ?? resolvePedagogicalPrompt();
  const { text } = await generateText({
    model,
    system: [
      'You are an expert technical tutor answering questions about a specific Concept Block (Block N) inside a structured notebook.',
      'Explain concepts clearly, ground equations in intuition, and stay focused on the target block while respecting the surrounding [N-1, N, N+1] context.',
      resolvedPedagogy,
      `Reasoning Effort: ${reasoningEffort}`,
      '',
      formatBoundedContextPrompt(context),
    ].join('\n'),
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  return text;
};

export const defaultIntegrateGenerator: IntegrateGenerator = async ({
  context,
  messages,
  modelId,
  reasoningEffort = 'high',
  pedagogicalPrompt,
}): Promise<IntegrateResult> => {
  const model = resolveLanguageModel(modelId);
  const resolvedPedagogy = pedagogicalPrompt ?? resolvePedagogicalPrompt();
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const { object } = await generateObject({
    model,
    schema: IntegrateResultSchema,
    system: [
      'You are an editorial technical notebook integrator.',
      resolvedPedagogy,
      `Reasoning Effort: ${reasoningEffort}`,
      'Given a bounded cell context ([N-1, N, N+1] and the Document Table of Contents) and an ephemeral Q&A chat transcript on Target Block N, synthesize the insights from the discussion into clean, self-contained notebook prose:',
      '1. `updatedBlockMarkdown`: Provide the revised Markdown for Target Block N incorporating the clarifications, or `null` if Block N itself does not need changes.',
      '2. `insertedBlocksMarkdown`: If the chat uncovered a distinct new sub-concept or derivation that warrants its own Concept Block immediately following Block N, return 1 or more complete Markdown blocks here; otherwise return an empty array `[]`.',
      '3. `suggestedEdits`: Leave `suggestedEdits` empty (`[]`) UNLESS the changes to Block N or newly inserted blocks introduce a factual contradiction, duplicate explanation, or broken transition in the immediately adjacent blocks (Previous Block N-1 or Next Block N+1). Only target N-1 or N+1 by their exact block ID.',
      '',
      formatBoundedContextPrompt(context),
    ].join('\n'),
    prompt: `Integrate the following ephemeral chat transcript for Target Block [${context.targetBlock.id}]:\n\n${transcript}`,
  });

  return object;
};

export const defaultBranchGenerator: BranchGenerator = async ({
  context,
  messages,
  modelId,
  reasoningEffort = 'high',
  pedagogicalPrompt,
  learnerProfile,
}): Promise<SeedResult> => {
  const model = resolveLanguageModel(modelId);
  const resolvedPedagogy = pedagogicalPrompt ?? resolvePedagogicalPrompt();
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const { object } = await generateObject({
    model,
    schema: SeedResultSchema,
    system: [
      'You are an editorial technical notebook author branching a dedicated deep-dive sub-document from an ephemeral Q&A chat on Target Block N.',
      resolvedPedagogy,
      formatLearnerProfilePrompt(learnerProfile),
      `Reasoning Effort: ${reasoningEffort}`,
      'Generate a clear, specific child document title, a structured `prerequisites` array of 2 to 5 concise prerequisite topic names, and 4 to 8 self-contained Markdown concept blocks that thoroughly unpack the sub-topic explored in the chat:',
      '1. The VERY FIRST block (Block 0) MUST start with `## 0. Prerequisites & Notation`. It must list the mathematical and conceptual prerequisites needed for this deep dive, define every symbol or notation in plain English, and connect to the parent document context.',
      '2. Subsequent blocks (`## 1. ...`, `## 2. ...`) should build step-by-step from intuition to full derivation or mechanism, preserving the insights from the Q&A transcript without referencing "the chat" or "the user".',
      '3. Only include a ```mermaid diagram in a block if a visual diagram genuinely clarifies a structure or flow; most blocks should be clean prose.',
      '',
      formatBoundedContextPrompt(context),
    ].join('\n'),
    prompt: `Branch a new deep-dive sub-document from the following Q&A discussion on Target Block [${context.targetBlock.id}]:\n\n${transcript}`,
  });

  return object;
};
