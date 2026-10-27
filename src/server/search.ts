import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  SearchModeSchema,
  type ConceptBlock,
  type SearchMode,
  type SearchResponse,
  type SearchResultItem,
} from '../shared/schema.js';
import {
  ensureSqliteMigratedAndLoadState,
  initializeSchema,
  LIBRARY_SQLITE_FILENAME,
} from './db.js';
import { extractToc, parseMarkdownBlocks } from './markdown.js';

const EMBEDDING_DIM = 256;

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'that',
  'with',
  'from',
  'this',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'not',
  'but',
  'what',
  'when',
  'where',
  'which',
  'who',
  'how',
  'why',
  'into',
  'onto',
  'upon',
  'does',
  'can',
  'will',
  'its',
]);

// Domain & mathematical concept groups for semantic equivalence expansion
const CONCEPT_CLUSTERS: string[][] = [
  [
    'symmetry',
    'symmetries',
    'invariance',
    'invariant',
    'transformation',
    'transformations',
    'noether',
    'noethers',
    'conserved',
    'conservation',
    'current',
    'laws',
    'quantities',
    'quantity',
    'continuous',
    'differentiable',
    'lie',
  ],
  [
    'lagrangian',
    'kinetic',
    'potential',
    'energy',
    'minus',
    'difference',
    'mathcal_l',
    't_minus_v',
  ],
  [
    'action',
    'stationary',
    'extremum',
    'least',
    'variational',
    'variation',
    'delta_s',
    'euler',
    'lagrange',
    'trajectory',
    'path',
    'functional',
  ],
  [
    'hamiltonian',
    'legendre',
    'canonical',
    'momenta',
    'momentum',
    'conjugate',
    'phase',
    'space',
    'generalized',
    'velocity',
    'velocities',
    'coordinate',
    'coordinates',
    'cyclic',
  ],
  [
    'eigenvalue',
    'eigenvalues',
    'eigenvector',
    'eigenvectors',
    'spectrum',
    'spectral',
    'diagonalization',
    'operator',
    'hermitian',
    'matrix',
    'linear',
  ],
  [
    'gradient',
    'divergence',
    'curl',
    'laplacian',
    'nabla',
    'partial',
    'derivative',
    'derivatives',
    'differential',
    'calculus',
    'manifold',
    'tangent',
  ],
  [
    'probability',
    'distribution',
    'gaussian',
    'normal',
    'variance',
    'expectation',
    'stochastic',
    'random',
    'entropy',
    'bayesian',
    'posterior',
    'prior',
  ],
];

export function stemToken(word: string): string {
  let w = word.toLowerCase().replace(/^'+|'+$/g, '');
  if (w.endsWith("'s")) {
    w = w.slice(0, -2);
  }
  if (w.length > 5 && w.endsWith('ies')) {
    return w.slice(0, -3) + 'y';
  }
  if (w.length > 6 && w.endsWith('ation')) {
    return w.slice(0, -5);
  }
  if (w.length > 6 && w.endsWith('itions')) {
    return w.slice(0, -6);
  }
  if (w.length > 5 && w.endsWith('ing')) {
    return w.slice(0, -3);
  }
  if (w.length > 4 && w.endsWith('ed')) {
    return w.slice(0, -2);
  }
  if (w.length > 4 && w.endsWith('es')) {
    return w.slice(0, -2);
  }
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) {
    return w.slice(0, -1);
  }
  return w;
}

export function extractLatexTokens(text: string): string[] {
  const tokens: string[] = [];
  const commandRegex = /\\([a-zA-Z]+)(?:\{([^}]*)\})?/g;
  let match: RegExpExecArray | null;
  while ((match = commandRegex.exec(text)) !== null) {
    const cmd = match[1].toLowerCase();
    const arg = match[2]?.trim().toLowerCase();
    tokens.push(`latex_${cmd}`);
    if (arg) {
      tokens.push(`latex_${cmd}_${arg.replace(/[^a-z0-9]+/g, '_')}`);
      tokens.push(arg);
    }
  }
  if (/\\mathcal\{L\}\s*(?:\([^)]*\))?\s*=\s*T\s*-\s*V/i.test(text)) {
    tokens.push('latex_lagrangian_t_minus_v', 't_minus_v', 'mathcal_l');
  }
  if (/\\delta\s*S\s*=\s*0/i.test(text)) {
    tokens.push('latex_stationary_action_delta_s_0', 'delta_s');
  }
  return tokens;
}

export function buildFtsTokens(
  text: string,
  heading?: string | null,
  _docTitle?: string | null
): string {
  const combined = [heading ?? '', text].join(' ');
  const latexTokens = extractLatexTokens(combined);
  const words = combined
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9\\]+/)
    .map((w) => w.replace(/^\\+/, '').trim())
    .filter((w) => w.length > 0);

  const stemmed = words.map((w) => stemToken(w)).filter((w) => w.length > 0);
  const all = Array.from(new Set([...words, ...stemmed, ...latexTokens]));
  return all.join(' ');
}

