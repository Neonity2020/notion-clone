import { useMemo, useRef, useState } from 'react';
import { useStore, childrenOf } from '../store';
import type { Page, PageMap } from '../types';

function TreeItem({ page, depth, pages }: { page: Page; depth: number; pages: PageMap }) {
  const current = useStore((s) => s.currentPageId);
  const mainView = useStore((s) => s.mainView);
  const [open, setOpen] = useState(true);
  const [dropOver, setDropOver] = useState(false);
  const kids = childrenOf(pages, page.id);
  const s = useStore.getState;

  return (
    <div>
      <div
        className={`tree-item${mainView === 'page' && current === page.id ? ' active' : ''}${dropOver ? ' drop-into' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => s().openPage(page.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-page', page.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-page')) {
            e.preventDefault();
            setDropOver(true);
          }
        }}
        onDragLeave={() => setDropOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDropOver(false);
          const id = e.dataTransfer.getData('application/x-page');
          if (id && id !== page.id) {
            try {
              s().movePage(id, page.id);
              setOpen(true);
            } catch (err) {
              alert((err as Error).message);
            }
          }
        }}
      >
        <button
          className={`tree-toggle${kids.length ? '' : ' empty'}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {kids.length ? (open ? '▾' : '▸') : '•'}
        </button>
        <span className="tree-icon">{page.icon}</span>
        <span className="tree-title">{page.title || '无标题'}</span>
        <span className="tree-actions">
          <button
            title="删除"
            onClick={(e) => {
              e.stopPropagation();
              const n = kids.length ? `（包括 ${kids.length} 个子页面）` : '';
              if (confirm(`删除「${page.title || '无标题'}」${n}？`)) s().deletePage(page.id);
            }}
          >
            🗑
          </button>
          <button
            title="新建子页面"
            onClick={(e) => {
              e.stopPropagation();
              const id = s().createPage({ parentId: page.id });
              setOpen(true);
              s().openPage(id);
            }}
          >
            +
          </button>
        </span>
      </div>
      {open && kids.map((k) => <TreeItem key={k.id} page={k} depth={depth + 1} pages={pages} />)}
    </div>
  );
}

export function Sidebar({ onCollapse, storage = 'local' }: { onCollapse(): void; storage?: 'local' | 'cloud' }) {
  const pages = useStore((s) => s.pages);
  const mainView = useStore((s) => s.mainView);
  const [q, setQ] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const roots = childrenOf(pages, null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return null;
    return Object.values(pages)
      .map((p) => {
        const inTitle = p.title.toLowerCase().includes(query);
        const hit = p.blocks.find((b) => b.text.toLowerCase().includes(query));
        return inTitle || hit ? { p, hit: hit?.text } : null;
      })
      .filter((x): x is { p: Page; hit: string | undefined } => !!x)
      .sort((a, b) => b.p.updatedAt - a.p.updatedAt);
  }, [q, pages]);

  const newPage = () => {
    const id = useStore.getState().createPage();
    useStore.getState().openPage(id);
  };

  const exportAll = () => {
    const data = JSON.stringify({ app: 'notion-clone', version: 1, exportedAt: Date.now(), pages: Object.values(pages) }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importAll = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      const list: Page[] = Array.isArray(json) ? json : json.pages;
      if (!Array.isArray(list) || !list.every((p) => p && p.id && Array.isArray(p.blocks))) throw new Error('文件格式不正确');
      const replace = confirm(`导入 ${list.length} 个页面。\n\n确定 = 替换当前全部数据\n取消 = 合并（同 id 覆盖）`);
      const next: PageMap = replace ? {} : { ...useStore.getState().pages };
      for (const p of list) next[p.id] = p;
      // persistence layer diffs and writes/deletes in IndexedDB
      useStore.getState().replaceAll(next);
    } catch (e) {
      alert('导入失败：' + (e as Error).message);
    }
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="workspace">📝 我的笔记</span>
        <button className="icon-btn" title="收起侧边栏 (⌘\)" onClick={onCollapse}>
          «
        </button>
      </div>
      <div className="sidebar-search">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜索页面和内容" />
      </div>
      <div className="sidebar-nav">
        <button
          className={`nav-item${mainView === 'agent-home' ? ' active' : ''}`}
          onClick={() => useStore.getState().openAgentHome()}
        >
          ✨ AI Agent
        </button>
        <button className="nav-item" onClick={newPage}>
          ＋ 新建页面
        </button>
      </div>
      <div
        className="tree"
        onDragOver={(e) => e.dataTransfer.types.includes('application/x-page') && e.preventDefault()}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('application/x-page');
          if (id) useStore.getState().movePage(id, null);
        }}
      >
        {results ? (
          results.length ? (
            results.map(({ p, hit }) => (
              <div key={p.id} className="search-result" onClick={() => useStore.getState().openPage(p.id)}>
                <div>
                  {p.icon} {p.title || '无标题'}
                </div>
                {hit && <div className="muted small ellipsis">{hit}</div>}
              </div>
            ))
          ) : (
            <div className="muted small" style={{ padding: 12 }}>
              没有匹配的结果
            </div>
          )
        ) : (
          <>
            <div className="tree-label">页面</div>
            {roots.map((p) => (
              <TreeItem key={p.id} page={p} depth={0} pages={pages} />
            ))}
          </>
        )}
      </div>
      <div className="sidebar-footer">
        <button className="nav-item" onClick={exportAll} title="导出全部数据为 JSON">
          ⬇ 导出
        </button>
        <button className="nav-item" onClick={() => fileRef.current?.click()} title="从 JSON 备份导入">
          ⬆ 导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importAll(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="local-badge" title={storage === 'cloud' ? '笔记保存在当前账户的云端工作区' : '数据保存在本机'}>
        ● {storage === 'cloud' ? '云端工作区' : '本地存储'} · {Object.keys(pages).length} 个页面
      </div>
    </nav>
  );
}
