import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { Block, BlockType } from '../types';
import { useStore, BLOCK_TYPES } from '../store';
import { newBlock, markdownToBlocks } from '../lib/markdown';
import { displayToRaw, renderInlineHTML, hasInlineMarks } from '../lib/inline';
import { caretOnEdgeLine, getCaretOffset, getSelectionOffsets, setCaretOffset } from './caret';
import { useEditor } from './context';
import { parseTable } from '../lib/table';

const LIST_TYPES: BlockType[] = ['bullet', 'numbered', 'todo'];
const BULLETS = ['•', '◦', '▪'];

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  h1: '一级标题',
  h2: '二级标题',
  h3: '三级标题',
  bullet: '列表',
  numbered: '列表',
  todo: '待办事项',
  quote: '引用',
  callout: '标注内容',
  code: '代码',
};

/** Markdown-style shortcuts typed at the start of a block. */
const SHORTCUTS: { re: RegExp; type: BlockType; checked?: boolean }[] = [
  { re: /^#\s/, type: 'h1' },
  { re: /^##\s/, type: 'h2' },
  { re: /^###\s/, type: 'h3' },
  { re: /^[-*+]\s/, type: 'bullet' },
  { re: /^1[.)]\s/, type: 'numbered' },
  { re: /^\[\s?\]\s/, type: 'todo' },
  { re: /^\[[xX]\]\s/, type: 'todo', checked: true },
  { re: /^>\s/, type: 'quote' },
  { re: /^!>\s/, type: 'callout' },
  { re: /^```$/, type: 'code' },
];

interface Props {
  block: Block;
  index: number;
  number: number;
}

function BlockViewInner({ block, index, number }: Props) {
  const ed = useEditor();
  const pageId = ed.pageId;
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const touched = useStore((s) => !!s.agentTouched[block.id]);
  const focusReq = useStore((s) => (s.focus?.blockId === block.id ? s.focus : null));
  const composing = useRef(false);
  const isCode = block.type === 'code' || block.type === 'table';
  const richRender = (!isCode || block.type === 'table') && !focused;

  const st = () => useStore.getState();
  const blocks = () => st().pages[pageId]?.blocks ?? [];

  // Sync DOM from state (contentEditable is uncontrolled while typing).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const table = block.type === 'table' && richRender ? parseTable(block.text) : null;
    if (table) {
      const cell = (text: string, i: number, tag: string) => `<${tag} style="text-align:${table.align[i]}">${renderInlineHTML(text)}</${tag}>`;
      const html = `<table><thead><tr>${table.header.map((text, i) => cell(text, i, 'th')).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((text, i) => cell(text, i, 'td')).join('')}</tr>`).join('')}</tbody></table>`;
      if (el.innerHTML !== html) el.innerHTML = html;
    } else if (richRender && hasInlineMarks(block.text)) {
      const html = renderInlineHTML(block.text);
      if (el.innerHTML !== html) el.innerHTML = html;
    } else if (el.textContent !== block.text) {
      el.textContent = block.text;
    }
  }, [block.text, richRender]);

  // Programmatic focus requests.
  useLayoutEffect(() => {
    if (!focusReq) return;
    const el = ref.current;
    if (!el) return;
    if (block.type === 'divider') {
      el.focus();
      return;
    }
    if (el.textContent !== block.text) el.textContent = block.text;
    el.focus();
    setCaretOffset(el, focusReq.offset);
  }, [focusReq?.nonce]);

  const focusBlock = (id: string | undefined, offset = -1) => {
    if (id) st().requestFocus(id, offset);
  };

  const onFocus = () => {
    const el = ref.current!;
    if (block.type === 'table') {
      el.textContent = block.text;
      setCaretOffset(el, -1);
    } else if (!isCode && hasInlineMarks(block.text) && el.textContent !== block.text) {
      // switch from rendered view to raw markdown, keeping the caret in place
      const off = getCaretOffset(el);
      el.textContent = block.text;
      setCaretOffset(el, off === null ? -1 : displayToRaw(block.text, off));
    }
    setFocused(true);
  };

  const onBlur = () => {
    setFocused(false);
    ed.closeSlash();
    ed.closeWiki();
  };

  const onInput = () => {
    const el = ref.current!;
    let text = el.textContent ?? '';
    if (text === '' && el.innerHTML !== '') el.innerHTML = '';
    if (!composing.current && block.type !== 'code') {
      for (const sc of SHORTCUTS) {
        if (sc.re.test(text) && (block.type === 'paragraph' || (LIST_TYPES.includes(block.type) && LIST_TYPES.includes(sc.type)))) {
          if (sc.type === block.type) break;
          text = text.replace(sc.re, '');
          el.textContent = text;
          st().updateBlock(pageId, block.id, { type: sc.type, text, checked: sc.checked });
          st().requestFocus(block.id, 0);
          return;
        }
      }
      if (block.type === 'paragraph' && /^(---|\*\*\*)$/.test(text)) {
        const p = newBlock();
        st().updateBlock(pageId, block.id, { type: 'divider', text: '' });
        st().insertBlocks(pageId, block.id, [p]);
        focusBlock(p.id, 0);
        return;
      }
    }
    st().updateBlock(pageId, block.id, { text });
    if (!composing.current) {
      ed.checkSlash(block.id, el);
      ed.checkWiki(block.id, el);
    }
  };

  const splitAt = (offset: number) => {
    const text = block.text;
    const before = text.slice(0, offset);
    const after = text.slice(offset);
    const continueType = LIST_TYPES.includes(block.type) ? block.type : 'paragraph';
    const nb = newBlock(continueType, after, LIST_TYPES.includes(block.type) ? { indent: block.indent } : {});
    if (offset === 0 && text.length > 0) {
      // caret at start: insert an empty block above, keep this block intact
      const prevId = blocks()[index - 1]?.id ?? null;
      const empty = newBlock(continueType, '', LIST_TYPES.includes(block.type) ? { indent: block.indent } : {});
      st().insertBlocks(pageId, prevId, [empty]);
      focusBlock(block.id, 0);
      return;
    }
    if (ref.current) ref.current.textContent = before;
    st().updateBlock(pageId, block.id, { text: before });
    st().insertBlocks(pageId, block.id, [nb]);
    focusBlock(nb.id, 0);
  };

  const insertText = (t: string) => {
    document.execCommand('insertText', false, t);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing || composing.current) return;
    if (ed.slashKeyDown(e)) return;
    if (ed.wikiKeyDown(e)) return;
    const el = ref.current!;
    const mod = e.metaKey || e.ctrlKey;
    const all = blocks();
    const prev = all[index - 1];
    const next = all[index + 1];

    if (block.type === 'divider') {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        st().deleteBlocks(pageId, [block.id]);
        focusBlock(prev?.id ?? next?.id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const nb = newBlock();
        st().insertBlocks(pageId, block.id, [nb]);
        focusBlock(nb.id, 0);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        focusBlock(prev?.id);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        focusBlock(next?.id, 0);
      }
      return;
    }

    const sel = getSelectionOffsets(el);
    const collapsed = !!sel && sel.start === sel.end;
    const offset = sel?.start ?? 0;
    const len = (el.textContent ?? '').length;

    // Move block up/down
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      st().moveBlock(pageId, block.id, index + (e.key === 'ArrowUp' ? -1 : 1));
      focusBlock(block.id, offset);
      return;
    }

    switch (e.key) {
      case 'Enter': {
        if (isCode && !mod) {
          e.preventDefault();
          insertText('\n');
          return;
        }
        if (e.shiftKey && !mod) {
          e.preventDefault();
          insertText('\n');
          return;
        }
        e.preventDefault();
        if (isCode) {
          const nb = newBlock();
          st().insertBlocks(pageId, block.id, [nb]);
          focusBlock(nb.id, 0);
          return;
        }
        // empty list item: outdent, then exit the list
        if (LIST_TYPES.includes(block.type) && block.text === '') {
          if ((block.indent ?? 0) > 0) st().updateBlock(pageId, block.id, { indent: (block.indent ?? 0) - 1 });
          else st().updateBlock(pageId, block.id, { type: 'paragraph', indent: 0 });
          focusBlock(block.id, 0);
          return;
        }
        if (sel && !collapsed) {
          const t = block.text.slice(0, sel.start) + block.text.slice(sel.end);
          st().updateBlock(pageId, block.id, { text: t });
          if (ref.current) ref.current.textContent = t;
        }
        splitAt(offset);
        return;
      }
      case 'Backspace': {
        if (!collapsed || offset !== 0) return;
        e.preventDefault();
        if ((block.indent ?? 0) > 0) {
          st().updateBlock(pageId, block.id, { indent: (block.indent ?? 0) - 1 });
          focusBlock(block.id, 0);
          return;
        }
        if (block.type !== 'paragraph') {
          st().updateBlock(pageId, block.id, { type: 'paragraph' });
          focusBlock(block.id, 0);
          return;
        }
        if (!prev) return;
        if (prev.type === 'divider') {
          st().deleteBlocks(pageId, [prev.id]);
          focusBlock(block.id, 0);
          return;
        }
        st().updateBlock(pageId, prev.id, { text: prev.text + block.text });
        st().deleteBlocks(pageId, [block.id]);
        focusBlock(prev.id, prev.text.length);
        return;
      }
      case 'Delete': {
        if (!collapsed || offset !== len || !next) return;
        e.preventDefault();
        if (next.type === 'divider') st().deleteBlocks(pageId, [next.id]);
        else {
          st().updateBlock(pageId, block.id, { text: block.text + next.text });
          st().deleteBlocks(pageId, [next.id]);
        }
        focusBlock(block.id, len);
        return;
      }
      case 'Tab': {
        e.preventDefault();
        if (isCode) {
          if (!e.shiftKey) insertText('  ');
          return;
        }
        if (!LIST_TYPES.includes(block.type) && block.type !== 'paragraph') return;
        const cur = block.indent ?? 0;
        const maxIndent = prev && (LIST_TYPES.includes(prev.type) || prev.type === 'paragraph') ? Math.min(4, (prev.indent ?? 0) + 1) : 0;
        const indent = e.shiftKey ? Math.max(0, cur - 1) : Math.min(maxIndent, cur + 1);
        if (indent !== cur) st().updateBlock(pageId, block.id, { indent });
        focusBlock(block.id, offset);
        return;
      }
      case 'ArrowUp':
        if (!e.shiftKey && caretOnEdgeLine(el, 'top') && prev) {
          e.preventDefault();
          focusBlock(prev.id);
        }
        return;
      case 'ArrowDown':
        if (!e.shiftKey && caretOnEdgeLine(el, 'bottom') && next) {
          e.preventDefault();
          focusBlock(next.id, 0);
        }
        return;
      case 'ArrowLeft':
        if (!e.shiftKey && collapsed && offset === 0 && prev) {
          e.preventDefault();
          focusBlock(prev.id);
        }
        return;
      case 'ArrowRight':
        if (!e.shiftKey && collapsed && offset === len && next) {
          e.preventDefault();
          focusBlock(next.id, 0);
        }
        return;
      case 'Escape':
        el.blur();
        return;
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    if (isCode || !text.includes('\n')) {
      insertText(isCode ? text : text.replace(/\n/g, ' '));
      return;
    }
    const parsed = markdownToBlocks(text);
    if (!parsed.length) return;
    if (block.text === '' && block.type === 'paragraph') {
      const all = blocks();
      const nextBlocks = [...all.slice(0, index), ...parsed, ...all.slice(index + 1)];
      st().setBlocks(pageId, nextBlocks);
    } else {
      st().insertBlocks(pageId, block.id, parsed);
    }
    focusBlock(parsed[parsed.length - 1].id);
  };

  const onMouseDownRendered = (e: React.MouseEvent) => {
    // Wiki-link: intercept on mouse-down BEFORE focus switches to raw text
    const wikiA = (e.target as HTMLElement).closest('a.wikilink') as HTMLAnchorElement | null;
    if (wikiA) {
      e.preventDefault(); // stop focus + content swap
      const target = wikiA.getAttribute('data-target');
      if (!target) return;
      const state = useStore.getState();
      const existing = Object.values(state.pages).find(
        (p) => p.title.trim().toLowerCase() === target.trim().toLowerCase(),
      );
      if (existing) {
        state.openPage(existing.id);
      } else if (window.confirm(`页面「${target}」不存在，是否创建？`)) {
        const id = state.createPage({ title: target });
        state.openPage(id);
      }
      return;
    }
  };

  const onClickRendered = (e: React.MouseEvent) => {
    // Regular link click (wiki links are handled in onMouseDownRendered)
    const a = (e.target as HTMLElement).closest('a:not(.wikilink)');
    if (a && (e.metaKey || e.ctrlKey || !focused)) {
      e.preventDefault();
      window.open(a.getAttribute('href') ?? '#', '_blank', 'noopener');
    }
  };

  // drag & drop
  const onDragOver = (e: React.DragEvent) => {
    if (!ed.dragId) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pos = e.clientY < r.top + r.height / 2 ? 'before' : 'after';
    if (ed.dropTarget?.id !== block.id || ed.dropTarget.pos !== pos) ed.setDropTarget({ id: block.id, pos });
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = ed.dragId;
    const target = ed.dropTarget;
    ed.setDragId(null);
    ed.setDropTarget(null);
    if (!dragId || !target || dragId === block.id) return;
    const all = blocks();
    const from = all.findIndex((b) => b.id === dragId);
    let to = all.findIndex((b) => b.id === block.id) + (target.pos === 'after' ? 1 : 0);
    if (from < to) to -= 1;
    st().moveBlock(pageId, dragId, to);
  };

  const indent = block.indent ?? 0;
  const dropCls = ed.dropTarget?.id === block.id ? ` drop-${ed.dropTarget.pos}` : '';

  let marker: React.ReactNode = null;
  if (block.type === 'bullet') marker = <span className="marker bullet">{BULLETS[indent % 3]}</span>;
  else if (block.type === 'numbered') marker = <span className="marker number">{number}.</span>;
  else if (block.type === 'todo')
    marker = (
      <span className="marker">
        <input
          type="checkbox"
          checked={!!block.checked}
          onChange={(e) => st().updateBlock(pageId, block.id, { checked: e.target.checked })}
        />
      </span>
    );
  else if (block.type === 'callout') marker = <span className="marker callout-icon">💡</span>;

  return (
    <div
      className={`block-row type-${block.type}${touched ? ' agent-touched' : ''}${dropCls}${ed.dragId === block.id ? ' dragging' : ''}`}
      style={{ paddingLeft: indent * 24 }}
      data-row-id={block.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="block-controls" contentEditable={false}>
        <button
          className="ctl"
          title="在下方添加块"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const nb = newBlock('paragraph', '/');
            st().insertBlocks(pageId, block.id, [nb]);
            setTimeout(() => ed.openSlashAt(nb.id), 30);
          }}
        >
          +
        </button>
        <button
          className="ctl handle"
          title="拖动排序 / 点击打开菜单"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
            const row = (e.currentTarget as HTMLElement).closest('.block-row');
            if (row) e.dataTransfer.setDragImage(row, 0, 0);
            ed.setDragId(block.id);
          }}
          onDragEnd={() => {
            ed.setDragId(null);
            ed.setDropTarget(null);
          }}
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋮⋮
        </button>
        {menuOpen && (
          <BlockMenu
            onClose={() => setMenuOpen(false)}
            onDelete={() => {
              const all = blocks();
              st().deleteBlocks(pageId, [block.id]);
              focusBlock((all[index - 1] ?? all[index + 1])?.id);
            }}
            onDuplicate={() => {
              const copy = { ...block, id: newBlock().id };
              st().insertBlocks(pageId, block.id, [copy]);
            }}
            onTurnInto={(t) => ed.applyType(block.id, t)}
          />
        )}
      </div>
      {marker}
      {block.type === 'divider' ? (
        <div className="block divider" tabIndex={0} ref={ref} onKeyDown={onKeyDown} data-block-id={block.id}>
          <hr />
        </div>
      ) : (
        <div
          ref={ref}
          className={`block ${block.type}${block.type === 'todo' && block.checked ? ' checked' : ''}`}
          contentEditable={'plaintext-only' as any}
          suppressContentEditableWarning
          spellCheck={isCode ? false : undefined}
          data-block-id={block.id}
          data-placeholder={focused ? PLACEHOLDER[block.type] ?? '输入 / 唤起命令，或直接开始写作…' : PLACEHOLDER[block.type] ?? ''}
          onFocus={onFocus}
          onBlur={onBlur}
          onInput={onInput}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onMouseDown={onMouseDownRendered}
          onClick={onClickRendered}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={() => {
            composing.current = false;
            onInput();
          }}
        />
      )}
    </div>
  );
}

function BlockMenu({
  onClose,
  onDelete,
  onDuplicate,
  onTurnInto,
}: {
  onClose(): void;
  onDelete(): void;
  onDuplicate(): void;
  onTurnInto(t: BlockType): void;
}) {
  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="popover block-menu">
        <button onClick={() => (onDelete(), onClose())}>🗑 删除</button>
        <button onClick={() => (onDuplicate(), onClose())}>⧉ 复制</button>
        <div className="menu-sep">转换为</div>
        {BLOCK_TYPES.filter((t) => t.type !== 'divider').map((t) => (
          <button key={t.type} onClick={() => (onTurnInto(t.type), onClose())}>
            <span className="menu-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

export const BlockView = memo(BlockViewInner);