function fnv1aHash(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function addFeatureToVector(vec: Float64Array, feature: string, weight: number): void {
  const h1 = fnv1aHash(feature, 2166136261);
  const h2 = fnv1aHash(feature, 374761393);
  const idx1 = h1 % EMBEDDING_DIM;
  const sign1 = (h1 & 1) === 0 ? 1 : -1;
  vec[idx1] += sign1 * weight;

  const idx2 = h2 % EMBEDDING_DIM;
  const sign2 = (h2 & 2) === 0 ? 1 : -1;
  vec[idx2] += sign2 * weight * 0.5;
}

export function computeSemanticEmbedding(
  markdown: string,
  heading?: string | null,
  docTitle?: string | null
): number[] {
  const vec = new Float64Array(EMBEDDING_DIM);
  const blockText = [heading ?? '', markdown].join(' ');
  const combined = [docTitle ?? '', blockText].join(' ');

  const rawWords = blockText
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const titleWords = (docTitle ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

  const stems = rawWords.map((w) => stemToken(w));
  const latexTokens = extractLatexTokens(blockText);

  // 1. Word and stem features (block content weighted strongly, docTitle lightly)
  for (const w of rawWords) {
    addFeatureToVector(vec, `w:${w}`, 1.0);
  }
  for (const tw of titleWords) {
    addFeatureToVector(vec, `w:${tw}`, 0.25);
    addFeatureToVector(vec, `s:${stemToken(tw)}`, 0.25);
  }
  for (const s of stems) {
    addFeatureToVector(vec, `s:${s}`, 1.25);
    // Character 4-grams for morphological resilience
    if (s.length >= 4) {
      for (let i = 0; i <= s.length - 4; i++) {
        addFeatureToVector(vec, `g4:${s.slice(i, i + 4)}`, 0.35);
      }
    }
  }

  // 2. Word bigrams
  for (let i = 0; i < stems.length - 1; i++) {
    addFeatureToVector(vec, `bi:${stems[i]}_${stems[i + 1]}`, 0.8);
  }

  // 3. LaTeX command features
  for (const lt of latexTokens) {
    addFeatureToVector(vec, `l:${lt}`, 1.6);
  }

  // 4. Domain concept cluster activation from the block's own text
  const tokenSet = new Set([...rawWords, ...stems, ...latexTokens]);
  CONCEPT_CLUSTERS.forEach((cluster, clusterIdx) => {
    let hits = 0;
    for (const term of cluster) {
      if (tokenSet.has(term) || tokenSet.has(stemToken(term))) {
        hits += 1;
      }
    }
    if (hits > 0) {
      const clusterWeight = Math.min(3.5, 1.4 + hits * 0.7);
      addFeatureToVector(vec, `concept_cluster_${clusterIdx}`, clusterWeight);
      for (const term of cluster) {
        addFeatureToVector(vec, `s:${stemToken(term)}`, 0.45 * hits);
      }
    }
  });

  // Normalize to unit L2 norm
  let normSq = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq);
  if (norm > 1e-9) {
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      vec[i] = Number((vec[i] / norm).toFixed(6));
    }
  }

  return Array.from(vec);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 1e-9 ? dot / denom : 0;
}

export function buildBlockSnippet(markdown: string, query: string): string {
  // Remove leading markdown heading line if there is body content beneath it
  const lines = markdown
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const bodyLines =
    lines.length > 1 && /^#{1,6}\s+/.test(lines[0]) ? lines.slice(1) : lines;
  const fullText = bodyLines.join(' ').replace(/\s+/g, ' ').trim();
  if (fullText.length <= 180) {
    return fullText;
  }

  const lowerText = fullText.toLowerCase();
  const queryTerms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  let bestPos = -1;
  for (const term of queryTerms) {
    const pos = lowerText.indexOf(term);
    if (pos !== -1) {
      bestPos = pos;
      break;
    }
  }

  if (bestPos === -1 || bestPos < 60) {
    return `${fullText.slice(0, 177).trim()}...`;
  }

  const start = Math.max(0, bestPos - 40);
  const end = Math.min(fullText.length, start + 170);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < fullText.length ? '...' : '';
  return `${prefix}${fullText.slice(start, end).trim()}${suffix}`;
}

