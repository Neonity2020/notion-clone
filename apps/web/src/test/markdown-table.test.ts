import { describe, expect, it } from 'vitest';
import { blocksToMarkdown, markdownToBlocks, newBlock, normalizeLegacyTables } from '../lib/markdown';
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

  it('upgrades legacy paragraph rows without changing surrounding blocks', () => {
    const blocks = [
      newBlock('h2', 'Notion vs Notion-Like'),
      newBlock('paragraph', '| 维度 | Notion | Notion-Like（本应用） |'),
      newBlock('paragraph', '|------|--------|------------------------|'),
      newBlock('paragraph', '| 定位 | 全能协作平台 | 轻量块笔记 |'),
      newBlock('paragraph', '| 协作 | 强多人协作 | 以个人使用为主 |'),
      newBlock('quote', '简单来说'),
    ];
    const normalized = normalizeLegacyTables(blocks);
    expect(normalized.map((b) => b.type)).toEqual(['h2', 'table', 'quote']);
    expect(normalized[1].id).toBe(blocks[1].id);
    expect(normalized[1].text).toBe(blocks.slice(1, 5).map((b) => b.text).join('\n'));
    expect(normalized[2]).toBe(blocks[5]);
    expect(normalizeLegacyTables(normalized)).toBe(normalized);
  });

  it('preserves ordinary pipe text, code blocks, and multiline prose', () => {
    const blocks = [newBlock('paragraph', 'A | B'), newBlock('paragraph', 'not a separator'),
      newBlock('code', '| A | B |\n| --- | --- |'),
      newBlock('paragraph', '| A | B |\n| --- | --- |\nAdditional prose')];
    expect(normalizeLegacyTables(blocks)).toBe(blocks);
  });
});
