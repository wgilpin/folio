import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  NotebookStateSchema,
  type ConceptBlock,
  type DocumentNode,
  type EphemeralChatThread,
  type NotebookSettings,
  type NotebookState,
  type PendingSuggestedEdit,
} from '../shared/schema.js';
import { extractToc, parseMarkdownBlocks } from './markdown.js';
import { buildFtsTokens, computeSemanticEmbedding } from './search.js';

export const LIBRARY_SQLITE_FILENAME = 'library.sqlite';
export const LEGACY_NOTEBOOK_JSON_FILENAME = 'notebook.json';
export const LEGACY_NOTEBOOK_BAK_FILENAME = 'notebook.json.bak';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      short_title TEXT,
      filename TEXT NOT NULL,
      parent_id TEXT,
      parent_block_id TEXT,
      child_doc_ids_json TEXT NOT NULL DEFAULT '[]',
      prerequisites_json TEXT,
      prerequisite_doc_ids_json TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS blocks (
      doc_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      markdown TEXT NOT NULL,
      heading TEXT,
      embedding_json TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (doc_id, block_id)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
      doc_id UNINDEXED,
      block_id UNINDEXED,
      heading,
      markdown,
      tokens
    );

    CREATE TABLE IF NOT EXISTS topic_links (
      topic TEXT NOT NULL,
      source_doc_id TEXT NOT NULL DEFAULT '',
      target_doc_id TEXT NOT NULL,
      PRIMARY KEY (topic, source_doc_id)
    );

    CREATE TABLE IF NOT EXISTS pending_edits (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      original_markdown TEXT NOT NULL,
      proposed_markdown TEXT NOT NULL,
      reason TEXT NOT NULL,
      source_block_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS active_chat (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      doc_id TEXT NOT NULL,
      block_id TEXT,
      model_id TEXT NOT NULL,
      messages_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );
  `);

  try {
    db.exec('ALTER TABLE blocks ADD COLUMN done INTEGER NOT NULL DEFAULT 0');
  } catch {
    // Column already exists
  }
}

function extractPrimaryHeading(block: ConceptBlock): string | null {
  const toc = extractToc([block]);
  return toc[0]?.text ?? null;
}

export function writeStateToSqlite(
  db: DatabaseSync,
  state: NotebookState,
  blocksByDocId?: Record<string, ConceptBlock[]>
): void {
  db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    db.exec('DELETE FROM documents');
    db.exec('DELETE FROM topic_links');
    db.exec('DELETE FROM pending_edits');
    db.exec('DELETE FROM active_chat');
    db.exec('DELETE FROM settings');

    const insertDoc = db.prepare(`
      INSERT INTO documents (
        id,
        title,
        short_title,
        filename,
        parent_id,
        parent_block_id,
        child_doc_ids_json,
        prerequisites_json,
        prerequisite_doc_ids_json,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTopicLink = db.prepare(`
      INSERT OR REPLACE INTO topic_links (topic, source_doc_id, target_doc_id)
      VALUES (?, ?, ?)
    `);

    const docEntries = Object.entries(state.documents);
    docEntries.forEach(([docId, doc], index) => {
      insertDoc.run(
        docId,
        doc.title,
        doc.shortTitle ?? null,
        doc.filename,
        doc.parentId ?? null,
        doc.parentBlockId ?? null,
        JSON.stringify(doc.childDocIds ?? []),
        doc.prerequisites && doc.prerequisites.length > 0
          ? JSON.stringify(doc.prerequisites)
          : null,
        doc.prerequisiteDocIds && Object.keys(doc.prerequisiteDocIds).length > 0
          ? JSON.stringify(doc.prerequisiteDocIds)
          : null,
        index
      );

      if (doc.prerequisiteDocIds) {
        for (const [topic, targetDocId] of Object.entries(
          doc.prerequisiteDocIds
        )) {
          insertTopicLink.run(topic, docId, targetDocId);
        }
      }
    });

    if (state.topicDocIds) {
      for (const [topic, targetDocId] of Object.entries(state.topicDocIds)) {
        insertTopicLink.run(topic, '', targetDocId);
      }
    }

    // Remove blocks for documents that no longer exist
    const currentDocIds = new Set(Object.keys(state.documents));
    const existingBlockDocIds = db
      .prepare('SELECT DISTINCT doc_id FROM blocks')
      .all() as Array<{ doc_id: string }>;
    const deleteDocBlocks = db.prepare('DELETE FROM blocks WHERE doc_id = ?');
    const deleteDocFts = db.prepare('DELETE FROM blocks_fts WHERE doc_id = ?');
    for (const row of existingBlockDocIds) {
      if (!currentDocIds.has(row.doc_id)) {
        deleteDocBlocks.run(row.doc_id);
        deleteDocFts.run(row.doc_id);
      }
    }

    if (blocksByDocId) {
      const insertBlock = db.prepare(`
        INSERT INTO blocks (
          doc_id,
          block_id,
          sort_order,
          markdown,
          heading,
          embedding_json,
          done
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFts = db.prepare(`
        INSERT INTO blocks_fts (doc_id, block_id, heading, markdown, tokens)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const [docId, blocks] of Object.entries(blocksByDocId)) {
        if (!currentDocIds.has(docId)) continue;
        const docTitle = state.documents[docId]?.title ?? null;
        deleteDocBlocks.run(docId);
        deleteDocFts.run(docId);
        blocks.forEach((block, idx) => {
          const heading = extractPrimaryHeading(block);
          const embedding = computeSemanticEmbedding(
            block.markdown,
            heading,
            docTitle
          );
          const ftsTokens = buildFtsTokens(block.markdown, heading, docTitle);
          insertBlock.run(
            docId,
            block.id,
            idx,
            block.markdown,
            heading,
            JSON.stringify(embedding),
            block.done ? 1 : 0
          );
          insertFts.run(
            docId,
            block.id,
            heading ?? '',
            block.markdown,
            ftsTokens
          );
        });
      }
    }

    const insertEdit = db.prepare(`
      INSERT INTO pending_edits (
        id,
        doc_id,
        block_id,
        original_markdown,
        proposed_markdown,
        reason,
        source_block_id,
        sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    state.pendingEdits.forEach((edit, index) => {
      insertEdit.run(
        edit.id,
        edit.docId,
        edit.blockId,
        edit.originalMarkdown,
        edit.proposedMarkdown,
        edit.reason,
        edit.sourceBlockId,
        index
      );
    });

    if (state.activeChat) {
      const insertChat = db.prepare(`
        INSERT INTO active_chat (id, doc_id, block_id, model_id, messages_json)
        VALUES (1, ?, ?, ?, ?)
      `);
      insertChat.run(
        state.activeChat.docId,
        state.activeChat.blockId ?? null,
        state.activeChat.modelId,
        JSON.stringify(state.activeChat.messages)
      );
    }

    const insertSetting = db.prepare(`
      INSERT INTO settings (key, value_json) VALUES (?, ?)
    `);
    if (state.settings) {
      insertSetting.run('notebook_settings', JSON.stringify(state.settings));
    }
    if (state.activeDocId) {
      insertSetting.run('active_doc_id', JSON.stringify(state.activeDocId));
    }
    if (state.topicDocIds && Object.keys(state.topicDocIds).length > 0) {
      insertSetting.run('topic_doc_ids', JSON.stringify(state.topicDocIds));
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function readStateFromSqlite(db: DatabaseSync): NotebookState {
  const docRows = db
    .prepare(
      `SELECT
        id,
        title,
        short_title,
        filename,
        parent_id,
        parent_block_id,
        child_doc_ids_json,
        prerequisites_json,
        prerequisite_doc_ids_json
      FROM documents
      ORDER BY sort_order ASC, rowid ASC`
    )
    .all() as Array<{
    id: string;
    title: string;
    short_title: string | null;
    filename: string;
    parent_id: string | null;
    parent_block_id: string | null;
    child_doc_ids_json: string;
    prerequisites_json: string | null;
    prerequisite_doc_ids_json: string | null;
  }>;

  const documents: Record<string, DocumentNode> = {};
  for (const row of docRows) {
    const childDocIds = JSON.parse(row.child_doc_ids_json) as string[];
    const prerequisites = row.prerequisites_json
      ? (JSON.parse(row.prerequisites_json) as string[])
      : undefined;
    const prerequisiteDocIds = row.prerequisite_doc_ids_json
      ? (JSON.parse(row.prerequisite_doc_ids_json) as Record<string, string>)
      : undefined;

    documents[row.id] = {
      id: row.id,
      title: row.title,
      ...(row.short_title ? { shortTitle: row.short_title } : {}),
      filename: row.filename,
      parentId: row.parent_id,
      parentBlockId: row.parent_block_id,
      childDocIds,
      ...(prerequisites && prerequisites.length > 0 ? { prerequisites } : {}),
      ...(prerequisiteDocIds && Object.keys(prerequisiteDocIds).length > 0
        ? { prerequisiteDocIds }
        : {}),
    };
  }

  const editRows = db
    .prepare(
      `SELECT
        id,
        doc_id,
        block_id,
        original_markdown,
        proposed_markdown,
        reason,
        source_block_id
      FROM pending_edits
      ORDER BY sort_order ASC, rowid ASC`
    )
    .all() as Array<{
    id: string;
    doc_id: string;
    block_id: string;
    original_markdown: string;
    proposed_markdown: string;
    reason: string;
    source_block_id: string;
  }>;

  const pendingEdits: PendingSuggestedEdit[] = editRows.map((row) => ({
    id: row.id,
    docId: row.doc_id,
    blockId: row.block_id,
    originalMarkdown: row.original_markdown,
    proposedMarkdown: row.proposed_markdown,
    reason: row.reason,
    sourceBlockId: row.source_block_id,
  }));

  const chatRow = db
    .prepare(
      'SELECT doc_id, block_id, model_id, messages_json FROM active_chat WHERE id = 1'
    )
    .get() as
    | {
        doc_id: string;
        block_id: string | null;
        model_id: string;
        messages_json: string;
      }
    | undefined;

  const activeChat: EphemeralChatThread | null = chatRow
    ? {
        docId: chatRow.doc_id,
        blockId: chatRow.block_id,
        modelId: chatRow.model_id,
        messages: JSON.parse(chatRow.messages_json),
      }
    : null;

  const settingRows = db
    .prepare('SELECT key, value_json FROM settings')
    .all() as Array<{ key: string; value_json: string }>;
  const settingsMap = new Map(
    settingRows.map((r) => [r.key, JSON.parse(r.value_json)])
  );

  const settings = settingsMap.get('notebook_settings') as
    | NotebookSettings
    | undefined;
  const activeDocId = settingsMap.get('active_doc_id') as string | undefined;

  const topicDocIdsFromSettings = settingsMap.get('topic_doc_ids') as
    | Record<string, string>
    | undefined;
  const globalTopicLinks = db
    .prepare(
      "SELECT topic, target_doc_id FROM topic_links WHERE source_doc_id = ''"
    )
    .all() as Array<{ topic: string; target_doc_id: string }>;

  const mergedTopicDocIds: Record<string, string> = {
    ...(topicDocIdsFromSettings ?? {}),
  };
  for (const row of globalTopicLinks) {
    mergedTopicDocIds[row.topic] = row.target_doc_id;
  }

  return NotebookStateSchema.parse({
    documents,
    pendingEdits,
    activeChat,
    ...(settings ? { settings } : {}),
    ...(activeDocId ? { activeDocId } : {}),
    ...(Object.keys(mergedTopicDocIds).length > 0
      ? { topicDocIds: mergedTopicDocIds }
      : {}),
  });
}

export async function syncDocumentBlocksToSqlite(
  workspaceDir: string,
  docId: string,
  blocks: ConceptBlock[]
): Promise<void> {
  const folioDir = path.join(workspaceDir, '.folio');
  await fs.mkdir(folioDir, { recursive: true });
  const sqlitePath = path.join(folioDir, LIBRARY_SQLITE_FILENAME);
  const db = new DatabaseSync(sqlitePath);
  try {
    initializeSchema(db);
    db.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      const docRow = db
        .prepare('SELECT title FROM documents WHERE id = ?')
        .get(docId) as { title?: string } | undefined;
      const docTitle = docRow?.title ?? null;

      db.prepare('DELETE FROM blocks WHERE doc_id = ?').run(docId);
      db.prepare('DELETE FROM blocks_fts WHERE doc_id = ?').run(docId);
      const insertBlock = db.prepare(`
        INSERT INTO blocks (
          doc_id,
          block_id,
          sort_order,
          markdown,
          heading,
          embedding_json,
          done
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const insertFts = db.prepare(`
        INSERT INTO blocks_fts (doc_id, block_id, heading, markdown, tokens)
        VALUES (?, ?, ?, ?, ?)
      `);
      blocks.forEach((block, idx) => {
        const heading = extractPrimaryHeading(block);
        const embedding = computeSemanticEmbedding(
          block.markdown,
          heading,
          docTitle
        );
        const ftsTokens = buildFtsTokens(block.markdown, heading, docTitle);
        insertBlock.run(
          docId,
          block.id,
          idx,
          block.markdown,
          heading,
          JSON.stringify(embedding),
          block.done ? 1 : 0
        );
        insertFts.run(
          docId,
          block.id,
          heading ?? '',
          block.markdown,
          ftsTokens
        );
      });
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    db.close();
  }
}

export async function ensureSqliteMigratedAndLoadState(
  workspaceDir: string
): Promise<NotebookState> {
  const folioDir = path.join(workspaceDir, '.folio');
  const legacyJsonPath = path.join(folioDir, LEGACY_NOTEBOOK_JSON_FILENAME);
  const legacyBakPath = path.join(folioDir, LEGACY_NOTEBOOK_BAK_FILENAME);
  const sqlitePath = path.join(folioDir, LIBRARY_SQLITE_FILENAME);

  const hasLegacyJson = fsSync.existsSync(legacyJsonPath);
  const hasSqlite = fsSync.existsSync(sqlitePath);

  if (hasLegacyJson) {
    await fs.mkdir(folioDir, { recursive: true });
    let migratedState: NotebookState = {
      documents: {},
      pendingEdits: [],
      activeChat: null,
    };
    try {
      const raw = await fs.readFile(legacyJsonPath, 'utf-8');
      migratedState = NotebookStateSchema.parse(JSON.parse(raw));
    } catch {
      // Fallback to empty state if legacy JSON is malformed
    }

    const blocksByDocId: Record<string, ConceptBlock[]> = {};
    for (const [docId, doc] of Object.entries(migratedState.documents)) {
      try {
        const rawMd = await fs.readFile(
          path.join(workspaceDir, doc.filename),
          'utf-8'
        );
        blocksByDocId[docId] = parseMarkdownBlocks(rawMd);
      } catch {
        blocksByDocId[docId] = [];
      }
    }

    const db = new DatabaseSync(sqlitePath);
    try {
      initializeSchema(db);
      writeStateToSqlite(db, migratedState, blocksByDocId);
    } finally {
      db.close();
    }

    try {
      await fs.rename(legacyJsonPath, legacyBakPath);
    } catch {
      // Ignore if already renamed concurrently
    }

    return migratedState;
  }

  if (!hasSqlite) {
    return { documents: {}, pendingEdits: [], activeChat: null };
  }

  const db = new DatabaseSync(sqlitePath);
  try {
    initializeSchema(db);
    return readStateFromSqlite(db);
  } catch {
    return { documents: {}, pendingEdits: [], activeChat: null };
  } finally {
    db.close();
  }
}

export async function persistStateToSqlite(
  workspaceDir: string,
  state: NotebookState,
  blocksByDocId?: Record<string, ConceptBlock[]>
): Promise<void> {
  const folioDir = path.join(workspaceDir, '.folio');
  await fs.mkdir(folioDir, { recursive: true });
  const legacyJsonPath = path.join(folioDir, LEGACY_NOTEBOOK_JSON_FILENAME);
  const legacyBakPath = path.join(folioDir, LEGACY_NOTEBOOK_BAK_FILENAME);
  const sqlitePath = path.join(folioDir, LIBRARY_SQLITE_FILENAME);

  const db = new DatabaseSync(sqlitePath);
  try {
    initializeSchema(db);
    writeStateToSqlite(db, state, blocksByDocId);
  } finally {
    db.close();
  }

  if (fsSync.existsSync(legacyJsonPath)) {
    try {
      await fs.rename(legacyJsonPath, legacyBakPath);
    } catch {
      // Ignore
    }
  }
}
