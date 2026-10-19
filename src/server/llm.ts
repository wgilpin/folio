import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import {
  BranchResultSchema,
  IntegrateResultSchema,
  MultiBranchObjectSchema,
  SeedResultSchema,
  type BranchResult,
  type ChatMessage,
  type IntegrateResult,
  type LearnerProfile,
  type NotebookSettings,
  type PedagogicalProfileId,
  type ReasoningEffort,
  type SeedResult,
} from '../shared/schema.js';
import type { BoundedCellContext } from './context.js';
import { isPrerequisiteBlock } from './markdown.js';

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
}) => Promise<BranchResult>;


export function formatLearnerProfilePrompt(profile?: LearnerProfile): string {
  if (!profile || Object.keys(profile.topics).length === 0) {
    return 'Learner Profile: No prior topics recorded yet. Assume prerequisites are unseen and ground concepts in plain-English intuition before introducing specialist terminology or (when applicable) mathematical formalism.';
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
      `- Known topics (skip basic hand-holding and use standard terminology or formalism directly when referencing these): ${known.join(', ')}`
    );
  }
  if (learning.length > 0) {
    lines.push(
      `- Currently learning (bridge intuition with specialist terminology or formalism carefully): ${learning.join(', ')}`
    );
  }
  return lines.join('\n');
}

export const DEFAULT_MODEL_ID = 'anthropic:claude-opus-4-6';

export const KATEX_MATH_FORMATTING_RULES = [
  'Math & Formalism Policy (Domain-Adaptive):',
  '- ONLY use mathematical equations, symbolic notation, or LaTeX/KaTeX when the topic itself is inherently mathematical, physical, quantitative, or algorithmic (e.g., physics, mathematics, engineering, statistics, formal computer science).',
  '- For non-mathematical or qualitative topics (e.g., psychology, history, geopolitics, misinformation/media studies, philosophy, literature, law, sociology), DO NOT invent artificial mathematical models, state-space vectors, or pseudo-equations. Explain using clear prose, conceptual frameworks, empirical/historical mechanisms, actor incentives, case studies, and domain-appropriate terminology.',
  '- Math Formatting Guidelines (KaTeX): When mathematical notation IS appropriate, all math is rendered using KaTeX in the browser:',
  '  - Never use unsupported LaTeX commands such as \\multicolumn or \\cline in matrices or tables.',
  '  - For multi-term equations or multi-step derivations, split them across multiple lines (e.g. using \\begin{aligned} ... \\end{aligned} with \\\\ breaks) so formulas fit neatly on cards without requiring horizontal scrolling or overflow.',
  '  - Always ensure LaTeX braces and syntax are complete and valid.',
].join('\n');

export const PEDAGOGICAL_PROFILES: Record<
  PedagogicalProfileId,
  { id: PedagogicalProfileId; label: string; instructions: string }
