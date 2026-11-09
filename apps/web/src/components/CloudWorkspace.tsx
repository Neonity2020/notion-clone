import { setStorageScope } from '../lib/storage-scope';
import { resetChatScope } from '../agent/chatStore';
import { useEffect, useState } from 'react';
import { App } from '../App';
import { useStore } from '../store';
import { initPersistence } from '../persist';
import { listPages, savePages } from '../server/pages';
import { AppSkeleton } from './AppSkeleton';
import { Button } from './ui/button';

export default function CloudWorkspace({ userId }: { userId: string }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    setStorageScope(userId);
    resetChatScope();
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    setReady(false);
    setError(false);
    useStore.setState({ loaded: false, pages: {}, currentPageId: null, agentOpen: false, mainView: 'page', agentTouched: {} });
    initPersistence({
      loadAllPages: () => listPages({ data: { userId } }),
      loadPages: async (ids) => {
        const all = await listPages({ data: { userId } });
        return ids.map((id) => all.find((page) => page.id === id));
      },
      writePages: (put, del) => savePages({ data: { userId, put, del } }),
    }, { channel: `notion-clone:${userId}`, signal: abort.signal, onSaveError: setSaveError })
      .then((cleanup) => { if (abort.signal.aborted) cleanup(); else { dispose = cleanup; setReady(true); } })
      .catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => { abort.abort(); dispose?.(); setStorageScope("signed-out"); resetChatScope(); useStore.setState({ loaded: false, pages: {}, currentPageId: null }); };
  }, [userId, attempt]);
  if (error) return <main className="auth-screen"><p role="alert">无法加载笔记，请检查网络后重试。</p><Button onClick={() => setAttempt((n) => n + 1)}>重试</Button></main>;
  if (!ready) return <AppSkeleton />;
  return <>{saveError && <div className="save-error" role="alert">保存失败，正在重试。请暂时不要关闭页面。</div>}<App storage="cloud" /></>;
}
