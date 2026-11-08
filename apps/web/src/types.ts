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
