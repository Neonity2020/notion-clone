import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), createDatabase: vi.fn(), where: vi.fn(), values: vi.fn(), conflict: vi.fn(), batch: vi.fn() }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (v: unknown) => unknown }) => ({
      handler: (fn: (v: unknown) => unknown) => (args: { data: unknown }) => fn({ data: schema.parse(args.data) }),
    }),
  }),
}));
vi.mock('cloudflare:workers', () => ({ env: { DB: {} } }));
vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: mocks.auth }));
vi.mock('@notion-clone/db', () => ({
  createDatabase: mocks.createDatabase,
  pages: { ownerId: 'owner', id: 'id', data: 'data', revision: 'revision' },
  eq: (...args: unknown[]) => args, and: (...args: unknown[]) => args, or: (...args: unknown[]) => ['or', ...args],
  inArray: (...args: unknown[]) => args, sql: (...args: unknown[]) => args,
}));
import { getPages, listPages, savePages } from '../server/pages';
const makePage = (id: string, text = '') => ({ id, title: '', icon: '', parentId: null, order: 0, blocks: text ? [{ id: 'b', type: 'paragraph' as const, text }] : [], createdAt: 1, updatedAt: 1 });
const returning = (rows: unknown) => ({ returning: () => rows });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'owner-a' });
  mocks.where.mockImplementation(() => Object.assign(Promise.resolve([]), returning('delete')));
  mocks.conflict.mockReturnValue(returning('upsert'));
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict });
  mocks.batch.mockImplementation(async (statements: unknown[]) => statements.map(() => []));
  mocks.createDatabase.mockReturnValue({ select: () => ({ from: () => ({ where: mocks.where }) }), insert: () => ({ values: mocks.values }), delete: () => ({ where: mocks.where }), batch: mocks.batch });
});
it('rejects unauthenticated access before opening the database', async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  await expect(listPages({ data: { userId: 'owner-a' } })).rejects.toThrow('Unauthorized');
  expect(mocks.createDatabase).not.toHaveBeenCalled();
});
it('rejects a stale or forged owner identity', async () => {
  await expect(savePages({ data: { userId: 'owner-b', put: [], del: [{ id: 'a', base: 0 }] } })).rejects.toThrow('Unauthorized');
  await expect(getPages({ data: { userId: 'owner-b', ids: ['a'] } })).rejects.toThrow('Unauthorized');
  expect(mocks.createDatabase).not.toHaveBeenCalled();
});
it('scopes reads and deletions to the authenticated owner', async () => {
  await listPages({ data: { userId: 'owner-a' } });
  expect(mocks.where).toHaveBeenLastCalledWith(['owner', 'owner-a']);
  await getPages({ data: { userId: 'owner-a', ids: ['a', 'b'] } });
  expect(mocks.where).toHaveBeenLastCalledWith([['owner', 'owner-a'], ['id', ['a', 'b']]]);
  mocks.batch.mockResolvedValueOnce([[{ id: 'a' }]]);
  await savePages({ data: { userId: 'owner-a', put: [], del: [{ id: 'a', base: 2 }] } });
  expect(mocks.where).toHaveBeenCalledWith([['owner', 'owner-a'], ['or', [['id', 'a'], ['revision', 2]]]]);
});
it('writes base + 1 and only overwrites rows still at the base revision', async () => {
  const page = makePage('a');
  mocks.batch.mockResolvedValueOnce([[{ id: 'a', revision: 4 }]]);
  const result = await savePages({ data: { userId: 'owner-a', put: [{ page, base: 3 }], del: [] } });
  expect(mocks.values).toHaveBeenCalledWith([{ ownerId: 'owner-a', id: 'a', data: page, revision: 4 }]);
  expect(mocks.conflict).toHaveBeenCalledWith(expect.objectContaining({ target: ['owner', 'id'], setWhere: expect.anything() }));
  expect(result).toEqual({ revisions: { a: 4 }, deleted: [], conflicts: [] });
});
it('reports conflicts with the stored page and treats already-deleted rows as deleted', async () => {
  const stored = makePage('a', 'theirs');
  mocks.batch.mockResolvedValueOnce([[], []]);
  mocks.where.mockImplementation((cond: unknown) => {
    const rows = JSON.stringify(cond).includes('"id",["a","b"]') ? [{ page: stored, revision: 7 }] : [];
    return Object.assign(Promise.resolve(rows), returning('delete'));
  });
  const result = await savePages({ data: { userId: 'owner-a', put: [{ page: makePage('a', 'mine'), base: 3 }], del: [{ id: 'b', base: 1 }] } });
  expect(result.conflicts).toEqual([{ id: 'a', page: stored, revision: 7 }]);
  expect(result.deleted).toEqual(['b']);
});
it('rejects pages above the D1 row size limit', async () => {
  const huge = makePage('a', 'x'.repeat(1_000_000));
  huge.blocks.push({ id: 'c', type: 'paragraph', text: 'y'.repeat(900_000) });
  await expect((async () => savePages({ data: { userId: 'owner-a', put: [{ page: huge, base: 0 }], del: [] } }))()).rejects.toThrow('PAGE_TOO_LARGE');
  expect(mocks.createDatabase).not.toHaveBeenCalled();
});
it('chunks writes within D1 statement limits', async () => {
  const put = Array.from({ length: 100 }, (_, i) => ({ page: makePage(String(i)), base: 0 }));
  const del = Array.from({ length: 500 }, (_, i) => ({ id: `d${i}`, base: 0 }));
  mocks.batch.mockImplementationOnce(async (statements: unknown[]) => statements.map((_, i) => i < 5
    ? put.slice(i * 20, i * 20 + 20).map(({ page }) => ({ id: page.id, revision: 1 }))
    : del.slice((i - 5) * 40, (i - 5) * 40 + 40).map(({ id }) => ({ id }))));
  const result = await savePages({ data: { userId: 'owner-a', put, del } });
  expect(mocks.values).toHaveBeenCalledTimes(5);
  expect(mocks.values.mock.calls.every(([rows]) => rows.length <= 20)).toBe(true);
  expect(mocks.batch.mock.calls[0][0]).toHaveLength(5 + 13);
  expect(result.conflicts).toEqual([]);
  expect(result.deleted).toHaveLength(500);
});
