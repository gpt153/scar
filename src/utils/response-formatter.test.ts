import { stripCodeBlocks, formatForNonTechnical } from './response-formatter';

describe('Response Formatter', () => {
  describe('stripCodeBlocks', () => {
    it('should remove fenced code blocks', () => {
      const input = 'Here is some code:\n```typescript\nconst x = 1;\n```\nDone!';
      const result = stripCodeBlocks(input);
      expect(result).not.toContain('const x = 1');
      expect(result).toContain('[Code changes made');
    });

    it('should preserve file paths in inline code', () => {
      const input = 'Modified `src/index.ts` file';
      const result = stripCodeBlocks(input);
      expect(result).toContain('src/index.ts');
    });

    it('should remove regular inline code', () => {
      const input = 'Set variable to `true` value';
      const result = stripCodeBlocks(input);
      expect(result).not.toContain('`true`');
    });
  });

  describe('formatForNonTechnical', () => {
    it('should strip code blocks from complete message', () => {
      const input = 'I created the feature:\n```python\ndef hello():\n    pass\n```\nAll done!';
      const result = formatForNonTechnical(input);
      expect(result).not.toContain('def hello');
      expect(result).toContain('All done');
    });
  });
});
