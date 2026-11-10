import { useStore, childrenOf, pagePath } from '../store';
import { markdownToBlocks } from '../lib/markdown';
import type { Block, BlockType, Page, PageMap } from '../types';
import type { ToolDef } from './llm';
import type { AgentTool } from '@earendil-works/pi-agent-core';

export type AgentMode = 'ask' | 'agent';

export interface ToolContext {
  /** page ids changed by the agent during this run (for undo) */
  touchedPages: Set<string>;
}

const BLOCK_TYPES: BlockType[] = ['paragraph', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code', 'table', 'divider'];

function fmtBlock(b: Block): string {
  const meta: string[] = [b.type];
  if (b.indent) meta.push(`indent=${b.indent}`);
  if (b.type === 'todo') meta.push(b.checked ? 'checked' : 'unchecked');
  return `[${b.id}] (${meta.join(', ')}) ${b.text.replace(/\n/g, '\\n')}`;
}

function outline(pages: PageMap, parentId: string | null, depth = 0): string[] {
  return childrenOf(pages, parentId).flatMap((p) => [
    `${'  '.repeat(depth)}- ${p.icon} ${p.title || '无标题'} (id: ${p.id}, ${p.blocks.length} blocks)`,
    ...outline(pages, p.id, depth + 1),
  ]);
}

function requirePage(id: unknown): Page {
  const p = useStore.getState().pages[String(id)];
  if (!p) throw new Error(`页面不存在: ${id}。先调用 list_pages 或 search_pages 获取正确的 page_id。`);
  return p;
}

function snippet(text: string, q: string): string {
  const i = text.toLowerCase().indexOf(q);
  const start = Math.max(0, i - 40);
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 60) + (i + q.length + 60 < text.length ? '…' : '');
}

interface ToolSpec {
  def: ToolDef;
  write: boolean;
  run(args: any, ctx: ToolContext): unknown;
}

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
  write: boolean,
  run: ToolSpec['run'],
): ToolSpec => ({
  def: { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } },
  write,
  run,
});

const S = (description: string) => ({ type: 'string', description });

