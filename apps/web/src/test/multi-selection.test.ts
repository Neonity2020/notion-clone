import { describe, expect, it } from 'vitest';
import { newBlock } from '../lib/markdown';
import { replaceMultiSelection, selectedText } from '../editor/multiSelection';

describe('multi-block selection', () => {
  const blocks = [newBlock('paragraph', 'first'), newBlock('bullet', 'middle'), newBlock('paragraph', 'last'), newBlock('paragraph', 'after')];
  const selection = { startIndex: 0, endIndex: 2, start: 2, end: 2 };

  it('copies the selected portions in page order', () => {
    expect(selectedText(blocks, selection)).toBe('rst\nmiddle\nla');
  });

  it('replaces a selection without losing surrounding text or blocks', () => {
    const result = replaceMultiSelection(blocks, selection, 'X');
    expect(result.blocks.map((b) => b.text)).toEqual(['fiXst', 'after']);
    expect(result.blocks[0].id).toBe(blocks[0].id);
    expect(result.offset).toBe(3);
  });

  it('inserts multiline text as blocks and places the caret before the suffix', () => {
    const result = replaceMultiSelection(blocks, selection, 'one\r\ntwo');
    expect(result.blocks.map((b) => b.text)).toEqual(['fione', 'twost', 'after']);
    expect(result.focusId).toBe(result.blocks[1].id);
    expect(result.offset).toBe(3);
  });
});
