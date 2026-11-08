import { Fragment, useMemo } from 'react';
import { markdownToBlocks } from '../lib/markdown';
import { parseInline } from '../lib/inline';

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((s, i) => {
        switch (s.kind) {
          case 'bold': return <strong key={i}>{s.text}</strong>;
          case 'italic': return <em key={i}>{s.text}</em>;
          case 'code': return <code key={i} className="inline-code">{s.text}</code>;
          case 'strike': return <s key={i}>{s.text}</s>;
          case 'link':
            return (
              <a key={i} href={/^https?:/i.test(s.url!) ? s.url : '#'} target="_blank" rel="noopener noreferrer">
                {s.text}
              </a>
            );
          default: return <Fragment key={i}>{s.text}</Fragment>;
        }
      })}
    </>
  );
}

/** Read-only markdown renderer reusing the block parser. */
export function MarkdownView({ text }: { text: string }) {
  const blocks = useMemo(() => markdownToBlocks(text), [text]);
  let n = 0;
  return (
    <div className="md">
      {blocks.map((b) => {
        n = b.type === 'numbered' ? n + 1 : 0;
        const style = b.indent ? { marginLeft: b.indent * 16 } : undefined;
        switch (b.type) {
          case 'h1': return <h3 key={b.id}><Inline text={b.text} /></h3>;
          case 'h2': return <h4 key={b.id}><Inline text={b.text} /></h4>;
          case 'h3': return <h5 key={b.id}><Inline text={b.text} /></h5>;
          case 'bullet': return <div key={b.id} className="md-li" style={style}><span>•</span><div><Inline text={b.text} /></div></div>;
          case 'numbered': return <div key={b.id} className="md-li" style={style}><span>{n}.</span><div><Inline text={b.text} /></div></div>;
          case 'todo': return <div key={b.id} className="md-li" style={style}><span>{b.checked ? '☑' : '☐'}</span><div><Inline text={b.text} /></div></div>;
          case 'quote':
          case 'callout': return <blockquote key={b.id}><Inline text={b.text} /></blockquote>;
          case 'code': return <pre key={b.id}><code>{b.text}</code></pre>;
          case 'divider': return <hr key={b.id} />;
          default: return <p key={b.id}><Inline text={b.text} /></p>;
        }
      })}
    </div>
  );
}