function hydrateMissingDocumentBlocks(
  workspaceDir: string,
  db: DatabaseSync
): void {
  const docRows = db
    .prepare('SELECT id, title, filename FROM documents')
    .all() as Array<{ id: string; title: string; filename: string }>;

  const existingBlockCounts = new Map<string, number>();
  const countRows = db
    .prepare('SELECT doc_id, COUNT(*) as cnt FROM blocks GROUP BY doc_id')
    .all() as Array<{ doc_id: string; cnt: number }>;
  for (const r of countRows) {
    existingBlockCounts.set(r.doc_id, Number(r.cnt));
  }

  const insertBlock = db.prepare(`
    INSERT OR REPLACE INTO blocks (
      doc_id,
      block_id,
      sort_order,
      markdown,
      heading,
      embedding_json
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  const deleteFts = db.prepare(
    'DELETE FROM blocks_fts WHERE doc_id = ? AND block_id = ?'
  );
  const insertFts = db.prepare(`
    INSERT INTO blocks_fts (doc_id, block_id, heading, markdown, tokens)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const doc of docRows) {
    if ((existingBlockCounts.get(doc.id) ?? 0) > 0) {
      continue;
    }
    const filePath = path.join(workspaceDir, doc.filename);
    if (!fsSync.existsSync(filePath)) {
      continue;
    }
    try {
      const rawMd = fsSync.readFileSync(filePath, 'utf-8');
      const blocks: ConceptBlock[] = parseMarkdownBlocks(rawMd);
      blocks.forEach((block, idx) => {
        const heading = extractToc([block])[0]?.text ?? null;
        const embedding = computeSemanticEmbedding(
          block.markdown,
          heading,
          doc.title
        );
        const ftsTokens = buildFtsTokens(block.markdown, heading, doc.title);
        insertBlock.run(
          doc.id,
          block.id,
          idx,
          block.markdown,
          heading,
          JSON.stringify(embedding)
        );
        deleteFts.run(doc.id, block.id);
        insertFts.run(doc.id, block.id, heading ?? '', block.markdown, ftsTokens);
      });
    } catch {
      // Ignore unreadable markdown file
    }
  }
}

