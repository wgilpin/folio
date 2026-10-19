import { describe, it, expect } from 'vitest';
import {
  parseMarkdownBlocks,
  serializeMarkdownBlocks,
  extractToc,
} from '../markdown.js';

describe('markdown block parser and serializer', () => {
  it('parses and round-trips folio:block markers identically', () => {
    const input = [
      '<!-- folio:block id="blk_01" -->',
      '## 1. Hamiltonian Formulation',
      '',
      'The Hamiltonian $H(q, p)$ represents total energy in generalized coordinates.',
      '',
      '```mermaid',
      'flowchart LR',
      '  L["Lagrangian L(q, q̇)"] -->|Legendre Transform| H["Hamiltonian H(q, p)"]',
      '```',
      '',
      '<!-- folio:block id="blk_02" -->',
      '### Canonical Equations',
      '',
      '$$\\dot{q}_i = \\frac{\\partial H}{\\partial p_i}, \\quad \\dot{p}_i = -\\frac{\\partial H}{\\partial q_i}$$',
      '',
    ].join('\n');

    const blocks = parseMarkdownBlocks(input);
    expect(blocks).toEqual([
      {
        id: 'blk_01',
        markdown: [
          '## 1. Hamiltonian Formulation',
          '',
          'The Hamiltonian $H(q, p)$ represents total energy in generalized coordinates.',
          '',
          '```mermaid',
          'flowchart LR',
          '  L["Lagrangian L(q, q̇)"] -->|Legendre Transform| H["Hamiltonian H(q, p)"]',
          '```',
        ].join('\n'),
      },
      {
        id: 'blk_02',
        markdown: [
          '### Canonical Equations',
          '',
          '$$\\dot{q}_i = \\frac{\\partial H}{\\partial p_i}, \\quad \\dot{p}_i = -\\frac{\\partial H}{\\partial q_i}$$',
        ].join('\n'),
      },
    ]);

    const serialized = serializeMarkdownBlocks(blocks);
    expect(serialized).toBe(input);
  });

  it('recovers unmarked external markdown by splitting on ## headings and assigning blk_ IDs', () => {
    const externalMarkdown = [
      '# Classical Mechanics',
      '',
      'Introductory overview before the first section.',
      '',
      '## 1. Lagrangian Mechanics',
      '',
      'The action functional is stationary along the physical path.',
      '',
      '```python',
      '## comment inside code fence should not split block',
      'L = T - V',
      '```',
      '',
      '## 2. Hamiltonian Mechanics',
      '',
      'Phase space coordinates $(q, p)$.',
    ].join('\n');

    const blocks = parseMarkdownBlocks(externalMarkdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].id).toMatch(/^blk_/);
    expect(blocks[1].id).toMatch(/^blk_/);
    expect(blocks[2].id).toMatch(/^blk_/);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(3);

    expect(blocks[0].markdown).toBe(
      ['# Classical Mechanics', '', 'Introductory overview before the first section.'].join('\n')
    );
    expect(blocks[1].markdown).toBe(
      [
        '## 1. Lagrangian Mechanics',
        '',
        'The action functional is stationary along the physical path.',
        '',
        '```python',
        '## comment inside code fence should not split block',
        'L = T - V',
        '```',
      ].join('\n')
    );
    expect(blocks[2].markdown).toBe(
      ['## 2. Hamiltonian Mechanics', '', 'Phase space coordinates $(q, p)$.'].join('\n')
    );
  });

  it('extracts ordered Table of Contents items mapped to owning blockId and ignores headings in code fences', () => {
    const blocks = [
      {
        id: 'blk_01',
        markdown: [
          '# Analytical Mechanics',
          '',
          '## 1. Generalized Coordinates',
          '',
          '```bash',
          '# shell comment inside fenced block',
          '## second comment inside fenced block',
          '### third comment inside fenced block',
          '```',
        ].join('\n'),
      },
      {
        id: 'blk_02',
        markdown: [
          '### 1.1 Holonomic Constraints',
          '',
          '#### Ignored Level 4 Heading',
          '',
          '## 2. Euler-Lagrange Equations',
        ].join('\n'),
      },
    ];

    const toc = extractToc(blocks);
    expect(toc).toEqual([
      { level: 1, text: 'Analytical Mechanics', blockId: 'blk_01' },
      { level: 2, text: '1. Generalized Coordinates', blockId: 'blk_01' },
      { level: 3, text: '1.1 Holonomic Constraints', blockId: 'blk_02' },
      { level: 2, text: '2. Euler-Lagrange Equations', blockId: 'blk_02' },
    ]);
  });

  describe('splitMultiSectionMarkdown', () => {
    it('returns empty array for empty or whitespace-only markdown', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      expect(splitMultiSectionMarkdown('')).toEqual([]);
      expect(splitMultiSectionMarkdown('   \n\n  ')).toEqual([]);
    });

    it('returns single section if only 1 heading or prose without multi-sections', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      const md = '## Single Section\n\nJust some prose here.';
      expect(splitMultiSectionMarkdown(md)).toEqual([md]);
    });

    it('splits on multiple ## headings outside code fences', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      const md = [
        '# Topic Title',
        '## 1. Linear Algebra',
        'Vectors and matrices.',
        '```',
        '## Code comment that should not split',
        '```',
        '## 2. Multivariable Calculus',
        'Partial derivatives.',
      ].join('\n');

      const result = splitMultiSectionMarkdown(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(
        '# Topic Title\n\n## 1. Linear Algebra\nVectors and matrices.\n```\n## Code comment that should not split\n```'
      );
      expect(result[1]).toBe(
        '## 2. Multivariable Calculus\nPartial derivatives.'
      );
    });

    it('splits on multiple ### headings and promotes them to ##', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      const md = [
        '### 1. Vector Spaces',
        'Linear combinations.',
        '### 2. Inner Products',
        'Angles and lengths.',
        '### 3. Eigenvalues',
        'Characteristic polynomial.',
      ].join('\n');

      const result = splitMultiSectionMarkdown(md);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe('## 1. Vector Spaces\nLinear combinations.');
      expect(result[1]).toBe('## 2. Inner Products\nAngles and lengths.');
      expect(result[2]).toBe('## 3. Eigenvalues\nCharacteristic polynomial.');
    });

    it('splits on numbered bold headers and promotes them to ##', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      const md = [
        '1. **Vector Spaces**: Linear combinations and bases.',
        '',
        '2. **Inner Products**: Angles, norms, and dot products.',
        '',
        '3. **Eigenvalues**: Characteristic polynomial and diagonalizability.',
      ].join('\n');

      const result = splitMultiSectionMarkdown(md);
      expect(result).toHaveLength(3);
      expect(result[0]).toBe(
        '## 1. Vector Spaces\n\nLinear combinations and bases.'
      );
      expect(result[1]).toBe(
        '## 2. Inner Products\n\nAngles, norms, and dot products.'
      );
      expect(result[2]).toBe(
        '## 3. Eigenvalues\n\nCharacteristic polynomial and diagonalizability.'
      );
    });

    it('does not split a single ## concept block that contains a numbered list of bolded items in its body', async () => {
      const { splitMultiSectionMarkdown } = await import('../markdown.js');
      const md = [
        '## 1. Symplectic Structure',
        '',
        'A symplectic form $\\omega$ satisfies the following properties:',
        '',
        '1. **Closed**: $d\\omega = 0$.',
        '2. **Non-degenerate**: $\\omega(u, v) = 0$ for all $v$ implies $u = 0$.',
      ].join('\n');

      const result = splitMultiSectionMarkdown(md);
      expect(result).toHaveLength(1);
      expect(result[0]).toBe(md);
    });
  });
});


