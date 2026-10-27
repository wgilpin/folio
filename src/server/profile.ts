import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LearnerProfileSchema,
  getConciseTitle,
  type ConceptBlock,
  type EngagedSourceRecord,
  type LearnerProfile,
  type TopicFamiliarity,
} from '../shared/schema.js';
import { extractToc, isPrerequisiteBlock } from './markdown.js';

export class LearnerProfileStore {
  constructor(
    public readonly profilePath: string = path.join(
      os.homedir(),
      '.folio',
      'profile.json'
    )
  ) {}

  async loadProfile(): Promise<LearnerProfile> {
    try {
      const raw = await fs.readFile(this.profilePath, 'utf-8');
      return LearnerProfileSchema.parse(JSON.parse(raw));
    } catch {
      return { topics: {} };
    }
  }

  async saveProfile(profile: LearnerProfile): Promise<void> {
    const validated = LearnerProfileSchema.parse(profile);
    await fs.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.writeFile(
      this.profilePath,
      JSON.stringify(validated, null, 2) + '\n',
      'utf-8'
    );
  }

  async setTopicStatus(
    topic: string,
    status: TopicFamiliarity
  ): Promise<LearnerProfile> {
    const cleanTopic = topic.trim();
    if (!cleanTopic) {
      throw new Error('Topic name is required');
    }
    const profile = await this.loadProfile();
    profile.topics[cleanTopic] = status;
    await this.saveProfile(profile);
    return profile;
  }

  async updateAbilityRecord(patch: {
    background?: string;
    learningInstructions?: string;
    topics?: Record<string, TopicFamiliarity>;
  }): Promise<LearnerProfile> {
    const profile = await this.loadProfile();
    if (patch.background !== undefined) {
      profile.background = patch.background.trim();
    }
    if (patch.learningInstructions !== undefined) {
      profile.learningInstructions = patch.learningInstructions.trim();
    }
    if (patch.topics !== undefined) {
      for (const [rawTopic, status] of Object.entries(patch.topics)) {
        const cleanTopic = rawTopic.trim();
        if (cleanTopic) {
          profile.topics[cleanTopic] = status;
        }
      }
    }
    await this.saveProfile(profile);
    return profile;
  }

  async recordDocumentEngagement(input: {
    docId: string;
    docTitle: string;
    shortTitle?: string;
    workspaceDir?: string;
    blocks: ConceptBlock[];
  }): Promise<LearnerProfile> {
    const profile = await this.loadProfile();
    const engagedSources: EngagedSourceRecord[] = [
      ...(profile.engagedSources ?? []),
    ];

    const completedBlocks = input.blocks.filter((b) => b.done === true);
    const completedBlockIds = completedBlocks.map((b) => b.id);
    const completedSectionHeadings = extractToc(completedBlocks).map(
      (item) => item.text
    );

    const record: EngagedSourceRecord = {
      docId: input.docId,
      docTitle: input.docTitle,
      ...(input.workspaceDir ? { workspaceDir: input.workspaceDir } : {}),
      completedBlockIds,
      completedSectionHeadings,
      totalBlocks: input.blocks.length,
      updatedAt: new Date().toISOString(),
    };

    const existingIdx = engagedSources.findIndex(
      (s) =>
        s.docId === input.docId &&
        (!input.workspaceDir ||
          !s.workspaceDir ||
          s.workspaceDir === input.workspaceDir)
    );

    if (existingIdx >= 0) {
      engagedSources[existingIdx] = record;
    } else {
      engagedSources.push(record);
    }
    profile.engagedSources = engagedSources;

    const bodyBlocks =
      input.blocks.length > 1 && isPrerequisiteBlock(input.blocks[0])
        ? input.blocks.slice(1)
        : input.blocks;

    const conciseTopic = getConciseTitle(input.docTitle, input.shortTitle);
    const allBodyDone =
      bodyBlocks.length > 0 && bodyBlocks.every((b) => b.done === true);
    const anyDone = completedBlocks.length > 0;

    if (conciseTopic) {
      if (allBodyDone) {
        profile.topics[conciseTopic] = 'known';
      } else if (anyDone) {
        profile.topics[conciseTopic] = 'learning';
      }
    }

    await this.saveProfile(profile);
    return profile;
  }

  async setWorkspaceDir(
    workspaceDir: string,
    workspaces?: string[]
  ): Promise<LearnerProfile> {
    const cleanDir = workspaceDir.trim();
    if (!cleanDir) {
      throw new Error('Workspace directory is required');
    }
    const profile = await this.loadProfile();
    profile.workspaceDir = cleanDir;
    const merged = new Set<string>([
      ...(profile.workspaces ?? []),
      ...(workspaces ?? []),
      cleanDir,
    ]);
    profile.workspaces = Array.from(merged);
    await this.saveProfile(profile);
    return profile;
  }
}
