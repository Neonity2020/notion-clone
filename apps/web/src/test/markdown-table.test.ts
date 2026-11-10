import { describe, expect, it } from 'vitest';
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown';
import { parseTable } from '../lib/table';

describe('Markdown tables', () => {
  it('keeps a table together and round-trips it through Markdown', () => {
    const markdown = 'Before\n\n| Name | Result |\n| :--- | ---: |\n| **Item** | 42 |\n\nAfter';
    const blocks = markdownToBlocks(markdown);
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'table', 'paragraph']);
    expect(parseTable(blocks[1].text)).toEqual({ header: ['Name', 'Result'], align: ['left', 'right'], rows: [['**Item**', '42']] });
    expect(markdownToBlocks(blocksToMarkdown(blocks)).map(({ type, text }) => ({ type, text })))
      .toEqual(blocks.map(({ type, text }) => ({ type, text })));
  });

  it('handles escaped pipes and leaves fenced tables as code', () => {
    expect(parseTable('| A | B |\n| --- | :---: |\n| a\\|b | c |')?.rows).toEqual([['a|b', 'c']]);
    expect(markdownToBlocks('```\n| A | B |\n| --- | --- |\n```')[0].type).toBe('code');
  });

  it('does not interpret invalid separators as a table', () => {
    expect(markdownToBlocks('| A | B |\n| --- | nope |').map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });
});
