import { z } from 'zod';
import { MAX_PAGE_BYTES, pageByteSize } from '@notion-clone/shared';
const id = z.string().min(1).max(200);
const revision = z.number().int().min(0);
export const ownerInput = z.object({ userId: id });
export const pageInput = z.object({
  id, title: z.string().max(10000), icon: z.string().max(1000), parentId: id.nullable(),
  order: z.number().finite(), createdAt: z.number().finite(), updatedAt: z.number().finite(),
  blocks: z.array(z.object({
    id, type: z.enum(['paragraph', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code', 'divider']),
    text: z.string().max(1000000), checked: z.boolean().optional(), indent: z.number().int().min(0).max(4).optional(),
  })).max(10000),
}).refine((page) => pageByteSize(page) <= MAX_PAGE_BYTES, { message: 'PAGE_TOO_LARGE' });
export const readInput = ownerInput.extend({ ids: z.array(id).max(500) });
/** `base` is the revision the client last read; 0 for Pages it has never seen stored. */
export const writeInput = ownerInput.extend({
  put: z.array(z.object({ page: pageInput, base: revision })).max(100),
  del: z.array(z.object({ id, base: revision })).max(500),
});
