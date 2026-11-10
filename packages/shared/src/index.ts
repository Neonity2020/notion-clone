export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'quote'
  | 'callout'
  | 'code'
  | 'table'
  | 'divider';

export interface Block {
  id: string;
  type: BlockType;
  text: string;
  /** todo checked state */
  checked?: boolean;
  /** list nesting level 0..4 */
  indent?: number;
}

export interface Page {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  /** sort key among siblings */
  order: number;
  blocks: Block[];
  createdAt: number;
  updatedAt: number;
}

export type PageMap = Record<string, Page>;

/**
 * Upper bound for one serialized Page. D1 rejects rows above 2 MB; the margin
 * covers the composite key, timestamps and SQLite row overhead.
 */
export const MAX_PAGE_BYTES = 1_800_000;

const encoder = new TextEncoder();
/** UTF-8 byte length of the JSON stored for a Page. */
export function pageByteSize(page: Page): number {
  return encoder.encode(JSON.stringify(page)).length;
}

/** A Page as stored in the cloud, with its optimistic concurrency revision. */
export interface PageRecord {
  page: Page;
  revision: number;
}

/** A write rejected because the stored revision moved on since the client read it. */
export interface SaveConflict {
  id: string;
  /** Current stored Page, or null when the row does not exist. */
  page: Page | null;
  revision: number;
}

export interface SaveResult {
  /** New revisions for accepted puts. */
  revisions: Record<string, number>;
  /** IDs whose deletion was accepted (or that were already absent). */
  deleted: string[];
  conflicts: SaveConflict[];
}
