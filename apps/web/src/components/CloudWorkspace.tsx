import { setStorageScope } from '../lib/storage-scope';
import { resetChatScope } from '../agent/chatStore';
import { useEffect, useState } from 'react';
import { App } from '../App';
import { useStore } from '../store';
import { initPersistence, type SaveStatus } from '../persist';
import { createCloudAdapter } from '../lib/cloud-adapter';
import { getPages, listPages, savePages } from '../server/pages';
import { AppSkeleton } from './AppSkeleton';
import { Button } from './ui/button';

function SaveBanner({ status }: { status: SaveStatus }) {
  const pages = useStore((s) => s.pages);
  if (status.kind === 'retrying') {
    return <div className="save-error" role="alert">保存失败，正在重试。请暂时不要关闭页面。</div>;
  }
  const titles = status.pageIds.map((id) => `「${pages[id]?.title || '无标题'}」`).join('、');
  return <div className="save-error" role="alert">页面{titles}超过 1.8 MB 上限，无法保存。请删减内容或拆分为多个页面。</div>;
}

export default function CloudWorkspace({ userId }: { userId: string }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [conflictCopies, setConflictCopies] = useState<string[]>([]);
  useEffect(() => {
    setStorageScope(userId);
    resetChatScope();
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    setReady(false);
    setError(false);
    useStore.setState({ loaded: false, pages: {}, currentPageId: null, agentOpen: false, mainView: 'page', agentTouched: {} });
    initPersistence(createCloudAdapter(userId, { listPages, getPages, savePages }), {
      channel: `notion-clone:${userId}`,
      signal: abort.signal,
      onSaveError: setSaveStatus,
      onConflict: (titles) => setConflictCopies((prev) => [...prev, ...titles]),
    })
      .then((cleanup) => { if (abort.signal.aborted) cleanup(); else { dispose = cleanup; setReady(true); } })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => { abort.abort(); dispose?.(); setStorageScope("signed-out"); resetChatScope(); useStore.setState({ loaded: false, pages: {}, currentPageId: null }); };
  }, [userId, attempt]);
  if (error) return <main className="auth-screen"><p role="alert">无法加载笔记，请检查网络后重试。</p><Button onClick={() => setAttempt((n) => n + 1)}>重试</Button></main>;
  if (!ready) return <AppSkeleton />;
  return <>
    {saveStatus && <SaveBanner status={saveStatus} />}
    {!saveStatus && conflictCopies.length > 0 && <div className="save-error conflict-notice" role="status">
      其他设备修改了相同页面，已保留云端版本；你的修改另存为{conflictCopies.map((t) => `「${t}」`).join('、')}。
      <Button variant="ghost" size="sm" onClick={() => setConflictCopies([])}>知道了</Button>
    </div>}
    <App storage="cloud" />
  </>;
}
