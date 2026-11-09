import { describe, expect, it, beforeEach } from 'vitest';
import { blocksToMarkdown, markdownToBlocks } from '../lib/markdown';
import { displayToRaw, parseInline, renderInlineHTML } from '../lib/inline';
import { parseWikiLinks, hasWikiLink, findPageByTitle, getBacklinks, searchPages, getAllWikiLinkTargets } from '../lib/wikilink';
import { useStore } from '../store';
import { runTool, toolDefs, createPiTools } from '../agent/tools';
import { Agent } from '@earendil-works/pi-agent-core';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { makeAssistantMessage } from '../agent/llm';

describe('markdown', () => {
  it('parses block types', () => {
    const b = markdownToBlocks('# T\n\n## S\n- a\n  - b\n1. one\n- [x] done\n- [ ] todo\n> q\n> [!NOTE] c\n---\n```\nx = 1\n\ny\n```\nplain');
    expect(b.map((x) => x.type)).toEqual(['h1', 'h2', 'bullet', 'bullet', 'numbered', 'todo', 'todo', 'quote', 'callout', 'divider', 'code', 'paragraph']);
    expect(b[3].indent).toBe(1);
    expect(b[5].checked).toBe(true);
    expect(b[6].checked).toBe(false);
    expect(b[10].text).toBe('x = 1\n\ny');
  });

  it('round-trips', () => {
    const md = '# T\n\n- a\n\n1. x\n\n2. y\n\n- [x] d\n\n```\ncode\n```\n\n---';
    const again = blocksToMarkdown(markdownToBlocks(md));
    expect(markdownToBlocks(again).map((b) => [b.type, b.text])).toEqual(markdownToBlocks(md).map((b) => [b.type, b.text]));
  });
});

describe('inline', () => {
  it('parses marks', () => {
    expect(parseInline('a **b** *c* `d` ~~e~~ [f](http://x)').map((s) => s.kind)).toEqual([
      'text', 'bold', 'text', 'italic', 'text', 'code', 'text', 'strike', 'text', 'link',
    ]);
  });
  it('maps display offsets to raw', () => {
    const src = 'ab **cd** e';
    // display: "ab cd e"; offset 4 is between c and d
    expect(displayToRaw(src, 4)).toBe(6);
    expect(displayToRaw(src, 0)).toBe(0);
    expect(displayToRaw(src, 7)).toBe(src.length);
  });
  it('escapes html and unsafe urls', () => {
    expect(renderInlineHTML('<b> [x](javascript:alert(1))')).not.toContain('<b>');
    expect(renderInlineHTML('[x](javascript:alert)')).toContain('href="#"');
  });
});

