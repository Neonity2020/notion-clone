import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockType, Page } from '../types';
import { useStore, BLOCK_TYPES } from '../store';
import { newBlock, normalizeLegacyTables } from '../lib/markdown';
import { BlockView } from './Block';
import { EditorContext, type EditorCtx, type SlashState, type WikiState } from './context';
import { getCaretOffset, setCaretOffset } from './caret';
import { SelectionAI } from '../agent/SelectionAI';
import { searchPages } from '../lib/wikilink';
import { getMultiSelection, replaceMultiSelection, selectedText } from './multiSelection';

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
  const [wiki, setWiki] = useState<WikiState | null>(null);
  const wikiRef = useRef<WikiState | null>(null);
  wikiRef.current = wiki;
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<EditorCtx['dropTarget']>(null);
  const dragAnchor = useRef<{ node: Node; offset: number; block: Element } | null>(null);
  const pageId = page.id;

  useEffect(() => {
    const state = useStore.getState();
    const blocks = state.pages[pageId]?.blocks;
    if (!blocks) return;
    const normalized = normalizeLegacyTables(blocks);
    if (normalized !== blocks) state.setBlocks(pageId, normalized);
  }, [pageId]);

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

  const wikiItems = wiki ? searchPages(useStore.getState().pages, wiki.query) : [];

  const selectWiki = useCallback(
    (title: string) => {
      const cur = wikiRef.current;
      if (!cur) return;
      setWiki(null);
      const s = useStore.getState();
      const block = s.pages[pageId]?.blocks.find((b) => b.id === cur.blockId);
      if (!block) return;
      const before = block.text.slice(0, cur.start);
      const after = block.text.slice(cur.start + 2 + cur.query.length); // skip [[ and query up to caret
      const insertion = `[[${title}]]`;
      const newText = before + insertion + after;
      const el = document.querySelector<HTMLElement>(`[data-block-id="${cur.blockId}"]`);
      if (el) el.textContent = newText;
      s.updateBlock(pageId, cur.blockId, { text: newText });
      s.requestFocus(cur.blockId, before.length + insertion.length);
    },
    [pageId],
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
      checkWiki(blockId, el) {
        const text = el.textContent ?? '';
        const c = getCaretOffset(el);
        if (c === null) return;
        const cur = wikiRef.current;
        if (cur && cur.blockId === blockId) {
          // Still inside [[ ... ? Check that we haven't typed ]]
          const query = text.slice(cur.start + 2, c);
          if (/\n/.test(query) || query.includes(']') || query.length > 60) return setWiki(null);
          setWiki({ ...cur, query, index: 0 });
          return;
        }
        // Detect the start of [[ at the caret (just typed the second [)
        if (c >= 2 && text[c - 1] === '[' && text[c - 2] === '[') {
          setWiki({ blockId, start: c - 2, query: '', index: 0, ...caretRect() });
        } else if (cur) setWiki(null);
      },
      wikiKeyDown(e) {
        const cur = wikiRef.current;
        if (!cur) return false;
        const items = searchPages(useStore.getState().pages, cur.query);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const d = e.key === 'ArrowDown' ? 1 : -1;
          setWiki({ ...cur, index: (cur.index + d + items.length) % items.length });
          return true;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const item = items[cur.index];
          if (item) selectWiki(item.title || item.id);
          else if (cur.query.trim()) selectWiki(cur.query.trim());
          return true;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setWiki(null);
          return true;
        }
        return false;
      },
      closeWiki: () => wikiRef.current && setWiki(null),
    }),
    [pageId, dragId, dropTarget, applyType, selectSlash, selectWiki],
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

  const replaceSelection = (editor: HTMLElement, text: string) => {
    const state = useStore.getState();
    const blocks = state.pages[pageId]?.blocks;
    if (!blocks) return false;
    const selection = getMultiSelection(editor, blocks);
    if (!selection) return false;
    const result = replaceMultiSelection(blocks, selection, text);
    window.getSelection()?.removeAllRanges();
    state.setBlocks(pageId, result.blocks);
    state.requestFocus(result.focusId, result.offset);
    return true;
  };

  const copySelection = (e: React.ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const blocks = useStore.getState().pages[pageId]?.blocks;
    if (!blocks) return;
    const selection = getMultiSelection(e.currentTarget, blocks);
    if (!selection) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', selectedText(blocks, selection));
    if (cut) replaceSelection(e.currentTarget, '');
  };

  return (
    <EditorContext.Provider value={ctx}>
      <div className="editor"
        onMouseDownCapture={(e) => {
          dragAnchor.current = null;
          if (e.button !== 0 || e.shiftKey) return;
          const block = (e.target as Element).closest('[data-block-id][contenteditable]');
          const position = document.caretRangeFromPoint(e.clientX, e.clientY);
          if (block && position && block.contains(position.startContainer)) {
            dragAnchor.current = { node: position.startContainer, offset: position.startOffset, block };
          }
        }}
        onMouseMoveCapture={(e) => {
          const anchor = dragAnchor.current;
          if (!anchor || !(e.buttons & 1) || !anchor.node.isConnected) return;
          const position = document.caretRangeFromPoint(e.clientX, e.clientY);
          const block = position?.startContainer.parentElement?.closest('[data-block-id][contenteditable]');
          if (!position || !block || block === anchor.block || !e.currentTarget.contains(block)) return;
          e.preventDefault();
          window.getSelection()?.setBaseAndExtent(anchor.node, anchor.offset, position.startContainer, position.startOffset);
        }}
        onMouseUpCapture={() => { dragAnchor.current = null; }}
        onCopyCapture={(e) => copySelection(e, false)}
        onCutCapture={(e) => copySelection(e, true)}
        onPasteCapture={(e) => {
          const blocks = useStore.getState().pages[pageId]?.blocks;
          if (!blocks || !getMultiSelection(e.currentTarget, blocks)) return;
          e.preventDefault();
          e.stopPropagation();
          replaceSelection(e.currentTarget, e.clipboardData.getData('text/plain'));
        }}
        onKeyDownCapture={(e) => {
          const blocks = useStore.getState().pages[pageId]?.blocks;
          if (!blocks) return;
          if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'a') {
            const editable = e.currentTarget.querySelectorAll<HTMLElement>('[data-block-id][contenteditable]');
            if (editable.length < 2) return;
            const range = document.createRange();
            range.setStart(editable[0], 0);
            const last = editable[editable.length - 1];
            range.setEnd(last, last.childNodes.length);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (!getMultiSelection(e.currentTarget, blocks) || e.nativeEvent.isComposing) return;
          const text = e.key === 'Backspace' || e.key === 'Delete' ? ''
            : e.key === 'Enter' ? '\n'
            : !e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 ? e.key : null;
          if (text === null) return;
          e.preventDefault();
          e.stopPropagation();
          replaceSelection(e.currentTarget, text);
        }}
      >
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
      {wiki && (
        <div
          className="popover wiki-menu"
          style={{ left: Math.min(wiki.x, window.innerWidth - 280), top: Math.min(wiki.y, window.innerHeight - 320) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="menu-sep">🔗 链接到页面</div>
          {wikiItems.length > 0 ? (
            wikiItems.map((p, i) => (
              <button
                key={p.id}
                className={i === wiki.index ? 'active' : ''}
                onMouseEnter={() => setWiki({ ...wiki, index: i })}
                onClick={() => selectWiki(p.title || p.id)}
                ref={(el) => {
                  if (el && i === wiki.index) el.scrollIntoView({ block: 'nearest' });
                }}
              >
                <span className="menu-icon">{p.icon}</span>
                <span className="menu-label">{p.title || '无标题'}</span>
              </button>
            ))
          ) : (
            <button className="active" onClick={() => selectWiki(wiki.query.trim() || '新页面')}>
              <span className="menu-icon">➕</span>
              <span className="menu-label">创建「{wiki.query.trim() || '新页面'}」</span>
            </button>
          )}
          {wiki.query.trim() && wikiItems.length > 0 && (
            <button className="wiki-create" onClick={() => selectWiki(wiki.query.trim())}>
              <span className="menu-icon">➕</span>
              <span className="menu-label">创建「{wiki.query.trim()}」</span>
            </button>
          )}
        </div>
      )}
      <SelectionAI pageId={pageId} />
    </EditorContext.Provider>
  );
}
