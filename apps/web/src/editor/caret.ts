/** Caret helpers for single-text contentEditable elements. */

export function getCaretOffset(el: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  const start = pre.toString().length;
  return { start, end: start + range.toString().length };
}

export function setCaretOffset(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  const total = el.textContent?.length ?? 0;
  let remaining = offset < 0 || offset > total ? total : offset;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  if (!node) {
    range.setStart(el, 0);
  } else {
    let last: Node = node;
    while (node) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        break;
      }
      remaining -= len;
      last = node;
      node = walker.nextNode();
    }
    if (!node) range.setStart(last, last.textContent?.length ?? 0);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Is the caret visually on the first / last line of the element? */
export function caretOnEdgeLine(el: HTMLElement, edge: 'top' | 'bottom'): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return true;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if (!rect) {
    // empty line / element: fall back to text offset
    const off = getCaretOffset(el) ?? 0;
    const text = el.textContent ?? '';
    return edge === 'top' ? !text.slice(0, off).includes('\n') : !text.slice(off).includes('\n');
  }
  const box = el.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return edge === 'top' ? rect.top - box.top < lh * 0.8 : box.bottom - rect.bottom < lh * 0.8;
}