export const TOOLS: ToolSpec[] = [
  tool('list_pages', '列出工作区中所有页面的树形结构（标题、图标、id、块数量）。', {}, [], false, () => {
    const lines = outline(useStore.getState().pages, null);
    return lines.length ? lines.join('\n') : '（工作区为空）';
  }),

  tool(
    'search_pages',
    '在所有页面的标题和内容中全文搜索关键词（不区分大小写），返回匹配的页面和块片段。',
    { query: S('搜索关键词') },
    ['query'],
    false,
    ({ query }) => {
      const q = String(query ?? '').toLowerCase().trim();
      if (!q) throw new Error('query 不能为空');
      const results: string[] = [];
      for (const p of Object.values(useStore.getState().pages)) {
        const hits = p.blocks.filter((b) => b.text.toLowerCase().includes(q));
        const titleHit = p.title.toLowerCase().includes(q);
        if (!titleHit && !hits.length) continue;
        results.push(
          `## ${p.icon} ${p.title || '无标题'} (id: ${p.id})${titleHit ? ' [标题匹配]' : ''}\n` +
            hits.slice(0, 5).map((b) => `  [${b.id}] ${snippet(b.text, q)}`).join('\n'),
        );
      }
      return results.length ? results.slice(0, 20).join('\n') : `没有找到包含「${query}」的内容。`;
    },
  ),

  tool(
    'read_page',
    '读取一个页面的完整内容。每行格式为 "[block_id] (type, ...) text"，编辑块时需要用到 block_id。',
    { page_id: S('页面 id') },
    ['page_id'],
    false,
    ({ page_id }) => {
      const pages = useStore.getState().pages;
      const p = requirePage(page_id);
      const path = pagePath(pages, p.id).map((x) => x.title || '无标题').join(' / ');
      const kids = childrenOf(pages, p.id).map((c) => `${c.icon} ${c.title || '无标题'} (${c.id})`);
      return [
        `标题: ${p.title || '无标题'}`,
        `图标: ${p.icon}`,
        `路径: ${path}`,
        kids.length ? `子页面: ${kids.join(', ')}` : '子页面: 无',
        `更新时间: ${new Date(p.updatedAt).toLocaleString()}`,
        '内容:',
        ...p.blocks.map(fmtBlock),
      ].join('\n');
    },
  ),

  tool(
    'open_page',
    '在界面中打开（导航到）指定页面，让用户看到它。',
    { page_id: S('页面 id') },
    ['page_id'],
    false,
    ({ page_id }) => {
      const p = requirePage(page_id);
      const s = useStore.getState();
      if (s.mainView === 'agent-home') s.setAgentOpen(true);
      s.openPage(p.id);
      return `已打开「${p.title || '无标题'}」`;
    },
  ),

  tool(
    'insert_blocks',
    '向页面插入内容。content 使用 Markdown（支持 # 标题、- 列表、1. 有序列表、- [ ] 待办、> 引用、> [!NOTE] 标注、``` 代码块、--- 分割线、**粗体** *斜体* `代码` [链接](url)）。',
    {
      page_id: S('页面 id'),
      markdown: S('要插入的 Markdown 内容'),
      after_block_id: S('插入到该块之后；传 "start" 插入到页面开头；省略则追加到末尾'),
    },
    ['page_id', 'markdown'],
    true,
    ({ page_id, markdown, after_block_id }, ctx) => {
      const p = requirePage(page_id);
      const blocks = markdownToBlocks(String(markdown ?? ''));
      if (!blocks.length) throw new Error('markdown 为空');
      let after: string | null;
      if (after_block_id === 'start') after = null;
      else if (after_block_id) {
        if (!p.blocks.some((b) => b.id === after_block_id)) throw new Error(`块不存在: ${after_block_id}`);
        after = after_block_id;
      } else after = p.blocks[p.blocks.length - 1]?.id ?? null;
      // replace a lone empty placeholder block instead of appending after it
      const s = useStore.getState();
      if (p.blocks.length === 1 && p.blocks[0].type === 'paragraph' && !p.blocks[0].text) s.setBlocks(p.id, blocks);
      else s.insertBlocks(p.id, after, blocks);
      ctx.touchedPages.add(p.id);
      s.markAgentTouched(blocks.map((b) => b.id));
      return `已插入 ${blocks.length} 个块: ${blocks.map((b) => b.id).join(', ')}`;
    },
  ),

  tool(
    'update_block',
    '修改单个块的文本、类型、待办勾选状态或缩进。只传需要修改的字段。',
    {
      page_id: S('页面 id'),
      block_id: S('块 id'),
      text: S('新的文本（可包含行内 Markdown）'),
      type: { type: 'string', enum: BLOCK_TYPES, description: '新的块类型' },
      checked: { type: 'boolean', description: '待办是否完成' },
      indent: { type: 'integer', minimum: 0, maximum: 4, description: '列表缩进层级' },
    },
    ['page_id', 'block_id'],
    true,
    ({ page_id, block_id, text, type, checked, indent }, ctx) => {
      const p = requirePage(page_id);
      if (!p.blocks.some((b) => b.id === block_id)) throw new Error(`块不存在: ${block_id}`);
      if (type !== undefined && !BLOCK_TYPES.includes(type)) throw new Error(`未知块类型: ${type}`);
      const patch: Partial<Block> = {};
      if (text !== undefined) patch.text = String(text);
      if (type !== undefined) patch.type = type;
      if (checked !== undefined) patch.checked = !!checked;
      if (indent !== undefined) patch.indent = Math.max(0, Math.min(4, Number(indent) || 0));
      useStore.getState().updateBlock(p.id, block_id, patch);
      useStore.getState().markAgentTouched([block_id]);
      ctx.touchedPages.add(p.id);
      return `已更新块 ${block_id}`;
    },
  ),

  tool(
    'delete_blocks',
    '删除页面中的一个或多个块。',
    { page_id: S('页面 id'), block_ids: { type: 'array', items: { type: 'string' }, description: '要删除的块 id 列表' } },
    ['page_id', 'block_ids'],
    true,
    ({ page_id, block_ids }, ctx) => {
      const p = requirePage(page_id);
      const ids: string[] = Array.isArray(block_ids) ? block_ids : [block_ids];
      const existing = ids.filter((id) => p.blocks.some((b) => b.id === id));
      if (!existing.length) throw new Error('没有找到要删除的块');
      useStore.getState().deleteBlocks(p.id, existing);
      ctx.touchedPages.add(p.id);
      return `已删除 ${existing.length} 个块`;
    },
  ),

  tool(
    'replace_page_content',
    '用新的 Markdown 内容整体替换页面的全部块（适合大幅重写或重新组织一个页面）。',
    { page_id: S('页面 id'), markdown: S('新的完整页面内容 (Markdown)') },
    ['page_id', 'markdown'],
    true,
    ({ page_id, markdown }, ctx) => {
      const p = requirePage(page_id);
      const blocks = markdownToBlocks(String(markdown ?? ''));
      useStore.getState().setBlocks(p.id, blocks);
      useStore.getState().markAgentTouched(blocks.map((b) => b.id));
      ctx.touchedPages.add(p.id);
      return `页面内容已替换为 ${blocks.length} 个块`;
    },
  ),

  tool(
    'create_page',
    '创建新页面，可指定父页面（作为子页面）和初始 Markdown 内容。返回新页面 id。',
    {
      title: S('页面标题'),
      icon: S('一个 emoji 图标，可选'),
      parent_id: S('父页面 id；省略则创建在顶层'),
      markdown: S('初始内容 (Markdown)，可选'),
    },
    ['title'],
    true,
    ({ title, icon, parent_id, markdown }, ctx) => {
      if (parent_id) requirePage(parent_id);
      const blocks = markdown ? markdownToBlocks(String(markdown)) : [];
      const id = useStore.getState().createPage({
        title: String(title ?? ''),
        icon: icon ? String(icon) : '📄',
        parentId: parent_id ? String(parent_id) : null,
        blocks,
      });
      ctx.touchedPages.add(id);
      return `已创建页面「${title}」，id: ${id}`;
    },
  ),

  tool(
    'update_page',
    '修改页面标题或图标。',
    { page_id: S('页面 id'), title: S('新标题'), icon: S('新的 emoji 图标') },
    ['page_id'],
    true,
    ({ page_id, title, icon }, ctx) => {
      const p = requirePage(page_id);
      const patch: Partial<Page> = {};
      if (title !== undefined) patch.title = String(title);
      if (icon !== undefined) patch.icon = String(icon);
      useStore.getState().updatePage(p.id, patch);
      ctx.touchedPages.add(p.id);
      return '页面已更新';
    },
  ),

  tool(
    'move_page',
    '移动页面：改变父页面和/或在兄弟页面中的位置，用于整理页面结构。',
    {
      page_id: S('要移动的页面 id'),
      parent_id: { type: ['string', 'null'], description: '新的父页面 id；null 表示移到顶层' },
      index: { type: 'integer', description: '在新父页面下的位置（从 0 开始），省略则放到最后' },
    },
    ['page_id', 'parent_id'],
    true,
    ({ page_id, parent_id, index }, ctx) => {
      const p = requirePage(page_id);
      const parent = parent_id ? requirePage(parent_id).id : null;
      useStore.getState().movePage(p.id, parent, index === undefined ? undefined : Number(index));
      ctx.touchedPages.add(p.id);
      return '页面已移动';
    },
  ),

  tool(
    'delete_page',
    '删除页面及其所有子页面。这是破坏性操作，仅在用户明确要求时使用。',
    { page_id: S('页面 id') },
    ['page_id'],
    true,
    ({ page_id }, ctx) => {
      const pages = useStore.getState().pages;
      const p = requirePage(page_id);
      const all = [p.id, ...Object.values(pages).filter((x) => pagePath(pages, x.id).some((a) => a.id === p.id)).map((x) => x.id)];
      all.forEach((id) => ctx.touchedPages.add(id));
      useStore.getState().deletePage(p.id);
      return `已删除页面「${p.title || '无标题'}」${all.length > 1 ? `及 ${all.length - 1} 个子页面` : ''}`;
    },
  ),
];

