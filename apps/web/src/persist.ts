import { useStore } from './store';
import * as local from './lib/db';
import type { Page, PageMap } from './types';
import { seedPages } from './seed';

export interface PersistenceAdapter {
  loadAllPages(): Promise<Page[]>;
  loadPages(ids: string[]): Promise<(Page | undefined)[]>;
  writePages(put: Page[], del: string[]): Promise<void>;
}

/** Serialize writes; only acknowledge a snapshot after storage accepts it. */
export async function initPersistence(adapter: PersistenceAdapter = local, options: {
  channel?: string; signal?: AbortSignal; onSaveError?: (failed: boolean) => void;
} = {}) {
  let pages = await adapter.loadAllPages();
  if (options.signal?.aborted) return () => {};
  if (!pages.length) {
    pages = seedPages();
    await adapter.writePages(pages, []);
  }
  if (options.signal?.aborted) return () => {};
  useStore.getState().hydrate(pages);
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(options.channel ?? 'notion-clone') : null;
  let lastSaved: PageMap = useStore.getState().pages;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let stopped = false;
  let applyingRemote = false;
  const dirty = () => useStore.getState().pages !== lastSaved;
  const schedule = (delay = 250) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const flush = async () => {
    if (saving || stopped) return;
    clearTimeout(timer);
    timer = undefined;
    const current = useStore.getState().pages;
    const put = Object.values(current).filter((p) => lastSaved[p.id] !== p);
    const del = Object.keys(lastSaved).filter((id) => !current[id]);
    if (!put.length && !del.length) { lastSaved = current; return; }
    saving = true;
    let failed = false;
    try {
      await adapter.writePages(put, del);
      lastSaved = current;
      if (!stopped) { options.onSaveError?.(false); channel?.postMessage({ put: put.map((p) => p.id), del }); }
    } catch {
      failed = true;
      if (!stopped) options.onSaveError?.(true);
    } finally {
      saving = false;
      if (!stopped && dirty()) schedule(failed ? 3000 : 250);
    }
  };
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.pages !== prev.pages && !applyingRemote) schedule();
  });
  channel?.addEventListener('message', async (event: MessageEvent<{ put: string[]; del: string[] }>) => {
    if (dirty() || saving || stopped) return;
    try {
      const loaded = await adapter.loadPages(event.data.put);
      if (dirty() || saving || stopped) return;
      applyingRemote = true;
      useStore.getState().applyRemote(loaded.filter((p): p is Page => !!p), event.data.del);
      lastSaved = useStore.getState().pages;
    } catch { /* A later notification retries remote reads. */ }
    finally { applyingRemote = false; }
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (dirty() || saving) { void flush(); event.preventDefault(); event.returnValue = ''; }
  };
  const visibility = () => { if (document.visibilityState === 'hidden') void flush(); };
  window.addEventListener('beforeunload', beforeUnload);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe(); channel?.close();
    window.removeEventListener('beforeunload', beforeUnload);
    document.removeEventListener('visibilitychange', visibility);
  };
}
