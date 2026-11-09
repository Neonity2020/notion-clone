import { useEffect, useState } from 'react';
import { AppSkeleton } from './components/AppSkeleton';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { PageView } from './components/PageView';
import { AgentPanel } from './agent/AgentPanel';
import { AgentHome } from './agent/AgentHome';

export function App({ storage = 'local' }: { storage?: 'local' | 'cloud' }) {
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

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onMenuAction) return;
    const cleanup = api.onMenuAction((action: string) => {
      const s = useStore.getState();
      if (action === 'new-page') {
        const id = s.createPage();
        s.openPage(id);
      } else if (action === 'toggle-agent') {
        if (s.mainView === 'agent-home') {
          const fallbackId = s.currentPageId ?? Object.keys(s.pages)[0] ?? null;
          s.setAgentOpen(true);
          s.openPage(fallbackId);
        } else {
          s.setAgentOpen(!s.agentOpen);
        }
      } else if (action === 'toggle-sidebar') {
        setCollapsed((c) => !c);
      }
    });
    return cleanup;
  }, []);

  if (!loaded) return <AppSkeleton />;

  return (
    <div className={`app${collapsed ? ' sidebar-collapsed' : ''}`}>
      {!collapsed && <Sidebar storage={storage} onCollapse={() => setCollapsed(true)} />}
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
