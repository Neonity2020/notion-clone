import { useCallback, useMemo, useRef, useState } from 'react';
import type { BlockType, Page } from '../types';
import { useStore, BLOCK_TYPES } from '../store';
import { newBlock } from '../lib/markdown';
import { BlockView } from './Block';
import { EditorContext, type EditorCtx, type SlashState } from './context';
import { getCaretOffset, setCaretOffset } from './caret';
import { SelectionAI } from '../agent/SelectionAI';

function filterTypes(q: string) {
  const s = q.toLowerCase().trim();
  if (!s) return BLOCK_TYPES;
  return BLOCK_TYPES.filter((t) => t.label.includes(s) || t.keywords.includes(s) || t.type.includes(s));
}

function caretRect(): { x: number; y: number } {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(true);
    const rect = r.getClientRects()[0] ?? (sel.anchorNode as HTMLElement | null)?.parentElement?.getBoundingClientRect();
    if (rect) return { x: rect.left, y: rect.bottom + 6 };
  }
  return { x: 200, y: 200 };
}

export function Editor({ page }: { page: Page }) {
  const [slash, setSlash] = useState<SlashState | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<EditorCtx['dropTarget']>(null);
  const pageId = page.id;

  const applyType = useCallback(
    (blockId: string, type: BlockType) => {
      const s = useStore.getState();
      if (type === 'divider') {
        const nb = newBlock();
        s.updateBlock(pageId, blockId, { type: 'divider', text: '' });
        s.insertBlocks(pageId, blockId, [nb]);
        s.requestFocus(nb.id, 0);
      } else {
        s.updateBlock(pageId, blockId, { type });
        s.requestFocus(blockId);
      }
    },
    [pageId],
  );

  const selectSlash = useCallback(
    (type: BlockType) => {
      const cur = slashRef.current;
      if (!cur) return;
      setSlash(null);
      const s = useStore.getState();
      const block = s.pages[pageId]?.blocks.find((b) => b.id === cur.blockId);
      if (!block) return;
      const text = block.text.slice(0, cur.start) + block.text.slice(cur.start + 1 + cur.query.length);
      const el = document.querySelector<HTMLElement>(`[data-block-id="${cur.blockId}"]`);
      if (el) el.textContent = text;
      if (text.trim() === '') {
        s.updateBlock(pageId, cur.blockId, { text: '' });
        applyType(cur.blockId, type);
      } else {
        s.updateBlock(pageId, cur.blockId, { text });
        const nb = newBlock(type);
        s.insertBlocks(pageId, cur.blockId, type === 'divider' ? [nb, newBlock()] : [nb]);
        s.requestFocus(nb.id, 0);
      }
    },
    [pageId, applyType],
  );

  const ctx: EditorCtx = useMemo(
    () => ({
      pageId,
      dragId,
      setDragId,
      dropTarget,
      setDropTarget,
      applyType,
      closeSlash: () => slashRef.current && setSlash(null),
      openSlashAt(blockId) {
        const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
        if (!el) return;
        el.focus();
        setCaretOffset(el, 1);
        setSlash({ blockId, start: 0, query: '', index: 0, ...caretRect() });
      },
      checkSlash(blockId, el) {
        const text = el.textContent ?? '';
        const c = getCaretOffset(el);
        if (c === null) return;
        const cur = slashRef.current;
        if (cur && cur.blockId === blockId) {
          if (c <= cur.start || text[cur.start] !== '/') return setSlash(null);
          const query = text.slice(cur.start + 1, c);
          if (/\s/.test(query) || query.length > 20 || filterTypes(query).length === 0) return setSlash(null);
          setSlash({ ...cur, query, index: 0 });
          return;
        }
        if (text[c - 1] === '/' && (c === 1 || /\s/.test(text[c - 2]))) {
          setSlash({ blockId, start: c - 1, query: '', index: 0, ...caretRect() });
        } else if (cur) setSlash(null);
      },
      slashKeyDown(e) {
        const cur = slashRef.current;
        if (!cur) return false;
        const items = filterTypes(cur.query);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const d = e.key === 'ArrowDown' ? 1 : -1;
          setSlash({ ...cur, index: (cur.index + d + items.length) % items.length });
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const item = items[cur.index];
          if (item) selectSlash(item.type);
          return true;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSlash(null);
          return true;
        }
        return false;
      },
    }),
    [pageId, dragId, dropTarget, applyType, selectSlash],
  );

  // numbered list counters
  const numbers = useMemo(() => {
    const out: number[] = [];
    const counters: number[] = [];
    page.blocks.forEach((b, i) => {
      const ind = b.indent ?? 0;
      if (b.type === 'numbered') {
        counters.length = ind + 1;
        counters[ind] = (counters[ind] ?? 0) + 1;
        out[i] = counters[ind];
      } else {
        if (!['bullet', 'todo'].includes(b.type) || ind === 0) counters.length = 0;
        else counters.length = ind;
        out[i] = 0;
      }
    });
    return out;
  }, [page.blocks]);

  const onClickBelow = () => {
    const s = useStore.getState();
    const last = page.blocks[page.blocks.length - 1];
    if (last && last.type === 'paragraph' && last.text === '') s.requestFocus(last.id, 0);
    else {
      const nb = newBlock();
      s.insertBlocks(pageId, last?.id ?? null, [nb]);
      s.requestFocus(nb.id, 0);
    }
  };

  const items = slash ? filterTypes(slash.query) : [];

  return (
    <EditorContext.Provider value={ctx}>
      <div className="editor">
        {page.blocks.map((b, i) => (
          <BlockView key={b.id} block={b} index={i} number={numbers[i]} />
        ))}
        <div className="editor-tail" onClick={onClickBelow} />
      </div>
      {slash && items.length > 0 && (
        <div
          className="popover slash-menu"
          style={{ left: Math.min(slash.x, window.innerWidth - 260), top: Math.min(slash.y, window.innerHeight - 340) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="menu-sep">基础块</div>
          {items.map((t, i) => (
            <button
              key={t.type}
              className={i === slash.index ? 'active' : ''}
              onMouseEnter={() => setSlash({ ...slash, index: i })}
              onClick={() => selectSlash(t.type)}
              ref={(el) => {
                if (el && i === slash.index) el.scrollIntoView({ block: 'nearest' });
              }}
            >
              <span className="menu-icon">{t.icon}</span>
              <span className="menu-label">{t.label}</span>
              <span className="menu-hint">{t.hint}</span>
            </button>
          ))}
        </div>
      )}
      <SelectionAI pageId={pageId} />
    </EditorContext.Provider>
  );
}
