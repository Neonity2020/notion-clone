import type { Block, BlockType, Page } from '../types';
import { uid } from './id';
import { parseTable } from './table';

export function newBlock(type: BlockType = 'paragraph', text = '', extra: Partial<Block> = {}): Block {
  const b: Block = { id: uid('b_'), type, text, ...extra };
  if (type === 'todo' && b.checked === undefined) b.checked = false;
  return b;
}

/** Parse a markdown string into blocks. Supports the subset our block types can express. */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // fenced code
    const fence = line.match(/^\s*```/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(newBlock('code', body.join('\n')));
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    if (i + 1 < lines.length && parseTable(`${line}\n${lines[i + 1]}`)) {
      const table = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) table.push(lines[i++].trimEnd());
      blocks.push(newBlock('table', table.join('\n')));
      continue;
    }

    const indentMatch = raw.match(/^(\s*)/);
    const indent = Math.min(4, Math.floor((indentMatch ? indentMatch[1].replace(/\t/g, '  ').length : 0) / 2));
    const t = line.trim();
    let m: RegExpMatchArray | null;

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) blocks.push(newBlock('divider'));
    else if ((m = t.match(/^###\s+(.*)$/))) blocks.push(newBlock('h3', m[1]));
    else if ((m = t.match(/^##\s+(.*)$/))) blocks.push(newBlock('h2', m[1]));
    else if ((m = t.match(/^#\s+(.*)$/))) blocks.push(newBlock('h1', m[1]));
    else if ((m = t.match(/^[-*+]\s+\[([ xX])\]\s?(.*)$/)))
      blocks.push(newBlock('todo', m[2], { checked: m[1].toLowerCase() === 'x', indent }));
    else if ((m = t.match(/^[-*+]\s+(.*)$/))) blocks.push(newBlock('bullet', m[1], { indent }));
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) blocks.push(newBlock('numbered', m[1], { indent }));
    else if ((m = t.match(/^>\s?\[!\w+\]\s*(.*)$/))) blocks.push(newBlock('callout', m[1]));
    else if ((m = t.match(/^>\s?(.*)$/))) {
      const parts = [m[1]];
      while (i + 1 < lines.length && /^\s*>\s?/.test(lines[i + 1]) && !/^\s*>\s?\[!/.test(lines[i + 1])) {
        i++;
        parts.push(lines[i].replace(/^\s*>\s?/, ''));
      }
      blocks.push(newBlock('quote', parts.join('\n')));
    } else blocks.push(newBlock('paragraph', t));
    i++;
  }
  return blocks;
}

export function blocksToMarkdown(blocks: Block[], opts: { withIds?: boolean } = {}): string {
  const out: string[] = [];
  let num = 0;
  for (const b of blocks) {
    const pad = '  '.repeat(b.indent ?? 0);
    num = b.type === 'numbered' ? num + 1 : 0;
    let s: string;
    switch (b.type) {
      case 'h1': s = `# ${b.text}`; break;
      case 'h2': s = `## ${b.text}`; break;
      case 'h3': s = `### ${b.text}`; break;
      case 'bullet': s = `${pad}- ${b.text}`; break;
      case 'numbered': s = `${pad}${num}. ${b.text}`; break;
      case 'todo': s = `${pad}- [${b.checked ? 'x' : ' '}] ${b.text}`; break;
      case 'quote': s = b.text.split('\n').map((l) => `> ${l}`).join('\n'); break;
      case 'callout': s = `> [!NOTE] ${b.text}`; break;
      case 'code': s = '```\n' + b.text + '\n```'; break;
      case 'divider': s = '---'; break;
      default: s = b.text;
    }
    out.push(opts.withIds ? `<!-- ${b.id} -->\n${s}` : s);
  }
  return out.join('\n\n');
}

export function pageToMarkdown(page: Page): string {
  return `# ${page.icon} ${page.title || '无标题'}\n\n` + blocksToMarkdown(page.blocks);
}
