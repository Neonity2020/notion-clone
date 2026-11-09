import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFLICT_SUFFIX, initPersistence, type PersistenceAdapter } from '../persist';
import { createCloudAdapter } from '../lib/cloud-adapter';
import { MAX_PAGE_BYTES } from '@notion-clone/shared';
import { useStore } from '../store';
import type { Page } from '../types';
const page: Page = { id: 'a', title: 'A', icon: '', parentId: null, order: 0, blocks: [], createdAt: 1, updatedAt: 1 };
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('BroadcastChannel', undefined);
  useStore.setState({ pages: {}, loaded: false });
});
afterEach(() => { dispose?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('persistence', () => {
  it('retries failed writes without acknowledging unsaved changes', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const adapter: PersistenceAdapter = { loadAllPages: async () => [page], loadPages: async () => [], writePages: write };
    dispose = await initPersistence(adapter);
    useStore.getState().updatePage('a', { title: 'Changed' });
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0][0].title).toBe('Changed');
  });
  it('serializes saves and flushes edits made during an in-flight write', async () => {
    let resolve!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; })).mockResolvedValue(undefined);
    dispose = await initPersistence({ loadAllPages: async () => [page], loadPages: async () => [], writePages: write });
    useStore.getState().updatePage('a', { title: 'First' });
    await vi.advanceTimersByTimeAsync(250);
    useStore.getState().updatePage('a', { title: 'Second' });
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0][0].title).toBe('Second');
  });
  it('does not hydrate a previous account after it has unmounted', async () => {
    const abort = new AbortController();
    abort.abort();
    dispose = await initPersistence({ loadAllPages: async () => [page], loadPages: async () => [], writePages: vi.fn() }, { signal: abort.signal });
    expect(useStore.getState().loaded).toBe(false);
    expect(useStore.getState().pages).toEqual({});
  });
  it('keeps the stored version on conflict and saves local edits as a copy', async () => {
    const theirs: Page = { ...page, title: 'Theirs', updatedAt: 5 };
    const write = vi.fn().mockResolvedValueOnce({ conflicts: [{ id: 'a', page: theirs }] }).mockResolvedValue({});
    const onConflict = vi.fn();
    dispose = await initPersistence({ loadAllPages: async () => [page], loadPages: async () => [], writePages: write }, { onConflict });
    useStore.getState().updatePage('a', { title: 'Mine' });
    await vi.advanceTimersByTimeAsync(250);
    const pages = Object.values(useStore.getState().pages);
    expect(useStore.getState().pages.a.title).toBe('Theirs');
    const copy = pages.find((p) => p.id !== 'a')!;
    expect(copy.title).toBe(`Mine${CONFLICT_SUFFIX}`);
    expect(onConflict).toHaveBeenCalledWith([copy.title]);
    await vi.advanceTimersByTimeAsync(250);
    // Only the copy is sent next; the stored version is not written back.
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0].map((p: Page) => p.id)).toEqual([copy.id]);
  });
  it('restores a page deleted locally but edited elsewhere', async () => {
    const theirs: Page = { ...page, title: 'Edited elsewhere' };
    const write = vi.fn().mockResolvedValueOnce({ conflicts: [{ id: 'a', page: theirs }] });
    dispose = await initPersistence({ loadAllPages: async () => [page], loadPages: async () => [], writePages: write });
    useStore.getState().applyRemote([], ['a']);
    useStore.setState({ pages: {} });
    await vi.advanceTimersByTimeAsync(250);
    expect(useStore.getState().pages).toEqual({ a: theirs });
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('does not retry rejected pages until they change, and reports them', async () => {
    const write = vi.fn().mockResolvedValueOnce({ rejected: ['a'] }).mockResolvedValue({});
    const onSaveError = vi.fn();
    dispose = await initPersistence({ loadAllPages: async () => [page], loadPages: async () => [], writePages: write }, { onSaveError });
    useStore.getState().updatePage('a', { title: 'Huge' });
    await vi.advanceTimersByTimeAsync(10000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(onSaveError).toHaveBeenLastCalledWith({ kind: 'rejected', pageIds: ['a'] });
    useStore.getState().updatePage('a', { title: 'Trimmed' });
    await vi.advanceTimersByTimeAsync(250);
    expect(write).toHaveBeenCalledTimes(2);
    expect(onSaveError).toHaveBeenLastCalledWith(null);
  });
});

describe('cloud adapter', () => {
  const record = (p: Page, revision: number) => ({ page: p, revision });
  const api = () => ({
    listPages: vi.fn().mockResolvedValue([record(page, 3)]),
    getPages: vi.fn().mockResolvedValue([record({ ...page, title: 'B' }, 6)]),
    savePages: vi.fn().mockResolvedValue({ revisions: { a: 4 }, deleted: [], conflicts: [] }),
  });
  it('sends the last read revision as the write base and tracks new revisions', async () => {
    const cloud = api();
    const adapter = createCloudAdapter('u', cloud);
    await adapter.loadAllPages();
    await adapter.writePages([page], []);
    expect(cloud.savePages.mock.calls[0][0].data.put[0].base).toBe(3);
    await adapter.writePages([page], ['x']);
    expect(cloud.savePages.mock.calls[1][0].data).toMatchObject({ put: [{ base: 4 }], del: [{ id: 'x', base: 0 }] });
    await adapter.loadPages(['a']);
    await adapter.writePages([page], []);
    expect(cloud.savePages.mock.calls[2][0].data.put[0].base).toBe(6);
  });
  it('fetches only requested pages for cross-tab updates', async () => {
    const cloud = api();
    const loaded = await createCloudAdapter('u', cloud).loadPages(['a', 'missing']);
    expect(cloud.getPages).toHaveBeenCalledWith({ data: { userId: 'u', ids: ['a', 'missing'] } });
    expect(cloud.listPages).not.toHaveBeenCalled();
    expect(loaded.map((p) => p?.title)).toEqual(['B', undefined]);
  });
  it('rejects oversized pages locally and splits large writes into requests', async () => {
    const cloud = api();
    const adapter = createCloudAdapter('u', cloud);
    const huge: Page = { ...page, id: 'huge', blocks: [{ id: 'b', type: 'paragraph', text: 'x'.repeat(MAX_PAGE_BYTES) }] };
    const many = Array.from({ length: 150 }, (_, i) => ({ ...page, id: `p${i}` }));
    const result = await adapter.writePages([huge, ...many], []);
    expect(result).toMatchObject({ rejected: ['huge'] });
    expect(cloud.savePages).toHaveBeenCalledTimes(2);
    expect(cloud.savePages.mock.calls[0][0].data.put).toHaveLength(100);
  });
});