export async function searchWorkspaceLibrary(
  workspaceDir: string,
  rawQuery: string,
  options?: {
    mode?: SearchMode;
    limit?: number;
  }
): Promise<SearchResponse> {
  const mode = SearchModeSchema.parse(options?.mode ?? 'hybrid');
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50));
  const query = rawQuery.trim();

  if (!query) {
    return { query: '', mode, results: [] };
  }

  await ensureSqliteMigratedAndLoadState(workspaceDir);

  const sqlitePath = path.join(workspaceDir, '.folio', LIBRARY_SQLITE_FILENAME);
  if (!fsSync.existsSync(sqlitePath)) {
    return { query, mode, results: [] };
  }

  const db = new DatabaseSync(sqlitePath);
  try {
    initializeSchema(db);
    hydrateMissingDocumentBlocks(workspaceDir, db);

    const allRows = db
      .prepare(
        `SELECT
          b.doc_id,
          d.title AS doc_title,
          b.block_id,
          b.sort_order,
          b.markdown,
          b.heading,
          b.embedding_json
        FROM blocks b
        INNER JOIN documents d ON d.id = b.doc_id
        ORDER BY d.sort_order ASC, b.sort_order ASC`
      )
      .all() as Array<{
      doc_id: string;
      doc_title: string;
      block_id: string;
      sort_order: number;
      markdown: string;
      heading: string | null;
      embedding_json: string | null;
    }>;

    if (allRows.length === 0) {
      return { query, mode, results: [] };
    }

    // 1. Compute FTS5 / keyword+LaTeX scores
    const ftsScores = new Map<string, number>();

    const queryFtsTerms = buildFtsTokens(query)
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9_]/gi, '').trim())
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

    if (queryFtsTerms.length > 0) {
      const ftsMatchExpr = queryFtsTerms
        .map((t) => `"${t}"*`)
        .join(' OR ');
      try {
        const ftsRows = db
          .prepare(
            `SELECT
              doc_id,
              block_id,
              bm25(blocks_fts, 0.0, 0.0, 3.0, 2.0, 1.5) AS rank
            FROM blocks_fts
            WHERE blocks_fts MATCH ?
            ORDER BY rank ASC`
          )
          .all(ftsMatchExpr) as Array<{
          doc_id: string;
          block_id: string;
          rank: number;
        }>;

        for (const row of ftsRows) {
          const key = `${row.doc_id}::${row.block_id}`;
          const positiveScore = 1 / (1 + Math.max(0, Math.abs(row.rank) * 0.1));
          ftsScores.set(key, Math.max(ftsScores.get(key) ?? 0, positiveScore));
        }
      } catch {
        // Fallback if FTS query syntax rejects special tokens
      }
    }

    // Direct substring / LaTeX / token overlap boost for FTS accuracy
    const normalizedQueryLower = query.toLowerCase();
    const rawQueryTokens = normalizedQueryLower
      .replace(/['’]/g, '')
      .split(/[^a-z0-9\\]+/)
      .map((t) => t.replace(/^\\+/, '').trim())
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
    const queryLatexTokens = extractLatexTokens(query);

    for (const row of allRows) {
      const key = `${row.doc_id}::${row.block_id}`;
      const blockLower = [row.heading ?? '', row.markdown]
        .join('\n')
        .toLowerCase();
      const headingLower = (row.heading ?? '').toLowerCase();
      const titleLower = row.doc_title.toLowerCase();

      let lexicalBoost = 0;

      if (headingLower.includes(normalizedQueryLower)) {
        lexicalBoost += 2.2;
      } else if (blockLower.includes(normalizedQueryLower)) {
        lexicalBoost += 1.6;
      } else if (
        titleLower.includes(normalizedQueryLower) &&
        row.block_id !== 'blk_00'
      ) {
        lexicalBoost += 0.35;
      }

      if (rawQueryTokens.length > 0) {
        let matchedBlockTokens = 0;
        let matchedTitleTokens = 0;
        for (const qt of rawQueryTokens) {
          const stemmedQt = stemToken(qt);
          if (
            blockLower.includes(qt) ||
            (stemmedQt.length >= 3 && blockLower.includes(stemmedQt))
          ) {
            matchedBlockTokens += 1;
          } else if (
            titleLower.includes(qt) ||
            (stemmedQt.length >= 3 && titleLower.includes(stemmedQt))
          ) {
            matchedTitleTokens += 1;
          }
        }
        if (matchedBlockTokens > 0) {
          lexicalBoost += (matchedBlockTokens / rawQueryTokens.length) * 1.2;
        } else if (matchedTitleTokens > 0 && row.block_id !== 'blk_00') {
          lexicalBoost += (matchedTitleTokens / rawQueryTokens.length) * 0.25;
        }
      }

      if (queryLatexTokens.length > 0) {
        const blockLatex = new Set(extractLatexTokens(row.markdown));
        let matchedLatex = 0;
        for (const lt of queryLatexTokens) {
          if (blockLatex.has(lt)) {
            matchedLatex += 1;
          }
        }
        if (matchedLatex > 0) {
          lexicalBoost += (matchedLatex / queryLatexTokens.length) * 1.6;
        }
      }

      if (lexicalBoost > 0) {
        ftsScores.set(key, (ftsScores.get(key) ?? 0) + lexicalBoost);
      }
    }

    // 2. Compute Semantic similarity scores
    const queryEmbedding = computeSemanticEmbedding(query);
    const semanticScores = new Map<string, number>();

    for (const row of allRows) {
      const key = `${row.doc_id}::${row.block_id}`;
      let blockEmbedding: number[];
      if (row.embedding_json) {
        try {
          blockEmbedding = JSON.parse(row.embedding_json) as number[];
        } catch {
          blockEmbedding = computeSemanticEmbedding(
            row.markdown,
            row.heading,
            row.doc_title
          );
        }
      } else {
        blockEmbedding = computeSemanticEmbedding(
          row.markdown,
          row.heading,
          row.doc_title
        );
      }

      const sim = cosineSimilarity(queryEmbedding, blockEmbedding);
      if (sim > 0.05) {
        semanticScores.set(key, sim);
      }
    }

    // 3. Combine according to requested mode
    const results: SearchResultItem[] = [];

    for (const row of allRows) {
      const key = `${row.doc_id}::${row.block_id}`;
      const ftsScore = ftsScores.get(key) ?? 0;
      const semScore = semanticScores.get(key) ?? 0;

      let finalScore = 0;
      let matchType: 'fts' | 'semantic' | 'hybrid' = mode;

      if (mode === 'fts') {
        if (ftsScore <= 0) continue;
        finalScore = ftsScore;
        matchType = 'fts';
      } else if (mode === 'semantic') {
        if (semScore <= 0.08) continue;
        finalScore = semScore;
        matchType = 'semantic';
      } else {
        if (ftsScore <= 0 && semScore <= 0.12) continue;
        finalScore = ftsScore * 0.65 + semScore * 0.35;
        matchType =
          ftsScore > 0 && semScore > 0.12
            ? 'hybrid'
            : ftsScore > 0
              ? 'fts'
              : 'semantic';
      }

      results.push({
        docId: row.doc_id,
        docTitle: row.doc_title,
        blockId: row.block_id,
        heading: row.heading ?? null,
        snippet: buildBlockSnippet(row.markdown, query),
        score: Number(finalScore.toFixed(4)),
        matchType,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return {
      query,
      mode,
      results: results.slice(0, limit),
    };
  } finally {
    db.close();
  }
}
