import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { SeedResultSchema, type SeedResult } from '../shared/schema.js';

export type SeedGenerator = (prompt: string) => Promise<SeedResult>;

export const DEFAULT_MODEL_ID = 'anthropic:claude-opus-4-6';

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

export const defaultSeedGenerator: SeedGenerator = async (
  prompt: string
): Promise<SeedResult> => {
  const modelId = getActiveModelId();
  const model = resolveLanguageModel(modelId);

  const { object } = await generateObject({
    model,
    schema: SeedResultSchema,
    system: [
      'You are an editorial technical notebook author writing for a curious learner who may not already know the underlying mathematics or specialist notation.',
      'Generate a clear document title and 4 to 8 self-contained Markdown concept blocks exploring the user topic:',
      '1. The VERY FIRST block (Block 0) MUST start with `## 0. Prerequisites & Notation`. It must list the mathematical and conceptual prerequisites needed to understand this topic, define every symbol or notation that will appear later in plain English, and give the intuitive picture before any equations are used.',
      '2. Subsequent blocks (`## 1. ...`, `## 2. ...`) should build step-by-step from intuition to formalism, explaining what each equation physically or conceptually means in plain words rather than assuming prior familiarity.',
      '3. Only include a ```mermaid diagram in a block if a visual diagram genuinely clarifies a structure or flow; most blocks should be clean prose.',
    ].join('\n'),
    prompt: `Seed a technical notebook document for the topic: ${prompt}`,
  });

  return object;
};
