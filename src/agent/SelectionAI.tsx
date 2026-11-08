import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { getSelectionOffsets } from '../editor/caret';
import { chat, isConfigured, loadSettings } from './llm';
import { markdownToBlocks } from '../lib/markdown';
import { MarkdownView } from './MarkdownView';

interface Captured {
  blockId: string;
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  bottom: number;
}

const ACTIONS: { label: string; prompt: string }[] = [
  { label: '✨ 润色', prompt: '改写润色下面的文字，使其更清晰流畅，保持原意和语言。' },
  { label: '✂️ 精简', prompt: '把下面的文字改得更简洁，保留关键信息，保持语言。' },
  { label: '📝 扩写', prompt: '在保持原意的前提下扩写下面的文字，补充细节，保持语言。' },
  { label: '✅ 修正语法', prompt: '修正下面文字中的错别字、语法和标点错误，只做必要修改。' },
  { label: '📌 总结', prompt: '用简短的几句话（或要点列表）总结下面的文字，使用与原文相同的语言。' },
  { label: '🌐 译为英文', prompt: 'Translate the following text into natural English.' },
  { label: '🀄 译为中文', prompt: '把下面的文字翻译成自然流畅的简体中文。' },
  { label: '➡️ 续写', prompt: '接着下面的文字自然地续写一段，只输出续写的新内容。' },
];

export function SelectionAI({ pageId }: { pageId: string }) {
  const [sel, setSel] = useState<Captured | null>(null);
  const [phase, setPhase] = useState<'toolbar' | 'input' | 'result'>('toolbar');
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState('');
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [lastPrompt, setLastPrompt] = useState('');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const check = () => {
      if (phaseRef.current !== 'toolbar') return;
      const active = document.activeElement as HTMLElement | null;
      const blockId = active?.dataset?.blockId;
      if (!active || !blockId || !active.isContentEditable) return setSel(null);
      const off = getSelectionOffsets(active);
      const text = window.getSelection()?.toString() ?? '';
      if (!off || off.start === off.end || !text.trim()) return setSel(null);
      const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      setSel({ blockId, start: off.start, end: off.end, text, x: rect.left + rect.width / 2, y: rect.top, bottom: rect.bottom });
    };
    const onChange = () => {
      clearTimeout(t);
      t = setTimeout(check, 180);
    };
    document.addEventListener('selectionchange', onChange);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      clearTimeout(t);
    };
  }, []);

  // close on outside click / escape when in input/result phase
  useEffect(() => {
    if (!sel || phase === 'toolbar') return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [sel, phase]);

  const close = () => {
    abortRef.current?.abort();
    setSel(null);
    setPhase('toolbar');
    setResult('');
    setCustom('');
    setStatus('idle');
  };

  const run = async (instruction: string) => {
    if (!sel) return;
    const settings = loadSettings();
    if (!isConfigured(settings)) {
      setPhase('result');
      setStatus('error');
      setResult('请先在 AI 面板（⌘J）右上角 ⚙️ 中配置模型接口。');
      return;
    }
    setLastPrompt(instruction);
    setPhase('result');
    setStatus('running');
    setResult('');
    const page = useStore.getState().pages[pageId];
    const block = page?.blocks.find((b) => b.id === sel.blockId);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await chat({
        settings,
        signal: ctrl.signal,
        temperature: 0.5,
        messages: [
          {
            role: 'system',
            content:
              '你是笔记应用中的写作助手。根据指令处理用户选中的文字，只输出处理后的结果本身，不要任何解释、前言或引号。可以使用行内 Markdown（**粗体** 等）。',
          },
          {
            role: 'user',
            content: `页面标题：${page?.title || '无标题'}\n所在段落（上下文）：${block?.text ?? ''}\n\n指令：${instruction}\n\n选中的文字：\n${sel.text}`,
          },
        ],
        onDelta: (d) => setResult((r) => r + d),
      });
      setStatus('done');
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        setStatus('done');
        return;
      }
      setStatus('error');
      setResult((e as Error).message);
    }
  };

  const replace = () => {
    if (!sel) return;
    const s = useStore.getState();
    const block = s.pages[pageId]?.blocks.find((b) => b.id === sel.blockId);
    if (!block) return close();
    const out = result.trim();
    if (out.includes('\n') && block.type !== 'code') {
      // multi-line result: keep text before selection, insert parsed blocks, keep the tail
      const head = block.text.slice(0, sel.start);
      const tail = block.text.slice(sel.end);
      const parsed = markdownToBlocks(out);
      s.updateBlock(pageId, block.id, { text: head + (parsed.length ? '' : out) });
      if (tail.trim()) parsed.push(...markdownToBlocks(tail));
      s.insertBlocks(pageId, block.id, parsed);
      s.markAgentTouched(parsed.map((b) => b.id));
    } else {
      s.updateBlock(pageId, block.id, { text: block.text.slice(0, sel.start) + out + block.text.slice(sel.end) });
      s.markAgentTouched([block.id]);
    }
    close();
  };

  const insertBelow = () => {
    if (!sel) return;
    const blocks = markdownToBlocks(result.trim());
    const s = useStore.getState();
    s.insertBlocks(pageId, sel.blockId, blocks);
    s.markAgentTouched(blocks.map((b) => b.id));
    close();
  };

  if (!sel) return null;

  const top = phase === 'toolbar' ? Math.max(8, sel.y - 46) : Math.min(sel.bottom + 8, window.innerHeight - 320);
  const left = Math.max(8, Math.min(sel.x - (phase === 'toolbar' ? 210 : 200), window.innerWidth - 440));

  return (
    <div ref={boxRef} className={`popover selection-ai phase-${phase}`} style={{ top, left }} onMouseDown={(e) => phase === 'toolbar' && e.preventDefault()}>
      {phase === 'toolbar' && (
        <div className="sel-toolbar">
          <button className="sel-ask" onClick={() => setPhase('input')}>
            ✨ 问 AI
          </button>
          {ACTIONS.slice(0, 4).map((a) => (
            <button key={a.label} onClick={() => run(a.prompt)}>
              {a.label}
            </button>
          ))}
          <button onClick={() => setPhase('input')}>更多…</button>
        </div>
      )}
      {phase === 'input' && (
        <div className="sel-input">
          <input
            autoFocus
            value={custom}
            placeholder="告诉 AI 如何处理选中的文字…"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && custom.trim()) run(custom.trim());
            }}
          />
          <div className="sel-actions-grid">
            {ACTIONS.map((a) => (
              <button key={a.label} onClick={() => run(a.prompt)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {phase === 'result' && (
        <div className="sel-result">
          <div className="sel-result-body">
            {status === 'error' ? <div className="msg-error">{result}</div> : result ? <MarkdownView text={result} /> : <div className="thinking"><span className="dot" /><span className="dot" /><span className="dot" /></div>}
          </div>
          <div className="sel-result-actions">
            {status === 'running' ? (
              <button className="btn small" onClick={() => abortRef.current?.abort()}>停止</button>
            ) : (
              <>
                {status === 'done' && (
                  <>
                    <button className="btn small primary" onClick={replace}>替换选中</button>
                    <button className="btn small" onClick={insertBelow}>插入到下方</button>
                    <button className="btn small" onClick={() => navigator.clipboard?.writeText(result)}>复制</button>
                    <button className="btn small" onClick={() => run(lastPrompt)}>重试</button>
                  </>
                )}
                <span style={{ flex: 1 }} />
                <button className="btn small" onClick={close}>放弃</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
