import { create } from 'zustand';
import type { Block, BlockType, Page, PageMap } from './types';
import { uid } from './lib/id';
import { newBlock } from './lib/markdown';

export interface FocusRequest {
  blockId: string;
  /** caret offset; -1 = end */
  offset: number;
  nonce: number;
}

export type MainView = 'page' | 'agent-home';

interface State {
  loaded: boolean;
  pages: PageMap;
  currentPageId: string | null;
  mainView: MainView;
  focus: FocusRequest | null;
  agentOpen: boolean;
  /** ids of blocks recently touched by the agent (for highlight) */
  agentTouched: Record<string, number>;

  // page ops
  hydrate(pages: Page[]): void;
  applyRemote(put: Page[], del: string[]): void;
  replaceAll(pages: PageMap): void;
  createPage(opts?: { parentId?: string | null; title?: string; icon?: string; blocks?: Block[]; afterId?: string }): string;
  updatePage(id: string, patch: Partial<Pick<Page, 'title' | 'icon'>>): void;
  movePage(id: string, parentId: string | null, index?: number): void;
  deletePage(id: string): void;
  openPage(id: string | null): void;
  openAgentHome(): void;

  // block ops
  setBlocks(pageId: string, blocks: Block[]): void;
  updateBlock(pageId: string, blockId: string, patch: Partial<Omit<Block, 'id'>>): void;
  insertBlocks(pageId: string, afterBlockId: string | null, blocks: Block[]): void;
  deleteBlocks(pageId: string, blockIds: string[]): void;
  moveBlock(pageId: string, blockId: string, toIndex: number): void;

  requestFocus(blockId: string, offset?: number): void;
  setAgentOpen(open: boolean): void;
  markAgentTouched(ids: string[]): void;
}

const now = () => Date.now();

