import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPersistence, type PersistenceAdapter } from '../persist';
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
});
