import { useLayoutEffect, useRef, useState } from 'react';
import { useStore, pagePath, childrenOf } from '../store';
import { Editor } from '../editor/Editor';
import { pageToMarkdown, newBlock } from '../lib/markdown';
import { getBacklinks } from '../lib/wikilink';

const EMOJIS = '📄📝📒📓📔📕📗📘📙📚🗒️🗂️📁📌📍✅☑️💡🔥⭐️🌟✨🎯🚀🧠💼🏠🎨🎵📷🍀🌈☀️🌙⚡️🧪🔧🛠️💻📱🗓️⏰💰📈📊🧾🎓✈️🍔☕️❤️😀🤖'.match(
  /\p{Extended_Pictographic}\uFE0F?/gu,
)!;

export function PageView({ sidebarCollapsed, onExpandSidebar }: { sidebarCollapsed: boolean; onExpandSidebar(): void }) {
  const pageId = useStore((s) => s.currentPageId);
  const page = useStore((s) => (s.currentPageId ? s.pages[s.currentPageId] : undefined));
  const pages = useStore((s) => s.pages);
  const agentOpen = useStore((s) => s.agentOpen);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [page?.title, pageId]);

  // focus title on brand-new empty pages
  useLayoutEffect(() => {
    if (page && !page.title && page.blocks.length === 1 && !page.blocks[0].text) titleRef.current?.focus();
  }, [pageId]);

  const topbar = (
    <div className="topbar">
      {sidebarCollapsed && (
        <button className="icon-btn" title="展开侧边栏 (⌘\)" onClick={onExpandSidebar}>
          ☰
        </button>
      )}
      <div className="breadcrumbs">
        {page &&
          pagePath(pages, page.id).map((p, i, arr) => (
            <span key={p.id}>
              <button className="crumb" onClick={() => useStore.getState().openPage(p.id)}>
                {p.icon} {p.title || '无标题'}
              </button>
              {i < arr.length - 1 && <span className="crumb-sep">/</span>}
            </span>
          ))}
      </div>
      <span style={{ flex: 1 }} />
      {page && (
        <button
          className="btn ghost small"
          title="导出为 Markdown"
          onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([pageToMarkdown(page)], { type: 'text/markdown' }));
            a.download = `${page.title || 'untitled'}.md`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          ⬇ Markdown
        </button>
      )}
      <button
        className={`btn small ${agentOpen ? 'primary' : 'ghost'}`}
        aria-expanded={agentOpen}
        aria-controls="agent-panel"
        title="打开/关闭右侧 AI Agent 侧边栏 (⌘J)"
        onClick={() => useStore.getState().setAgentOpen(!agentOpen)}
      >
        ✨ AI 侧边栏
      </button>
    </div>
  );

  if (!page) {
    return (
      <main className="main">
        {topbar}
        <div className="empty-state">
          <p>还没有打开任何页面</p>
          <button
            className="btn primary"
            onClick={() => {
              const id = useStore.getState().createPage();
              useStore.getState().openPage(id);
            }}
          >
            新建页面
          </button>
        </div>
      </main>
    );
  }

  const children = childrenOf(pages, page.id);

  return (
    <main className="main">
      {topbar}
      <div className="page-scroll">
        <div className="page">
          <div className="page-icon-wrap">
            <button className="page-icon" onClick={() => setEmojiOpen(!emojiOpen)} title="更换图标">
              {page.icon}
            </button>
            {emojiOpen && (
              <>
                <div className="menu-backdrop" onClick={() => setEmojiOpen(false)} />
                <div className="popover emoji-picker">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => {
                        useStore.getState().updatePage(page.id, { icon: e });
                        setEmojiOpen(false);
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <textarea
            ref={titleRef}
            className="page-title"
            rows={1}
            placeholder="无标题"
            value={page.title}
            onChange={(e) => useStore.getState().updatePage(page.id, { title: e.target.value.replace(/\n/g, '') })}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === 'ArrowDown') && !e.nativeEvent.isComposing) {
                e.preventDefault();
                const s = useStore.getState();
                const first = page.blocks[0];
                if (e.key === 'Enter' && first && (first.text || first.type !== 'paragraph')) {
                  const nb = newBlock();
                  s.insertBlocks(page.id, null, [nb]);
                  s.requestFocus(nb.id, 0);
                } else if (first) s.requestFocus(first.id, 0);
              }
            }}
          />
          <div className="page-meta muted small">最后编辑于 {new Date(page.updatedAt).toLocaleString()}</div>
          <Editor key={page.id} page={page} />
          {children.length > 0 && (
            <div className="subpages">
              <div className="muted small">子页面</div>
              {children.map((c) => (
                <button key={c.id} className="subpage-link" onClick={() => useStore.getState().openPage(c.id)}>
                  {c.icon} <span>{c.title || '无标题'}</span>
                </button>
              ))}
            </div>
          )}
          <Backlinks pageId={page.id} />
        </div>
      </div>
    </main>
  );
}

function Backlinks({ pageId }: { pageId: string }) {
  const pages = useStore((s) => s.pages);
  const page = pages[pageId];
  if (!page) return null;
  const backlinks = getBacklinks(pages, page);
  if (backlinks.length === 0) return null;
  return (
    <div className="backlinks">
      <div className="backlinks-header muted small">🔗 反向链接（{backlinks.length}）</div>
      {backlinks.map((p) => (
        <button key={p.id} className="backlink-item" onClick={() => useStore.getState().openPage(p.id)}>
          {p.icon} <span>{p.title || '无标题'}</span>
        </button>
      ))}
    </div>
  );
}
