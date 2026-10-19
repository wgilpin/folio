import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  LearnerProfileSchema,
  type LearnerProfile,
  type TopicFamiliarity,
} from '../shared/schema.js';

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
