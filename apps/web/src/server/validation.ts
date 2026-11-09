import { z } from 'zod';
const id = z.string().min(1).max(200);
export const ownerInput = z.object({ userId: id });
export const pageInput = z.object({
  id, title: z.string().max(10000), icon: z.string().max(1000), parentId: id.nullable(),
  order: z.number().finite(), createdAt: z.number().finite(), updatedAt: z.number().finite(),
  blocks: z.array(z.object({
    id, type: z.enum(['paragraph', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'code', 'divider']),
    text: z.string().max(1000000), checked: z.boolean().optional(), indent: z.number().int().min(0).max(4).optional(),
  })).max(10000),
});
export const writeInput = ownerInput.extend({ put: z.array(pageInput).max(500), del: z.array(id).max(500) });
