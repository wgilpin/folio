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
    system:
      'You are an editorial technical notebook author. Generate a clear document title and 4 to 8 self-contained Markdown concept blocks exploring the user topic. Each concept block should start with a ## or ### heading, explain a distinct concept rigorously, and include a ```mermaid diagram where a visual relationship or flow clarifies the concept.',
    prompt: `Seed a technical notebook document for the topic: ${prompt}`,
  });

  return object;
};
