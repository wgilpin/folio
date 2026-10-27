import {
  LearnerProfileSchema,
  SearchResponseSchema,
  type ConceptBlock,
  type DocumentNode,
  type LearnerProfile,
  type SearchMode,
  type SearchResponse,
} from '../shared/schema.js';

export interface FolioSkillClientOptions {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

export function formatAbilityRecordSummary(profile: LearnerProfile): string {
  const lines: string[] = ['# Folio Learner Ability Record'];

  if (profile.background?.trim()) {
    lines.push('', '## Background', profile.background.trim());
  }

  if (profile.learningInstructions?.trim()) {
    lines.push(
      '',
      '## Standing Learning Instructions',
      profile.learningInstructions.trim()
    );
  }

  const entries = Object.entries(profile.topics ?? {});
  const known = entries
    .filter(([, status]) => status === 'known')
    .map(([topic]) => topic);
  const learning = entries
    .filter(([, status]) => status === 'learning')
    .map(([topic]) => topic);
  const unseen = entries
    .filter(([, status]) => status === 'unseen')
    .map(([topic]) => topic);

  if (known.length > 0 || learning.length > 0 || unseen.length > 0) {
    lines.push('', '## Topics');
    if (known.length > 0) {
      lines.push(`- **Known:** ${known.join(', ')}`);
    }
    if (learning.length > 0) {
      lines.push(`- **Learning:** ${learning.join(', ')}`);
    }
    if (unseen.length > 0) {
      lines.push(`- **Unseen:** ${unseen.join(', ')}`);
    }
  }

  if (profile.engagedSources && profile.engagedSources.length > 0) {
    lines.push('', '## Engaged Sources & Completed Sections');
    for (const src of profile.engagedSources) {
      const doneCount = src.completedBlockIds.length;
      const headings =
        src.completedSectionHeadings.length > 0
          ? `: ${src.completedSectionHeadings.join(', ')}`
          : '';
      lines.push(
        `- **${src.docTitle}** (${doneCount}/${src.totalBlocks} blocks done)${headings}`
      );
    }
  }

  return lines.join('\n');
}

export class FolioSkillClient {
  readonly baseUrl: string;
  readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FolioSkillClientOptions = {}) {
    const rawUrl =
      options.baseUrl ?? process.env.FOLIO_URL ?? 'https://folio.teleosis.ai';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.apiKey =
      options.apiKey ??
      process.env.TELEOSIS_API_KEY ??
      process.env.FOLIO_API_KEY;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey?.trim()) {
      headers.Authorization = `Bearer ${this.apiKey.trim()}`;
    }
    return headers;
  }

  private async requestJson<T>(pathname: string): Promise<T> {
    const url = `${this.baseUrl}${pathname}`;
    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Folio API request failed (${res.status}) for ${pathname}: ${body}`
      );
    }
    return (await res.json()) as T;
  }

  async getAbilityRecord(): Promise<{
    profile: LearnerProfile;
    summary: string;
  }> {
    const data = await this.requestJson<{ profile: unknown }>('/api/profile');
    const profile = LearnerProfileSchema.parse(data.profile ?? {});
    return {
      profile,
      summary: formatAbilityRecordSummary(profile),
    };
  }

  async searchLibrary(
    query: string,
    mode: SearchMode = 'hybrid',
    limit = 10
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      q: query,
      mode,
      limit: String(limit),
    });
    const data = await this.requestJson<unknown>(
      `/api/search?${params.toString()}`
    );
    return SearchResponseSchema.parse(data);
  }

  async listDocuments(): Promise<{
    document: DocumentNode | null;
    documents: Record<string, DocumentNode>;
    workspaceDir: string;
  }> {
    const data = await this.requestJson<{
      document?: DocumentNode | null;
      documents?: Record<string, DocumentNode>;
      workspaceDir?: string;
    }>('/api/doc');
    return {
      document: data.document ?? null,
      documents: data.documents ?? {},
      workspaceDir: data.workspaceDir ?? '',
    };
  }

  async getDocumentMarkdown(
    docId: string,
    options: { clean?: boolean } = { clean: true }
  ): Promise<{
    docId: string;
    title: string;
    filename: string;
    markdown: string;
    blocks: ConceptBlock[];
    doneCount: number;
    totalBlocks: number;
  }> {
    const cleanParam = options.clean !== false ? 'true' : 'false';
    return this.requestJson(
      `/api/doc/${encodeURIComponent(docId)}/markdown?clean=${cleanParam}`
    );
  }
}