describe('wiki links', () => {
  it('parses [[target]] and [[target|alias]]', () => {
    const refs = parseWikiLinks('see [[My Page]] and [[Other|display text]] here');
    expect(refs).toEqual([
      { target: 'My Page', display: 'My Page' },
      { target: 'Other', display: 'display text' },
    ]);
    expect(hasWikiLink('no links here')).toBe(false);
    expect(hasWikiLink('has [[link]]')).toBe(true);
  });

  it('parses wiki links in inline segments', () => {
    const segs = parseInline('go to [[Home]] now');
    expect(segs.map((s) => s.kind)).toEqual(['text', 'wikilink', 'text']);
    expect(segs[1].text).toBe('Home');
    expect(segs[1].target).toBe('Home');
  });

  it('renders wiki link HTML with data-target', () => {
    const html = renderInlineHTML('see [[Home|首页]]');
    expect(html).toContain('class="wikilink"');
    expect(html).toContain('data-target="Home"');
    expect(html).toContain('首页');
  });

  it('renders [[target]] without alias as target text', () => {
    const html = renderInlineHTML('[[My Page]]');
    expect(html).toContain('>My Page</a>');
    expect(html).toContain('data-target="My Page"');
  });

  it('finds pages by title (case-insensitive)', () => {
    useStore.setState({ pages: {}, currentPageId: null });
    const id = useStore.getState().createPage({ title: 'My Notes' });
    const pages = useStore.getState().pages;
    expect(findPageByTitle(pages, 'my notes')?.id).toBe(id);
    expect(findPageByTitle(pages, '  My Notes  ')?.id).toBe(id);
    expect(findPageByTitle(pages, 'missing')).toBeUndefined();
  });

  it('computes backlinks', () => {
    useStore.setState({ pages: {}, currentPageId: null });
    const targetId = useStore.getState().createPage({ title: 'Target' });
    useStore.getState().createPage({ title: 'Source A', blocks: markdownToBlocks('links to [[Target]] here') });
    useStore.getState().createPage({ title: 'Source B', blocks: markdownToBlocks('no links') });
    useStore.getState().createPage({ title: 'Source C', blocks: markdownToBlocks('also [[target|aliased]]') });

    const pages = useStore.getState().pages;
    const target = pages[targetId];
    const backlinks = getBacklinks(pages, target);
    expect(backlinks.map((p) => p.title).sort()).toEqual(['Source A', 'Source C']);
  });

  it('searchPages finds matching pages', () => {
    useStore.setState({ pages: {}, currentPageId: null });
    useStore.getState().createPage({ title: 'Project Plan' });
    useStore.getState().createPage({ title: 'Project Notes' });
    useStore.getState().createPage({ title: 'Random' });
    const pages = useStore.getState().pages;
    expect(searchPages(pages, 'proj').map((p) => p.title).sort()).toEqual(['Project Notes', 'Project Plan']);
    expect(searchPages(pages, 'plan').map((p) => p.title)).toEqual(['Project Plan']);
    expect(searchPages(pages, 'zzz')).toHaveLength(0);
  });

  it('collects all wiki-link targets', () => {
    useStore.setState({ pages: {}, currentPageId: null });
    useStore.getState().createPage({ title: 'A', blocks: markdownToBlocks('[[X]] and [[Y]]') });
    useStore.getState().createPage({ title: 'B', blocks: markdownToBlocks('[[X]] again') });
    const targets = getAllWikiLinkTargets(useStore.getState().pages);
    expect(targets.sort()).toEqual(['X', 'Y']);
  });
});

