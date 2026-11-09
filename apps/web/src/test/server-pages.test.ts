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
vi.mock('@notion-clone/db', () => ({ createDatabase: mocks.createDatabase, pages: { ownerId: 'owner', id: 'id', data: 'data' }, eq: (...args: unknown[]) => args, and: (...args: unknown[]) => args, inArray: (...args: unknown[]) => args, sql: (...args: unknown[]) => args }));
import { listPages, savePages } from '../server/pages';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: 'owner-a' });
  mocks.where.mockResolvedValue([]);
  mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict });
  mocks.createDatabase.mockReturnValue({ select: () => ({ from: () => ({ where: mocks.where }) }), insert: () => ({ values: mocks.values }), delete: () => ({ where: mocks.where }), batch: mocks.batch });
});
it('rejects unauthenticated access before opening the database', async () => {
  mocks.auth.mockResolvedValue({ userId: null });
  await expect(listPages({ data: { userId: 'owner-a' } })).rejects.toThrow('Unauthorized');
  expect(mocks.createDatabase).not.toHaveBeenCalled();
});
it('rejects a stale or forged owner identity', async () => {
  await expect(savePages({ data: { userId: 'owner-b', put: [], del: ['a'] } })).rejects.toThrow('Unauthorized');
  expect(mocks.createDatabase).not.toHaveBeenCalled();
});
it('scopes reads and deletions to the authenticated owner', async () => {
  await listPages({ data: { userId: 'owner-a' } });
  expect(mocks.where).toHaveBeenLastCalledWith(['owner', 'owner-a']);
  await savePages({ data: { userId: 'owner-a', put: [], del: ['a'] } });
  expect(mocks.where).toHaveBeenLastCalledWith([['owner', 'owner-a'], ['id', ['a']]]);
});
it('uses the authenticated owner for inserts and the composite key for upserts', async () => {
  const page = { id: 'a', title: '', icon: '', parentId: null, order: 0, blocks: [], createdAt: 1, updatedAt: 1 };
  await savePages({ data: { userId: 'owner-a', put: [page], del: [] } });
  expect(mocks.values).toHaveBeenCalledWith([{ ownerId: 'owner-a', id: 'a', data: page }]);
  expect(mocks.conflict).toHaveBeenCalledWith(expect.objectContaining({ target: ['owner', 'id'] }));
});

it('chunks large imports and deletes within D1 statement limits', async () => {
  const put = Array.from({ length: 500 }, (_, i) => ({ id: String(i), title: '', icon: '', parentId: null, order: 0, blocks: [], createdAt: 1, updatedAt: 1 }));
  await savePages({ data: { userId: 'owner-a', put, del: put.map((page) => page.id) } });
  expect(mocks.values).toHaveBeenCalledTimes(25);
  expect(mocks.values.mock.calls.every(([rows]) => rows.length <= 20)).toBe(true);
  expect(mocks.batch.mock.calls[0][0]).toHaveLength(31);
});
