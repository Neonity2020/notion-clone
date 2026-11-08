/**
 * Tiny inline-markdown renderer used when a block is not being edited.
 * Supported: **bold**, *italic*, `code`, ~~strike~~, [text](url).
 * Each segment remembers where its content starts in the raw text so the
 * caret position can be mapped from rendered text back to raw text on focus.
 */
export interface Segment {
  kind: 'text' | 'bold' | 'italic' | 'code' | 'strike' | 'link';
  text: string;
  rawStart: number;
  url?: string;
}

const PATTERNS: { kind: Segment['kind']; re: RegExp; contentOffset: number }[] = [
  { kind: 'code', re: /^`([^`\n]+)`/, contentOffset: 1 },
  { kind: 'bold', re: /^\*\*([^*\n]+?)\*\*/, contentOffset: 2 },
  { kind: 'strike', re: /^~~([^~\n]+?)~~/, contentOffset: 2 },
  { kind: 'italic', re: /^\*([^*\n]+?)\*/, contentOffset: 1 },
  { kind: 'link', re: /^\[([^\]\n]+)\]\(([^)\s]+)\)/, contentOffset: 1 },
];

export function parseInline(src: string): Segment[] {
  const segs: Segment[] = [];
  let buf = '';
  let bufStart = 0;
  let i = 0;
  const flush = () => {
    if (buf) segs.push({ kind: 'text', text: buf, rawStart: bufStart });
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i];
    if (ch === '`' || ch === '*' || ch === '~' || ch === '[') {
      const rest = src.slice(i);
      let matched = false;
      for (const p of PATTERNS) {
        const m = rest.match(p.re);
        if (m) {
          flush();
          segs.push({ kind: p.kind, text: m[1], rawStart: i + p.contentOffset, url: m[2] });
          i += m[0].length;
          bufStart = i;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
    if (!buf) bufStart = i;
    buf += ch;
    i++;
  }
  flush();
  return segs;
}

export function hasInlineMarks(src: string): boolean {
  return parseInline(src).some((s) => s.kind !== 'text');
}

/** Map an offset in rendered text to an offset in the raw source. */
export function displayToRaw(src: string, displayOffset: number): number {
  const segs = parseInline(src);
  let d = 0;
  for (const s of segs) {
    if (displayOffset <= d + s.text.length) return s.rawStart + (displayOffset - d);
    d += s.text.length;
  }
  return src.length;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const safeUrl = (u: string) => (/^(https?:|mailto:|#|\/)/i.test(u) ? u : '#');

export function renderInlineHTML(src: string): string {
  return parseInline(src)
    .map((s) => {
      const t = esc(s.text);
      switch (s.kind) {
        case 'bold': return `<strong>${t}</strong>`;
        case 'italic': return `<em>${t}</em>`;
        case 'code': return `<code class="inline-code">${t}</code>`;
        case 'strike': return `<s>${t}</s>`;
        case 'link': return `<a href="${esc(safeUrl(s.url!))}" target="_blank" rel="noopener noreferrer">${t}</a>`;
        default: return t;
      }
    })
    .join('');
}
