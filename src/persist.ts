import { useStore } from './store';
import { loadAllPages, loadPages, writePages } from './lib/db';
import type { PageMap } from './types';
import { seedPages } from './seed';

/**
 * Local-first persistence: every change in the in-memory store is diffed by
 * reference (pages are immutable) and flushed to IndexedDB on a short debounce.
 * Other open tabs are notified via BroadcastChannel and reload the changed pages.
 */
export async function initPersistence() {
  let pages = await loadAllPages();
  if (pages.length === 0) {
    pages = seedPages();
    await writePages(pages, []);
  }
  useStore.getState().hydrate(pages);

  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('notion-clone') : null;
  let applyingRemote = false;
  let lastSaved: PageMap = useStore.getState().pages;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    timer = null;
    const cur = useStore.getState().pages;
    const prev = lastSaved;
    lastSaved = cur;
    const put = Object.values(cur).filter((p) => prev[p.id] !== p);
    const del = Object.keys(prev).filter((id) => !cur[id]);
    if (!put.length && !del.length) return;
    try {
      await writePages(put, del);
      channel?.postMessage({ put: put.map((p) => p.id), del });
    } catch (e) {
      console.error('保存失败', e);
    }
  };

  useStore.subscribe((state, prevState) => {
    if (state.pages === prevState.pages) return;
    if (applyingRemote) {
      lastSaved = state.pages;
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 250);
  });

  channel?.addEventListener('message', async (ev: MessageEvent<{ put: string[]; del: string[] }>) => {
    const loaded = await loadPages(ev.data.put);
    applyingRemote = true;
    try {
      useStore.getState().applyRemote(loaded.filter((p): p is NonNullable<typeof p> => !!p), ev.data.del);
    } finally {
      applyingRemote = false;
    }
  });

  window.addEventListener('beforeunload', () => {
    if (timer) {
      clearTimeout(timer);
      void flush();
    }
  });
}
