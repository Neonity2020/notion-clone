import { MAX_PAGE_BYTES, pageByteSize, type PageRecord, type SaveResult } from '@notion-clone/shared';
import type { PersistenceAdapter, WriteResult } from '../persist';
import type { Page } from '../types';

export interface CloudApi {
  listPages(args: { data: { userId: string } }): Promise<PageRecord[]>;
  getPages(args: { data: { userId: string; ids: string[] } }): Promise<PageRecord[]>;
  savePages(args: { data: {
    userId: string;
    put: { page: Page; base: number }[];
    del: { id: string; base: number }[];
  } }): Promise<SaveResult>;
}

// Keep each request below Workers body limits and the server's input caps.
const REQUEST_PAGES = 100;
const REQUEST_BYTES = 8_000_000;
const REQUEST_DELETES = 500;
const READ_IDS = 500;

/**
 * Persistence adapter for the D1-backed Web workspace. Tracks the stored
 * revision of every Page so writes are conditional (optimistic concurrency).
 */
export function createCloudAdapter(userId: string, api: CloudApi): PersistenceAdapter {
  const revisions = new Map<string, number>();
  const remember = (records: PageRecord[]) => {
    for (const record of records) revisions.set(record.page.id, record.revision);
    return records.map((record) => record.page);
  };
  return {
    async loadAllPages() {
      revisions.clear();
      return remember(await api.listPages({ data: { userId } }));
    },
    async loadPages(ids) {
      const byId = new Map<string, Page>();
      for (let i = 0; i < ids.length; i += READ_IDS) {
        for (const page of remember(await api.getPages({ data: { userId, ids: ids.slice(i, i + READ_IDS) } }))) {
          byId.set(page.id, page);
        }
      }
      return ids.map((id) => byId.get(id));
    },
    async writePages(put, del): Promise<WriteResult> {
      const rejected: string[] = [];
      const groups: Page[][] = [];
      let group: Page[] = [];
      let bytes = 0;
      for (const page of put) {
        const size = pageByteSize(page);
        if (size > MAX_PAGE_BYTES) { rejected.push(page.id); continue; }
        if (group.length && (group.length >= REQUEST_PAGES || bytes + size > REQUEST_BYTES)) {
          groups.push(group); group = []; bytes = 0;
        }
        group.push(page); bytes += size;
      }
      if (group.length) groups.push(group);
      const delGroups: string[][] = [];
      for (let i = 0; i < del.length; i += REQUEST_DELETES) delGroups.push(del.slice(i, i + REQUEST_DELETES));

      const conflicts: NonNullable<WriteResult['conflicts']> = [];
      const requests = Math.max(groups.length, delGroups.length);
      // Each Page is an independent unit, so partial progress across
      // requests is safe: a retry resends with the updated revisions.
      for (let i = 0; i < requests; i++) {
        const result = await api.savePages({ data: {
          userId,
          put: (groups[i] ?? []).map((page) => ({ page, base: revisions.get(page.id) ?? 0 })),
          del: (delGroups[i] ?? []).map((id) => ({ id, base: revisions.get(id) ?? 0 })),
        } });
        for (const [id, revision] of Object.entries(result.revisions)) revisions.set(id, revision);
        for (const id of result.deleted) revisions.delete(id);
        for (const conflict of result.conflicts) {
          if (conflict.page) revisions.set(conflict.id, conflict.revision);
          else revisions.delete(conflict.id);
          conflicts.push({ id: conflict.id, page: conflict.page });
        }
      }
      return { conflicts, rejected };
    },
  };
}
