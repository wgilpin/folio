import { describe, expect, it } from 'vitest';
import { renderMarkdownWithMath, sanitizeTexForKaTeX } from '../components/ConceptBlockCard.js';
import { KATEX_MATH_FORMATTING_RULES } from '../../server/llm.js';

describe('KaTeX Math Sanitization & Rendering', () => {
  it('defines KaTeX math formatting rules for LLM generation', () => {
    expect(KATEX_MATH_FORMATTING_RULES).toContain('Math Formatting Guidelines (KaTeX)');
    expect(KATEX_MATH_FORMATTING_RULES).toContain('\\multicolumn');
    expect(KATEX_MATH_FORMATTING_RULES).toContain('\\cline');
  });

  describe('sanitizeTexForKaTeX', () => {
    it('converts unsupported \\cline to \\hline', () => {
      expect(sanitizeTexForKaTeX('\\cline{1-3}')).toBe('\\hline');
      expect(sanitizeTexForKaTeX('a & b \\\\ \\cline{2-3} c & d')).toBe('a & b \\\\ \\hline c & d');
    });

    it('sanitizes standard braced \\multicolumn{cols}{align}{content}', () => {
      const input = '\\multicolumn{3}{c}{\\textbf{Momentum Density}}';
      expect(sanitizeTexForKaTeX(input)).toBe('\\textbf{Momentum Density}');
    });

    it('sanitizes partially braced \\multicolumn 3 c {content}', () => {
      const input = '\\multicolumn 3 c {\\textbf{Momentum Density}}';
      expect(sanitizeTexForKaTeX(input)).toBe('\\textbf{Momentum Density}');
    });

    it('sanitizes unbraced \\multicolumn3c and \\multicolumn1c| tokens from LLM output', () => {
      const input = '\\multicolumn3c\\textbf{Momentum Density / Energy Flux}';
      expect(sanitizeTexForKaTeX(input)).toBe('\\textbf{Momentum Density / Energy Flux}');

      const bottomRow = '\\multicolumn1c|\\textbf{Momentum Flux} & \\multicolumn3c\\textbf{3D Stress Tensor}';
      expect(sanitizeTexForKaTeX(bottomRow)).toBe('\\textbf{Momentum Flux} & \\textbf{3D Stress Tensor}');
    });

    it('handles \\multicolumn nested inside formatting commands like \\textbf', () => {
      const input = '\\textbf{\\multicolumn3cMomentum Density / Energy Flux}';
      expect(sanitizeTexForKaTeX(input)).toBe('\\textbf{Momentum Density / Energy Flux}');
    });
  });

  describe('renderMarkdownWithMath', () => {
    it('renders equations containing \\multicolumn without red KaTeX error text', () => {
      const markdown = `
$$
\\begin{pmatrix}
\\textbf{Energy Density} & \\multicolumn3c\\textbf{Momentum Density / Energy Flux} \\\\
\\hline
T_{00} & T_{01} & T_{02} & T_{03} \\\\
T_{10} & T_{11} & T_{12} & T_{13} \\\\
\\multicolumn1c|\\textbf{Momentum Flux} & \\multicolumn3c\\textbf{3D Stress Tensor}
\\end{pmatrix}
$$
`;
      const html = renderMarkdownWithMath(markdown);

      // Verify KaTeX rendered successfully
      expect(html).toContain('katex');
      // Verify unsupported \\multicolumn raw error text is NOT present
      expect(html).not.toContain('\\multicolumn');
      expect(html).not.toContain('color:#cc0000');
    });

    it('renders standard partitioned arrays cleanly', () => {
      const markdown = `
$$
T^{\\mu\\nu} = \\left(\\begin{array}{c|c}
\\text{Energy Density} & \\text{Momentum Density} \\\\
\\hline
\\text{Momentum Flux} & \\text{3D Stress Tensor}
\\end{array}\\right)
$$
`;
      const html = renderMarkdownWithMath(markdown);
      expect(html).toContain('katex');
      expect(html).not.toContain('color:#cc0000');
    });
  });
});
