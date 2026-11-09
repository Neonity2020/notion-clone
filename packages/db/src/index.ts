import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import type { Page } from '@notion-clone/shared';
export { and, eq, inArray, sql } from 'drizzle-orm';

export const pages = sqliteTable('pages', {
  ownerId: text('owner_id').notNull(),
  id: text('id').notNull(),
  data: text('data', { mode: 'json' }).$type<Page>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()).notNull(),
}, (table) => [primaryKey({ columns: [table.ownerId, table.id] })]);

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema: { pages } });
}