export function toolDefs(mode: AgentMode): ToolDef[] {
  return TOOLS.filter((t) => mode === 'agent' || !t.write).map((t) => t.def);
}

/**
 * Creates Pi-SDK compatible AgentTool instances for the Pi Agent runtime.
 */
export function createPiTools(mode: AgentMode, ctx: ToolContext): AgentTool[] {
  return TOOLS.filter((t) => mode === 'agent' || !t.write).map((t) => ({
    name: t.def.function.name,
    label: describeCall(t.def.function.name, '{}'),
    description: t.def.function.description,
    parameters: t.def.function.parameters,
    execute: async (_toolCallId: string, params: any) => {
      const out = await runTool(t.def.function.name, JSON.stringify(params ?? {}), mode, ctx);
      return {
        content: [{ type: 'text' as const, text: out.output }],
        details: { ok: out.ok },
        isError: !out.ok,
      };
    },
  }));
}

export function isWriteTool(name: string) {
  return !!TOOLS.find((t) => t.def.function.name === name)?.write;
}

export async function runTool(name: string, rawArgs: string, mode: AgentMode, ctx: ToolContext): Promise<{ ok: boolean; output: string }> {
  const spec = TOOLS.find((t) => t.def.function.name === name);
  if (!spec) return { ok: false, output: `未知工具: ${name}` };
  if (spec.write && mode !== 'agent') return { ok: false, output: '当前是只读「问答」模式，不能修改内容。请告诉用户切换到 Agent 模式。' };
  let args: any = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { ok: false, output: `参数不是合法的 JSON: ${rawArgs.slice(0, 200)}` };
  }
  try {
    const out = await spec.run(args, ctx);
    return { ok: true, output: typeof out === 'string' ? out : JSON.stringify(out) };
  } catch (e) {
    return { ok: false, output: `错误: ${(e as Error).message}` };
  }
}

