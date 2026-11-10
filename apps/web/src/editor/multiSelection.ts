import type { Block } from '../types';
import { newBlock } from '../lib/markdown';
import { displayToRaw } from '../lib/inline';

export interface MultiSelection {
  startIndex: number;
  endIndex: number;
  start: number;
  end: number;
}

/** Read a native selection spanning two editor blocks, in document order. */
export function getMultiSelection(editor: HTMLElement, blocks: Block[]): MultiSelection | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const find = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>('[data-block-id]');
  const first = find(range.startContainer);
  const last = find(range.endContainer);
  if (!first || !last || first === last || !editor.contains(first) || !editor.contains(last)) return null;
  const startIndex = blocks.findIndex((b) => b.id === first.dataset.blockId);
  const endIndex = blocks.findIndex((b) => b.id === last.dataset.blockId);
  if (startIndex < 0 || endIndex <= startIndex) return null;
  const offset = (el: HTMLElement, node: Node, at: number, block: Block) => {
    const before = document.createRange();
    before.selectNodeContents(el);
    before.setEnd(node, at);
    const displayed = before.toString().length;
    return el.textContent === block.text ? displayed : displayToRaw(block.text, displayed);
  };
  const startBlock = blocks[startIndex];
  const endBlock = blocks[endIndex];
  return {
    startIndex, endIndex,
    start: startBlock.type === 'table' && first.querySelector('table') ? 0 : offset(first, range.startContainer, range.startOffset, startBlock),
    end: endBlock.type === 'table' && last.querySelector('table') ? endBlock.text.length : offset(last, range.endContainer, range.endOffset, endBlock),
  };
}

export function selectedText(blocks: Block[], selection: MultiSelection): string {
  const { startIndex, endIndex, start, end } = selection;
  return blocks.slice(startIndex, endIndex + 1).map((block, i) =>
    block.text.slice(i === 0 ? start : 0, i === endIndex - startIndex ? end : undefined),
  ).join('\n');
}

/** Replace a selection atomically while retaining the surrounding blocks and text. */
export function replaceMultiSelection(blocks: Block[], selection: MultiSelection, text: string) {
  const { startIndex, endIndex, start, end } = selection;
  const first = blocks[startIndex];
  const before = first.text.slice(0, start);
  const after = blocks[endIndex].text.slice(end);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const replacement = [{ ...first, text: before + lines[0] }];
  for (const line of lines.slice(1)) replacement.push(newBlock('paragraph', line));
  const last = replacement[replacement.length - 1];
  const offset = last.text.length;
  last.text += after;
  return { blocks: [...blocks.slice(0, startIndex), ...replacement, ...blocks.slice(endIndex + 1)], focusId: last.id, offset };
}
