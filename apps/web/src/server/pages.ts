import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@clerk/tanstack-react-start/server';
import { createDatabase, pages, and, eq, inArray, or, sql } from '@notion-clone/db';
import { pageByteSize, type PageRecord, type SaveConflict, type SaveResult } from '@notion-clone/shared';
import { ownerInput, readInput, writeInput } from './validation';

// D1 permits at most 100 bound parameters per statement.
const UPSERT_ROWS = 20; // 5 parameters per row
const UPSERT_BYTES = 4_000_000;
const DELETE_ROWS = 40; // 1 owner parameter + 2 per row
const READ_IDS = 90; // 1 owner parameter + 1 per id

async function database(expectedUserId: string) {
  const { userId } = await auth();
  if (!userId || userId !== expectedUserId) throw new Error('Unauthorized');
  return { db: createDatabase(env.DB), userId };
}
type Database = ReturnType<typeof createDatabase>;

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readRecords(db: Database, userId: string, ids: string[]): Promise<PageRecord[]> {
  const rows = await Promise.all(chunk(ids, READ_IDS).map((part) =>
    db.select({ page: pages.data, revision: pages.revision }).from(pages)
      .where(and(eq(pages.ownerId, userId), inArray(pages.id, part)))));
  return rows.flat();
}

export const listPages = createServerFn({ method: 'GET' }).validator(ownerInput).handler(async ({ data }): Promise<PageRecord[]> => {
  const { db, userId } = await database(data.userId);
  return db.select({ page: pages.data, revision: pages.revision }).from(pages).where(eq(pages.ownerId, userId));
});

export const getPages = createServerFn({ method: 'POST' }).validator(readInput).handler(async ({ data }): Promise<PageRecord[]> => {
  const { db, userId } = await database(data.userId);
  return data.ids.length ? readRecords(db, userId, data.ids) : [];
});

/**
 * Conditional writes: a put or delete only applies when the stored revision
 * still equals the client's `base`. Each Page succeeds or conflicts on its
 * own; conflicts return the stored Page so the client can resolve them.
 */
export const savePages = createServerFn({ method: 'POST' }).validator(writeInput).handler(async ({ data }): Promise<SaveResult> => {
  const { db, userId } = await database(data.userId);
  const upsertGroups: (typeof data.put)[] = [];
  let group: typeof data.put = [];
  let bytes = 0;
  for (const item of data.put) {
    const size = pageByteSize(item.page);
    if (group.length && (group.length >= UPSERT_ROWS || bytes + size > UPSERT_BYTES)) {
      upsertGroups.push(group); group = []; bytes = 0;
    }
    group.push(item); bytes += size;
  }
  if (group.length) upsertGroups.push(group);

  const upserts = upsertGroups.map((items) => db.insert(pages).values(items.map(({ page, base }) => ({
    ownerId: userId, id: page.id, data: page, revision: base + 1,
  }))).onConflictDoUpdate({
    target: [pages.ownerId, pages.id],
    set: { data: sql`excluded.data`, updatedAt: sql`excluded.updated_at`, revision: sql`excluded.revision` },
    // Inserts carry base + 1, so this only overwrites rows still at `base`.
    setWhere: sql`${pages.revision} = excluded.revision - 1`,
  }).returning({ id: pages.id, revision: pages.revision }));
  const deletes = chunk(data.del, DELETE_ROWS).map((items) => db.delete(pages).where(and(
    eq(pages.ownerId, userId),
    or(...items.map((item) => and(eq(pages.id, item.id), eq(pages.revision, item.base)))),
  )).returning({ id: pages.id }));

  const statements = [...upserts, ...deletes];
  // D1 batches execute atomically in a transaction.
  const results = statements.length ? await db.batch([statements[0]!, ...statements.slice(1)]) : [];
  const revisions: Record<string, number> = {};
  for (const rows of results.slice(0, upserts.length) as { id: string; revision: number }[][]) {
    for (const row of rows) revisions[row.id] = row.revision;
  }
  const removed = new Set((results.slice(upserts.length) as { id: string }[][]).flat().map((row) => row.id));

  const putConflicts = data.put.map((item) => item.page.id).filter((id) => revisions[id] === undefined);
  const delMisses = data.del.map((item) => item.id).filter((id) => !removed.has(id));
  const current = new Map((await readRecords(db, userId, [...putConflicts, ...delMisses])).map((r) => [r.page.id, r]));
  const conflicts: SaveConflict[] = putConflicts.map((id) => {
    const record = current.get(id);
    return { id, page: record?.page ?? null, revision: record?.revision ?? 0 };
  });
  const deleted = [...removed];
  for (const id of delMisses) {
    const record = current.get(id);
    // A missing row means another device already deleted it: not a conflict.
    if (record) conflicts.push({ id, page: record.page, revision: record.revision });
    else deleted.push(id);
  }
  return { revisions, deleted, conflicts };
});
