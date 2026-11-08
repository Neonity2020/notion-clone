import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PageView } from './components/PageView';
import { AgentPanel } from './agent/AgentPanel';
import { AgentHome } from './agent/AgentHome';

export function App() {
  const loaded = useStore((s) => s.loaded);
  const mainView = useStore((s) => s.mainView);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nc:sidebar') === 'collapsed');

  useEffect(() => {
    localStorage.setItem('nc:sidebar', collapsed ? 'collapsed' : 'open');
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const s = useStore.getState();
        if (s.mainView === 'agent-home') {
          const fallbackId = s.currentPageId ?? Object.keys(s.pages)[0] ?? null;
          s.setAgentOpen(true);
          s.openPage(fallbackId);
        } else {
          s.setAgentOpen(!s.agentOpen);
        }
      } else if (mod && e.key === '\\') {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!loaded) return <div className="loading">加载中…</div>;

  return (
    <div className="app">
      {!collapsed && <Sidebar onCollapse={() => setCollapsed(true)} />}
      {mainView === 'agent-home' ? (
        <AgentHome sidebarCollapsed={collapsed} onExpandSidebar={() => setCollapsed(false)} />
      ) : (
        <>
          <PageView sidebarCollapsed={collapsed} onExpandSidebar={() => setCollapsed(false)} />
          <AgentPanel />
        </>
      )}
    </div>
  );
}
