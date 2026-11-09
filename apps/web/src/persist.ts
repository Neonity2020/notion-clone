import { useStore } from './store';
import * as local from './lib/db';
import { uid } from './lib/id';
import type { Page, PageMap } from './types';
import { seedPages } from './seed';

export interface WriteResult {
  /** Pages the stored copy moved past; `page` is the stored version (null if absent). */
  conflicts?: { id: string; page: Page | null }[];
  /** Pages storage refuses permanently (e.g. too large); retried only after they change. */
  rejected?: string[];
}

export interface PersistenceAdapter {
  loadAllPages(): Promise<Page[]>;
  loadPages(ids: string[]): Promise<(Page | undefined)[]>;
  writePages(put: Page[], del: string[]): Promise<void | WriteResult>;
}

export type SaveStatus =
  | { kind: 'retrying' }
  | { kind: 'rejected'; pageIds: string[] };

export interface PersistenceOptions {
  channel?: string;
  signal?: AbortSignal;
  onSaveError?: (status: SaveStatus | null) => void;
  /** Titles of the conflict copies created to preserve local edits. */
  onConflict?: (copyTitles: string[]) => void;
}

export const CONFLICT_SUFFIX = '（冲突副本）';

/** Content equality ignoring timestamps, so identical edits from two devices do not fork. */
function sameContent(a: Page, b: Page) {
  const strip = ({ updatedAt: _u, ...rest }: Page) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

function conflictCopy(page: Page): Page {
  const now = Date.now();
  return {
    ...page,
    id: uid('p_'),
    title: `${page.title || '无标题'}${CONFLICT_SUFFIX}`,
    order: page.order + 0.001,
    createdAt: now,
    updatedAt: now,
  };
}

/** Serialize writes; only acknowledge a snapshot after storage accepts it. */
export async function initPersistence(adapter: PersistenceAdapter = local, options: PersistenceOptions = {}) {
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
  /** Page objects storage rejected; they stay unsaved until edited again. */
  const rejected = new Map<string, Page>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  let stopped = false;
  let applyingRemote = false;
  const pendingPuts = (current: PageMap) =>
    Object.values(current).filter((p) => lastSaved[p.id] !== p && rejected.get(p.id) !== p);
  const pendingDels = (current: PageMap) => Object.keys(lastSaved).filter((id) => !current[id]);
  const pending = () => {
    const current = useStore.getState().pages;
    return current !== lastSaved && (pendingPuts(current).length > 0 || pendingDels(current).length > 0);
  };
  /** Anything not yet durable, including rejected Pages. */
  const unsaved = () => saving || pending() || rejected.size > 0;
  const reportRejected = () => {
    const current = useStore.getState().pages;
    for (const [id, page] of rejected) if (current[id] !== page) rejected.delete(id);
    options.onSaveError?.(rejected.size ? { kind: 'rejected', pageIds: [...rejected.keys()] } : null);
  };
  const schedule = (delay = 250) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  };
  const resolveConflicts = (conflicts: NonNullable<WriteResult['conflicts']>) => {
    const state = useStore.getState();
    const next = { ...lastSaved };
    const stored: Page[] = [];
    const copies: Page[] = [];
    for (const conflict of conflicts) {
      const localPage = state.pages[conflict.id];
      if (!conflict.page) {
        // Stored row vanished mid-write; resend the local Page as new.
        delete next[conflict.id];
        continue;
      }
      // Stored version wins in place; local edits survive as a separate Page.
      if (localPage && !sameContent(localPage, conflict.page)) copies.push(conflictCopy(localPage));
      stored.push(conflict.page);
      next[conflict.id] = conflict.page;
    }
    lastSaved = next;
    if (stored.length || copies.length) {
      applyingRemote = true;
      try { state.applyRemote([...stored, ...copies], []); } finally { applyingRemote = false; }
    }
    if (copies.length) options.onConflict?.(copies.map((p) => p.title));
  };
  const flush = async () => {
    if (saving || stopped) return;
    clearTimeout(timer);
    timer = undefined;
    const current = useStore.getState().pages;
    const put = pendingPuts(current);
    const del = pendingDels(current);
    if (!put.length && !del.length) {
      if (!rejected.size) lastSaved = current;
      reportRejected();
      return;
    }
    saving = true;
    let failed = false;
    try {
      const result = (await adapter.writePages(put, del)) || {};
      const rejectedIds = new Set(result.rejected ?? []);
      const conflictIds = new Set((result.conflicts ?? []).map((c) => c.id));
      const next = { ...lastSaved };
      for (const p of put) {
        if (rejectedIds.has(p.id)) { rejected.set(p.id, p); continue; }
        rejected.delete(p.id);
        if (!conflictIds.has(p.id)) next[p.id] = p;
      }
      for (const id of del) if (!conflictIds.has(id)) delete next[id];
      lastSaved = next;
      if (result.conflicts?.length && !stopped) resolveConflicts(result.conflicts);
      if (!stopped) {
        reportRejected();
        channel?.postMessage({
          put: put.map((p) => p.id).filter((id) => !rejectedIds.has(id)),
          del: del.filter((id) => !conflictIds.has(id)),
        });
      }
    } catch {
      failed = true;
      if (!stopped) options.onSaveError?.({ kind: 'retrying' });
    } finally {
      saving = false;
      if (!stopped && pending()) schedule(failed ? 3000 : 250);
    }
  };
  const unsubscribe = useStore.subscribe((state, prev) => {
    if (state.pages !== prev.pages && !applyingRemote) schedule();
  });
  channel?.addEventListener('message', async (event: MessageEvent<{ put: string[]; del: string[] }>) => {
    if (pending() || saving || stopped) return;
    try {
      const loaded = await adapter.loadPages(event.data.put);
      if (pending() || saving || stopped) return;
      applyingRemote = true;
      useStore.getState().applyRemote(loaded.filter((p): p is Page => !!p), event.data.del);
      lastSaved = useStore.getState().pages;
    } catch { /* A later notification retries remote reads. */ }
    finally { applyingRemote = false; }
  });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (unsaved()) { void flush(); event.preventDefault(); event.returnValue = ''; }
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