export function childrenOf(pages: PageMap, parentId: string | null): Page[] {
  return Object.values(pages)
    .filter((p) => p.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export function descendantIds(pages: PageMap, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of childrenOf(pages, pid)) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

export function pagePath(pages: PageMap, id: string): Page[] {
  const path: Page[] = [];
  let cur: Page | undefined = pages[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? pages[cur.parentId] : undefined;
  }
  return path;
}

function withPage(state: State, pageId: string, fn: (p: Page) => Page): Partial<State> {
  const p = state.pages[pageId];
  if (!p) return {};
  return { pages: { ...state.pages, [pageId]: { ...fn(p), updatedAt: now() } } };
}

const LAST_PAGE_KEY = 'nc:lastPage';

export const useStore = create<State>()((set, get) => ({
  loaded: false,
  pages: {},
  currentPageId: null,
  mainView: 'page',
  focus: null,
  agentOpen: false,
  agentTouched: {},

  hydrate(list) {
    const pages: PageMap = {};
    for (const p of list) pages[p.id] = p;
    let current: string | null = null;
    try {
      current = localStorage.getItem(LAST_PAGE_KEY);
    } catch {}
    if (!current || !pages[current]) current = childrenOf(pages, null)[0]?.id ?? null;
    set({ pages, loaded: true, currentPageId: current });
  },

  applyRemote(put, del) {
    const pages = { ...get().pages };
    for (const p of put) pages[p.id] = p;
    for (const id of del) delete pages[id];
    const cur = get().currentPageId;
    set({ pages, currentPageId: cur && pages[cur] ? cur : childrenOf(pages, null)[0]?.id ?? null });
  },

  replaceAll(pages) {
    const cur = get().currentPageId;
    set({ pages, currentPageId: cur && pages[cur] ? cur : childrenOf(pages, null)[0]?.id ?? null });
  },

  createPage(opts = {}) {
    const id = uid('p_');
    const parentId = opts.parentId ?? null;
    const siblings = childrenOf(get().pages, parentId);
    let order = (siblings[siblings.length - 1]?.order ?? 0) + 1;
    if (opts.afterId) {
      const idx = siblings.findIndex((s) => s.id === opts.afterId);
      if (idx >= 0) {
        const next = siblings[idx + 1];
        order = next ? (siblings[idx].order + next.order) / 2 : siblings[idx].order + 1;
      }
    }
    const page: Page = {
      id,
      title: opts.title ?? '',
      icon: opts.icon ?? '📄',
      parentId,
      order,
      blocks: opts.blocks && opts.blocks.length ? opts.blocks : [newBlock()],
      createdAt: now(),
      updatedAt: now(),
    };
    set((s) => ({ pages: { ...s.pages, [id]: page } }));
    return id;
  },

  updatePage(id, patch) {
    set((s) => withPage(s, id, (p) => ({ ...p, ...patch })));
  },

  movePage(id, parentId, index) {
    const pages = get().pages;
    if (!pages[id]) return;
    if (parentId && (parentId === id || descendantIds(pages, id).includes(parentId))) {
      throw new Error('不能把页面移动到它自己的子页面下');
    }
    const siblings = childrenOf(pages, parentId).filter((p) => p.id !== id);
    const i = index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length));
    const before = siblings[i - 1]?.order;
    const after = siblings[i]?.order;
    const order =
      before === undefined && after === undefined ? 1 : before === undefined ? after! - 1 : after === undefined ? before + 1 : (before + after) / 2;
    set((s) => withPage(s, id, (p) => ({ ...p, parentId, order })));
  },

  deletePage(id) {
    const s = get();
    const ids = [id, ...descendantIds(s.pages, id)];
    const pages = { ...s.pages };
    const parent = pages[id]?.parentId ?? null;
    for (const x of ids) delete pages[x];
    let current = s.currentPageId;
    if (current && !pages[current]) current = parent && pages[parent] ? parent : childrenOf(pages, null)[0]?.id ?? null;
    set({ pages, currentPageId: current });
  },

  openPage(id) {
    try {
      if (id) localStorage.setItem(LAST_PAGE_KEY, id);
    } catch {}
    set({ currentPageId: id, mainView: 'page' });
  },

  openAgentHome() {
    set({ mainView: 'agent-home' });
  },

  setBlocks(pageId, blocks) {
    set((s) => withPage(s, pageId, (p) => ({ ...p, blocks: blocks.length ? blocks : [newBlock()] })));
  },

  updateBlock(pageId, blockId, patch) {
    set((s) =>
      withPage(s, pageId, (p) => ({
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const nb = { ...b, ...patch };
          if (nb.type === 'todo' && nb.checked === undefined) nb.checked = false;
          if (nb.type !== 'todo') delete nb.checked;
          return nb;
        }),
      })),
    );
  },

  insertBlocks(pageId, afterBlockId, blocks) {
    set((s) =>
      withPage(s, pageId, (p) => {
        const arr = [...p.blocks];
        const idx = afterBlockId === null ? -1 : arr.findIndex((b) => b.id === afterBlockId);
        const at = afterBlockId === null ? 0 : idx < 0 ? arr.length : idx + 1;
        arr.splice(at, 0, ...blocks);
        return { ...p, blocks: arr };
      }),
    );
  },

  deleteBlocks(pageId, blockIds) {
    const del = new Set(blockIds);
    set((s) =>
      withPage(s, pageId, (p) => {
        const blocks = p.blocks.filter((b) => !del.has(b.id));
        return { ...p, blocks: blocks.length ? blocks : [newBlock()] };
      }),
    );
  },

  moveBlock(pageId, blockId, toIndex) {
    set((s) =>
      withPage(s, pageId, (p) => {
        const arr = [...p.blocks];
        const from = arr.findIndex((b) => b.id === blockId);
        if (from < 0) return p;
        const [b] = arr.splice(from, 1);
        arr.splice(Math.max(0, Math.min(toIndex, arr.length)), 0, b);
        return { ...p, blocks: arr };
      }),
    );
  },

  requestFocus(blockId, offset = -1) {
    set({ focus: { blockId, offset, nonce: Math.random() } });
  },

  setAgentOpen(open) {
    set({ agentOpen: open });
  },

  markAgentTouched(ids) {
    const t = now();
    set((s) => {
      const next = { ...s.agentTouched };
      for (const id of ids) next[id] = t;
      return { agentTouched: next };
    });
    setTimeout(() => {
      set((s) => {
        const next = { ...s.agentTouched };
        for (const id of ids) if (next[id] === t) delete next[id];
        return { agentTouched: next };
      });
    }, 2500);
  },
}));

export const BLOCK_TYPES: { type: BlockType; label: string; hint: string; icon: string; keywords: string }[] = [
  { type: 'paragraph', label: '文本', hint: '普通段落', icon: 'T', keywords: 'text paragraph wenben' },
  { type: 'h1', label: '一级标题', hint: '# ', icon: 'H1', keywords: 'h1 heading title biaoti' },
  { type: 'h2', label: '二级标题', hint: '## ', icon: 'H2', keywords: 'h2 heading biaoti' },
  { type: 'h3', label: '三级标题', hint: '### ', icon: 'H3', keywords: 'h3 heading biaoti' },
  { type: 'bullet', label: '无序列表', hint: '- ', icon: '•', keywords: 'bullet list ul liebiao' },
  { type: 'numbered', label: '有序列表', hint: '1. ', icon: '1.', keywords: 'numbered list ol liebiao' },
  { type: 'todo', label: '待办', hint: '[] ', icon: '☐', keywords: 'todo task checkbox daiban' },
  { type: 'quote', label: '引用', hint: '> ', icon: '❝', keywords: 'quote yinyong' },
  { type: 'callout', label: '标注', hint: '!> ', icon: '💡', keywords: 'callout note tip biaozhu' },
  { type: 'code', label: '代码', hint: '```', icon: '</>', keywords: 'code daima' },
  { type: 'divider', label: '分割线', hint: '---', icon: '—', keywords: 'divider hr line fengexian' },
];