describe('agent tools', () => {
  const ctx = () => ({ touchedPages: new Set<string>() });
  let pid: string;
  beforeEach(() => {
    useStore.setState({ pages: {}, currentPageId: null });
    pid = useStore.getState().createPage({ title: '计划', blocks: markdownToBlocks('# 本周\n- 写代码') });
  });

  it('ask mode exposes only read tools and blocks writes', async () => {
    const names = toolDefs('ask').map((t) => t.function.name);
    expect(names).toContain('read_page');
    expect(names).not.toContain('insert_blocks');
    const r = await runTool('insert_blocks', JSON.stringify({ page_id: pid, markdown: 'x' }), 'ask', ctx());
    expect(r.ok).toBe(false);
  });

  it('reads, searches, inserts, updates and deletes', async () => {
    const c = ctx();
    const read = await runTool('read_page', JSON.stringify({ page_id: pid }), 'agent', c);
    expect(read.output).toContain('(h1) 本周');
    const s = await runTool('search_pages', JSON.stringify({ query: '代码' }), 'agent', c);
    expect(s.output).toContain(pid);

    const firstId = useStore.getState().pages[pid].blocks[0].id;
    await runTool('insert_blocks', JSON.stringify({ page_id: pid, markdown: '- [ ] 测试\n- [ ] 发布', after_block_id: firstId }), 'agent', c);
    let blocks = useStore.getState().pages[pid].blocks;
    expect(blocks.map((b) => b.type)).toEqual(['h1', 'todo', 'todo', 'bullet']);

    await runTool('update_block', JSON.stringify({ page_id: pid, block_id: blocks[1].id, checked: true }), 'agent', c);
    expect(useStore.getState().pages[pid].blocks[1].checked).toBe(true);

    await runTool('delete_blocks', JSON.stringify({ page_id: pid, block_ids: [blocks[3].id] }), 'agent', c);
    blocks = useStore.getState().pages[pid].blocks;
    expect(blocks).toHaveLength(3);
    expect(c.touchedPages.has(pid)).toBe(true);
  });

  it('creates, moves and deletes pages; rejects cycles', async () => {
    const c = ctx();
    const r = await runTool('create_page', JSON.stringify({ title: '子页', parent_id: pid, markdown: 'hello' }), 'agent', c);
    const child = r.output.match(/id: (\S+)/)![1];
    expect(useStore.getState().pages[child].parentId).toBe(pid);
    const bad = await runTool('move_page', JSON.stringify({ page_id: pid, parent_id: child }), 'agent', c);
    expect(bad.ok).toBe(false);
    await runTool('move_page', JSON.stringify({ page_id: child, parent_id: null }), 'agent', c);
    expect(useStore.getState().pages[child].parentId).toBeNull();
    await runTool('delete_page', JSON.stringify({ page_id: child }), 'agent', c);
    expect(useStore.getState().pages[child]).toBeUndefined();
  });

  it('reports bad ids and bad json', async () => {
    expect((await runTool('read_page', '{"page_id":"nope"}', 'agent', ctx())).ok).toBe(false);
    expect((await runTool('read_page', '{bad', 'agent', ctx())).ok).toBe(false);
  });

  it('switches between agent-home welcome view and page view', async () => {
    useStore.getState().openAgentHome();
    expect(useStore.getState().mainView).toBe('agent-home');
    await runTool('open_page', JSON.stringify({ page_id: pid }), 'agent', ctx());
    expect(useStore.getState().mainView).toBe('page');
    expect(useStore.getState().currentPageId).toBe(pid);
    expect(useStore.getState().agentOpen).toBe(true);
  });

  it('runs Pi-SDK Agent with tool calls and state updates', async () => {
    const c = ctx();
    const piTools = createPiTools('agent', c);
    expect(piTools.some((t) => t.name === 'insert_blocks')).toBe(true);

    let turn = 0;
    const streamFn = () => {
      turn++;
      const stream = createAssistantMessageEventStream();
      setTimeout(() => {
        if (turn === 1) {
          const msg = makeAssistantMessage(
            [{ type: 'toolCall', id: 'call_test', name: 'search_pages', arguments: { query: '代码' } }],
            'toolUse',
          );
          stream.push({ type: 'start', partial: msg });
          stream.push({ type: 'done', reason: 'toolUse', message: msg });
        } else {
          const msg = makeAssistantMessage(
            [{ type: 'text', text: '已找到相关代码笔记。' }],
            'stop',
          );
          stream.push({ type: 'start', partial: msg });
          stream.push({ type: 'text_start', contentIndex: 0, partial: msg });
          stream.push({ type: 'text_delta', contentIndex: 0, delta: '已找到相关代码笔记。', partial: msg });
          stream.push({ type: 'text_end', contentIndex: 0, content: '已找到相关代码笔记。', partial: msg });
          stream.push({ type: 'done', reason: 'stop', message: msg });
        }
      }, 10);
      return stream;
    };

    const agent = new Agent({
      streamFn,
      initialState: {
        systemPrompt: 'System',
        model: { id: 'test-model' } as any,
        tools: piTools,
        messages: [{ role: 'user', content: [{ type: 'text', text: '搜索代码' }], timestamp: 1 }],
      },
    });

    const events: string[] = [];
    agent.subscribe((ev) => {
      events.push(ev.type);
    });

    await agent.continue();

    expect(events).toContain('tool_execution_start');
    expect(events).toContain('tool_execution_end');
    expect(events).toContain('agent_end');

    const assistantMessages = agent.state.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);
    expect((assistantMessages[1].content[0] as any).text).toBe('已找到相关代码笔记。');
  });
});
