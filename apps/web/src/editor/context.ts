import { createContext, useContext } from 'react';
import type { BlockType } from '../types';

export interface SlashState {
  blockId: string;
  start: number;
  query: string;
  index: number;
  x: number;
  y: number;
}

export interface WikiState {
  blockId: string;
  /** offset of the first `[` in the raw text */
  start: number;
  query: string;
  index: number;
  x: number;
  y: number;
}

export interface EditorCtx {
  pageId: string;
  checkSlash(blockId: string, el: HTMLElement): void;
  slashKeyDown(e: React.KeyboardEvent): boolean;
  closeSlash(): void;
  openSlashAt(blockId: string): void;
  applyType(blockId: string, type: BlockType): void;
  checkWiki(blockId: string, el: HTMLElement): void;
  wikiKeyDown(e: React.KeyboardEvent): boolean;
  closeWiki(): void;
  dragId: string | null;
  setDragId(id: string | null): void;
  dropTarget: { id: string; pos: 'before' | 'after' } | null;
  setDropTarget(t: { id: string; pos: 'before' | 'after' } | null): void;
}

export const EditorContext = createContext<EditorCtx | null>(null);
export const useEditor = () => useContext(EditorContext)!;