> = {
  'intuitive-physical': {
    id: 'intuitive-physical',
    label: 'Intuitive & Conceptual',
    instructions:
      'Pedagogical Profile (Intuitive & Conceptual): Emphasize big-picture intuition, concrete real-world examples or analogies, and plain-English explanation. Only introduce mathematical formalism if the topic is inherently quantitative; otherwise focus on conceptual frameworks, mental models, and real-world mechanisms.',
  },
  'rigorous-derivation': {
    id: 'rigorous-derivation',
    label: 'Rigorous & Formal',
    instructions:
      'Pedagogical Profile (Rigorous & Formal): Emphasize step-by-step analytical precision, explicit assumptions, mechanisms, and boundary conditions. For mathematical or quantitative topics, provide step-by-step derivations; for qualitative, humanities, or social-science topics, provide rigorous conceptual, historical, or structural analysis without inventing artificial mathematical notation.',
  },
  custom: {
    id: 'custom',
    label: 'Custom Prompt',
    instructions:
      'Pedagogical Profile (Intuitive & Conceptual): Emphasize big-picture intuition, concrete real-world examples or analogies, and plain-English explanation. Only introduce mathematical formalism if the topic is inherently quantitative; otherwise focus on conceptual frameworks, mental models, and real-world mechanisms.',
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
      'You are an editorial notebook author writing for a curious, intelligent learner exploring a subject.',
      pedagogicalPrompt,
      formatLearnerProfilePrompt(options?.learnerProfile),
      KATEX_MATH_FORMATTING_RULES,
      `Reasoning Effort: ${reasoningEffort}`,
      'Generate a clear, descriptive document `title` (the full chapter header for the reading view, faithful to the actual domain of the topic without forcing mathematical framing onto non-mathematical subjects), a concise `shortTitle` (a 2 to 4 word core topic name omitting subtitles, colons, or qualifying scope clauses like "in Special Relativity", used for navigation and filenames), a structured `prerequisites` array of 2 to 5 concise prerequisite topic names, and 4 to 8 self-contained Markdown concept blocks exploring the user topic:',
      '1. The VERY FIRST block (Block 0) MUST start with `## Prerequisites & Foundations` (or `## Prerequisites & Notation` if the topic is mathematical/quantitative). It must list the foundational prerequisites needed to understand this topic (matching `prerequisites`), define key domain concepts or terminology in plain English (and define symbols/notation ONLY if mathematical equations are genuinely used later), and give the intuitive big picture.',
      '2. Subsequent blocks (`## 1. ...`, `## 2. ...`) should build step-by-step from intuition to deeper mechanisms, frameworks, historical/actor analysis, case studies, or (only when the topic is inherently quantitative) formal mathematical derivations, calibrating explanation depth to the Learner Profile.',
      '3. Only include a ```mermaid diagram in a block if a visual diagram genuinely clarifies a structure or flow; most blocks should be clean prose.',
    ].join('\n'),
    prompt: `Seed a notebook document for the topic: ${prompt}`,
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
      'You are an expert tutor answering questions about a specific Concept Block (Block N) inside a structured notebook.',
      'Explain concepts clearly, ground explanations in intuition and concrete examples (and ground equations in intuition when the topic is mathematical), and stay focused on the target block while respecting the surrounding [N-1, N, N+1] context.',
      resolvedPedagogy,
      KATEX_MATH_FORMATTING_RULES,
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
  const isTargetPrereq = isPrerequisiteBlock(context.targetBlock);

  const { object } = await generateObject({
    model,
    schema: IntegrateResultSchema,
    system: [
      'You are an editorial notebook integrator.',
      resolvedPedagogy,
      KATEX_MATH_FORMATTING_RULES,
      `Reasoning Effort: ${reasoningEffort}`,
      'Given a bounded cell context ([N-1, N, N+1] and the Document Table of Contents) and an ephemeral Q&A chat transcript on Target Block N, synthesize the insights from the discussion into clean, self-contained notebook prose:',
      '1. `updatedBlockMarkdown`: Provide the revised Markdown for Target Block N incorporating the clarifications, or `null` if Block N itself does not need changes. IMPORTANT: If Target Block N is the Prerequisites section (`blk_00`), do NOT expand it with explanations, definitions, or derivations—return `null` for `updatedBlockMarkdown` and place the synthesized content into `insertedBlocksMarkdown` to create a new card below. The ONLY time you may expand `blk_00` is when the chat is specifically about adding new prerequisite topics to the prerequisites list.',
      '2. `insertedBlocksMarkdown`: If the chat uncovered one or more distinct new sub-concepts, mechanisms, derivations, or prerequisite explanations that warrant their own Concept Block immediately following Block N—or if Target Block N is the Prerequisites section (`blk_00`) and the chat discusses concepts rather than adding prerequisites—return 1 or more complete Markdown blocks here (each starting with a ## heading); otherwise return an empty array `[]`. IMPORTANT: If the user asked about multiple distinct items or prerequisites in a single chat (e.g., 3 prerequisites), you MUST return a separate Markdown block string in `insertedBlocksMarkdown` for EACH distinct item (e.g., 3 separate array elements), never combining multiple distinct items into a single block.',
      '3. `addedPrerequisites`: Only when Target Block N is the Prerequisites section (`blk_00`) and the chat is adding new prerequisite topics, list the newly added prerequisite topic names here; otherwise omit or return `[]`.',
      '4. `suggestedEdits`: Leave `suggestedEdits` empty (`[]`) UNLESS the changes to Block N or newly inserted blocks introduce a factual contradiction, duplicate explanation, or broken transition in the immediately adjacent blocks (Previous Block N-1 or Next Block N+1). Only target N-1 or N+1 by their exact block ID.',
      ...(isTargetPrereq
        ? [
            'CRITICAL RULE FOR CURRENT TARGET BLOCK (`blk_00` / Prerequisites): Because this chat is in the prerequisites section, you MUST create a new card below via `insertedBlocksMarkdown` and set `updatedBlockMarkdown: null`, UNLESS the user is specifically asking to add more prerequisites to the prerequisites list.',
          ]
        : []),
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
}): Promise<BranchResult> => {
  const model = resolveLanguageModel(modelId);
  const resolvedPedagogy = pedagogicalPrompt ?? resolvePedagogicalPrompt();
  const transcript = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  const { object } = await generateObject({
    model,
    schema: MultiBranchObjectSchema,
    system: [
      'You are an editorial notebook author branching dedicated deep-dive sub-documents from an ephemeral Q&A chat on Target Block N.',
      resolvedPedagogy,
      formatLearnerProfilePrompt(learnerProfile),
      KATEX_MATH_FORMATTING_RULES,
      `Reasoning Effort: ${reasoningEffort}`,
      'Generate one or more deep-dive sub-documents in `branches` to thoroughly unpack the sub-topics explored in the chat:',
      '- If the chat focuses on a single topic/concept, return 1 sub-document in `branches`.',
      '- If the user asked about multiple distinct items, topics, or prerequisites in the chat (e.g., pasted 3 prerequisites and asked for explanations of all 3), return N separate sub-documents in `branches` — one dedicated deep-dive sub-document per distinct item!',
      'For each sub-document in `branches`, provide a clear, descriptive child document `title`, a concise `shortTitle` (a 2 to 4 word core topic name omitting subtitles, colons, or qualifying scope clauses like "in Special Relativity", used for navigation and filenames), a structured `prerequisites` array of 2 to 5 concise prerequisite topic names, and 4 to 8 self-contained Markdown concept blocks:',
      '1. The VERY FIRST block (Block 0) MUST start with `## Prerequisites & Foundations` (or `## Prerequisites & Notation` if the topic is mathematical/quantitative). It must list the foundational prerequisites needed for this deep dive, define key domain concepts or terminology in plain English (and symbols/notation ONLY if mathematical equations are used), and connect to the parent document context.',
      '2. Subsequent blocks (`## 1. ...`, `## 2. ...`) should build step-by-step from intuition to deeper mechanisms, analysis, or (when quantitative) full derivation, preserving the insights from the Q&A transcript without referencing "the chat" or "the user".',
      '3. Only include a ```mermaid diagram in a block if a visual diagram genuinely clarifies a structure or flow; most blocks should be clean prose.',
      '',
      formatBoundedContextPrompt(context),
    ].join('\n'),
    prompt: `Branch new deep-dive sub-document(s) from the following Q&A discussion on Target Block [${context.targetBlock.id}]:\n\n${transcript}`,
  });

  return object;
};

