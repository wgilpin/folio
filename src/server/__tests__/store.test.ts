import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { WorkspaceStore } from '../store.js';

describe('WorkspaceStore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'folio-store-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('persists index.md and .folio/notebook.json and normalizes external edits on save', async () => {
    const store = new WorkspaceStore(tempDir);

    // Empty workspace initially returns null document
    const emptyLoad = await store.loadDocument();
    expect(emptyLoad.document).toBeNull();
    expect(emptyLoad.blocks).toEqual([]);
    expect(emptyLoad.toc).toEqual([]);

    // Save a seeded document (AC-4)
    const saved = await store.saveDocument('Hamiltonian Mechanics', [
      {
        id: 'blk_01',
        markdown: '## 1. Phase Space\n\nCoordinates $(q, p)$ define the state.',
      },
      {
        id: 'blk_02',
        markdown: '## 2. Poisson Brackets\n\nAlgebraic structure of observables.',
      },
    ]);

    expect(saved.document).toEqual({
      id: 'index',
      title: 'Hamiltonian Mechanics',
      filename: 'index.md',
      parentId: null,
      parentBlockId: null,
      childDocIds: [],
    });
    expect(saved.blocks).toHaveLength(2);
    expect(saved.toc).toEqual([
      { level: 2, text: '1. Phase Space', blockId: 'blk_01' },
      { level: 2, text: '2. Poisson Brackets', blockId: 'blk_02' },
    ]);

    // Verify clean Markdown on disk in index.md and tree metadata in .folio/notebook.json (AC-4)
    const rawMarkdown = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(rawMarkdown).toBe(
      [
        '<!-- folio:block id="blk_01" -->',
        '## 1. Phase Space',
        '',
        'Coordinates $(q, p)$ define the state.',
        '',
        '<!-- folio:block id="blk_02" -->',
        '## 2. Poisson Brackets',
        '',
        'Algebraic structure of observables.',
        '',
      ].join('\n')
    );

    const rawSidecar = JSON.parse(
      await fs.readFile(path.join(tempDir, '.folio', 'notebook.json'), 'utf-8')
    );
    expect(rawSidecar.documents.index).toEqual({
      id: 'index',
      title: 'Hamiltonian Mechanics',
      filename: 'index.md',
      parentId: null,
      parentBlockId: null,
      childDocIds: [],
    });

    // Simulate external edit that overwrites index.md without <!-- folio:block --> comments (AC-2)
    const externalMarkdown = [
      '## 1. External First Section',
      '',
      'Edited in an external editor without markers.',
      '',
      '## 2. External Second Section',
      '',
      'Second section added externally.',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'index.md'), externalMarkdown, 'utf-8');

    const loadedExternal = await store.loadDocument();
    expect(loadedExternal.blocks).toHaveLength(2);
    expect(loadedExternal.blocks[0].id).toMatch(/^blk_/);
    expect(loadedExternal.blocks[1].id).toMatch(/^blk_/);
    expect(loadedExternal.blocks[0].markdown).toContain('## 1. External First Section');
    expect(loadedExternal.blocks[1].markdown).toContain('## 2. External Second Section');

    // Saving writes normalized <!-- folio:block id="..." --> markers back to index.md (AC-2)
    await store.saveDocument(
      loadedExternal.document!.title,
      loadedExternal.blocks
    );

    const normalizedOnDisk = await fs.readFile(path.join(tempDir, 'index.md'), 'utf-8');
    expect(normalizedOnDisk).toContain(`<!-- folio:block id="${loadedExternal.blocks[0].id}" -->`);
    expect(normalizedOnDisk).toContain(`<!-- folio:block id="${loadedExternal.blocks[1].id}" -->`);
  });

  it('generates concise filenames and saves shortTitle when titles contain colons or qualifiers', async () => {
    const store = new WorkspaceStore(tempDir);

    // 1. Seed root document with colon in title
    const seededRoot = await store.seedRootDocument({
      title: 'General Relativity: Gravitation as Spacetime Geometry',
      blocks: [
        '<!-- folio:block id="blk_00" -->\n## 0. Prerequisites & Notation\n\nPrereqs.',
        '## 1. Principle of Equivalence\n\nGravity is geometry.',
        '## 2. Geodesic Motion\n\nStraight lines.',
        '## 3. Einstein Equations\n\nCurvature equals energy.',
      ],
    });

    expect(seededRoot.document).toBeDefined();
    expect(seededRoot.document!.id).toBe('general-relativity');
    expect(seededRoot.document!.filename).toBe('general-relativity.md');
    expect(seededRoot.document!.title).toBe('General Relativity: Gravitation as Spacetime Geometry');
    expect(seededRoot.document!.shortTitle).toBe('General Relativity');

    const fileExists = await fs.stat(path.join(tempDir, 'general-relativity.md'));
    expect(fileExists.isFile()).toBe(true);

    // 2. Branch sub-document with "in Special Relativity" qualifier
    const branched = await store.branchDocumentFromChat(
      'general-relativity',
      'blk_00',
      {
        title: 'Spacetime Geometry and Four-Vectors in Special Relativity',
        blocks: [
          '## 0. Prerequisites & Notation\n\nVectors and coordinates.',
          '## 1. Minkowski Spacetime\n\nIntervals.',
          '## 2. Four-Velocity\n\nDerivatives.',
          '## 3. Four-Momentum\n\nConservation.',
        ],
      }
    );

    expect(branched.document).toBeDefined();
    expect(branched.document!.id).toBe('spacetime-geometry-and-four-vectors');
    expect(branched.document!.filename).toBe('spacetime-geometry-and-four-vectors.md');
    expect(branched.document!.title).toBe('Spacetime Geometry and Four-Vectors in Special Relativity');
    expect(branched.document!.shortTitle).toBe('Spacetime Geometry and Four-Vectors');

    const childFileExists = await fs.stat(
      path.join(tempDir, 'spacetime-geometry-and-four-vectors.md')
    );
    expect(childFileExists.isFile()).toBe(true);
  });
});
