import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { auth } from '@clerk/tanstack-react-start/server';
import { createDatabase, pages, and, eq, inArray, sql } from '@notion-clone/db';
import { ownerInput, writeInput } from './validation';

async function database(expectedUserId: string) {
  const { userId } = await auth();
  if (!userId || userId !== expectedUserId) throw new Error('Unauthorized');
  return { db: createDatabase(env.DB), userId };
}
export const listPages = createServerFn({ method: 'GET' }).validator(ownerInput).handler(async ({ data }) => {
  const { db, userId } = await database(data.userId);
  const rows = await db.select({ data: pages.data }).from(pages).where(eq(pages.ownerId, userId));
  return rows.map((row) => row.data);
});
export const savePages = createServerFn({ method: 'POST' }).validator(writeInput).handler(async ({ data }) => {
  const { db, userId } = await database(data.userId);
  // D1 permits at most 100 bound parameters per statement. Group inserts
  // and split deletes to keep every statement within that limit.
  const writes = [];
  for (let i = 0; i < data.put.length; i += 20) {
    writes.push(db.insert(pages).values(data.put.slice(i, i + 20).map((page) => ({
      ownerId: userId, id: page.id, data: page,
    }))).onConflictDoUpdate({
      target: [pages.ownerId, pages.id],
      set: { data: sql`excluded.data`, updatedAt: sql`excluded.updated_at` },
    }));
  }
  const deletes = [];
  for (let i = 0; i < data.del.length; i += 90) {
    deletes.push(db.delete(pages).where(and(eq(pages.ownerId, userId), inArray(pages.id, data.del.slice(i, i + 90)))));
  }
  const statements = [...writes, ...deletes];
  // D1 batches execute atomically in a transaction.
  if (statements.length) await db.batch([statements[0]!, ...statements.slice(1)]);
});