/** Human-readable label for a tool call in the UI. */
export function describeCall(name: string, rawArgs: string): string {
  let a: any = {};
  try {
    a = JSON.parse(rawArgs || '{}');
  } catch {}
  const title = (id: string) => {
    const p = useStore.getState().pages[id];
    return p ? `「${p.title || '无标题'}」` : '';
  };
  switch (name) {
    case 'list_pages': return '📚 浏览页面列表';
    case 'search_pages': return `🔍 搜索「${a.query ?? ''}」`;
    case 'read_page': return `📖 阅读${title(a.page_id)}`;
    case 'open_page': return `↗️ 打开${title(a.page_id)}`;
    case 'insert_blocks': return `✍️ 在${title(a.page_id)}插入内容`;
    case 'update_block': return `✏️ 修改${title(a.page_id)}中的块`;
    case 'delete_blocks': return `🗑 删除${title(a.page_id)}中 ${Array.isArray(a.block_ids) ? a.block_ids.length : 1} 个块`;
    case 'replace_page_content': return `♻️ 重写${title(a.page_id)}`;
    case 'create_page': return `➕ 创建页面「${a.title ?? ''}」`;
    case 'update_page': return `🏷 更新页面${title(a.page_id)}`;
    case 'move_page': return `📦 移动页面${title(a.page_id)}`;
    case 'delete_page': return `🗑 删除页面${title(a.page_id)}`;
    default: return name;
  }
}
