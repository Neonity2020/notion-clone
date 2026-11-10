import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import type { AgentMode } from './tools';
import { MarkdownView } from './MarkdownView';
import { SettingsDialog } from './Settings';
import { prettyJSON, useChatStore } from './chatStore';
import type { UIItem } from './agent';

const SUGGESTIONS: Record<AgentMode, string[]> = {
  agent: ['总结当前页面，并把摘要插入到页面开头', '把当前页面中的要点整理成待办清单', '帮我创建一份本周计划页面', '为我所有的页面建立一个索引页'],
  ask: ['当前页面讲了什么？', '我的笔记里有哪些未完成的待办？', '搜索我关于"计划"的笔记', '我的工作区有哪些页面？'],
};

export function ChatTurnView({ item, onUndo }: { item: UIItem; onUndo(id: string): void }) {
  const pages = useStore((s) => s.pages);
  if (item.kind === 'user') {
    return (
      <div className="msg user">
        <div className="bubble">{item.text}</div>
      </div>
    );
  }
  const touchedIds = item.undo ? Object.keys(item.undo.pages) : [];
  return (
    <div className="msg assistant">
      {item.tools.length > 0 && (
        <div className="tool-list">
          {item.tools.map((t) => (
            <details key={t.id} className={`tool ${t.status}`}>
              <summary>
                <span className="tool-status">{t.status === 'running' ? <span className="spinner" /> : t.status === 'ok' ? '✓' : '⚠'}</span>
                {t.label}
              </summary>
              <div className="tool-detail">
                <div className="muted">参数</div>
                <pre>{prettyJSON(t.args)}</pre>
                {t.output && (
                  <>
                    <div className="muted">结果</div>
                    <pre>{t.output.length > 1500 ? t.output.slice(0, 1500) + '…' : t.output}</pre>
                  </>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
      {item.text && <MarkdownView text={item.text} />}
      {item.streaming && !item.text && item.tools.every((t) => t.status !== 'running') && (
        <div className="thinking">
          <span className="dot" />
          <span className="dot" />
          <span className="dot" />
        </div>
      )}
      {item.error && <div className="msg-error">{item.error}</div>}
      {item.undo && (
        <div className="undo-row">
          {touchedIds.map((pid) => {
            const p = pages[pid];
            return p ? (
              <button
                key={pid}
                className="btn small ghost page-jump-chip"
                onClick={() => {
                  const s = useStore.getState();
                  if (s.mainView === 'agent-home') s.setAgentOpen(true);
                  s.openPage(pid);
                }}
                title="打开此页面"
              >
                {p.icon} {p.title || '无标题'} ↗
              </button>
            ) : null;
          })}
          {item.undo.undone ? (
            <span className="muted small">已撤销本次修改</span>
          ) : (
            <button className="btn small" onClick={() => onUndo(item.id)}>
              ↶ 撤销本次修改（{touchedIds.length} 个页面）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentPanel() {
  const open = useStore((s) => s.agentOpen);
  const setOpen = useStore((s) => s.setAgentOpen);
  const currentTitle = useStore((s) => (s.currentPageId ? s.pages[s.currentPageId]?.title || '无标题' : null));

  const items = useChatStore((s) => s.items);
  const mode = useChatStore((s) => s.mode);
  const running = useChatStore((s) => s.running);
  const showSettings = useChatStore((s) => s.showSettings);
  const setMode = useChatStore((s) => s.setMode);
  const setShowSettings = useChatStore((s) => s.setShowSettings);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const undo = useChatStore((s) => s.undo);
  const clear = useChatStore((s) => s.clear);

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timeout);
  }, [open]);

  const submit = (text: string) => {
    if (!text.trim() || running) return;
    setInput('');
    void send(text);
  };

  return (
    <>
    <div className={`agent-panel-container${open ? ' is-open' : ''}`} aria-hidden={!open} inert={!open}>
    <aside className="agent-panel" id="agent-panel" aria-label="AI 侧边栏">
      <header className="agent-header">
        <div className="mode-switch" role="tablist">
          <button className={mode === 'ask' ? 'on' : ''} onClick={() => setMode('ask')} title="只读：搜索和阅读你的笔记">
            💬 问答
          </button>
          <button className={mode === 'agent' ? 'on' : ''} onClick={() => setMode('agent')} title="可以直接编辑页面和块">
            ✨ Agent
          </button>
        </div>
        <span style={{ flex: 1 }} />
        <button
          className="icon-btn"
          title="切换到全屏 AI Agent 欢迎页"
          onClick={() => {
            setOpen(false);
            useStore.getState().openAgentHome();
          }}
        >
          ⤢
        </button>
        <button className="icon-btn" title="新对话" onClick={clear}>
          ⟲
        </button>
        <button className="icon-btn" title="AI 设置" onClick={() => setShowSettings(true)}>
          ⚙️
        </button>
        <button className="icon-btn" title="关闭 (⌘J)" onClick={() => setOpen(false)}>
          ✕
        </button>
      </header>

      <div className="agent-list" ref={listRef}>
        {items.length === 0 && (
          <div className="agent-empty">
            <div className="agent-empty-icon">{mode === 'agent' ? '✨' : '💬'}</div>
            <div className="agent-empty-title">{mode === 'agent' ? 'Agent 侧边栏模式' : '问答模式'}</div>
            <p className="muted">
              {mode === 'agent'
                ? '边看笔记边协作：我可以阅读、搜索并直接编辑当前页面或全库笔记。所有修改均可一键撤销。'
                : '我会搜索和阅读你的笔记来回答问题，不会修改任何内容。'}
            </p>
            <div className="suggestions">
              {SUGGESTIONS[mode].map((s) => (
                <button key={s} className="suggestion" onClick={() => submit(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {items.map((it) => (
          <ChatTurnView key={it.id} item={it} onUndo={undo} />
        ))}
      </div>

      <div className="agent-input">
        {currentTitle && <div className="context-chip">📄 当前页面：{currentTitle}</div>}
        <textarea
          ref={inputRef}
          value={input}
          placeholder={mode === 'agent' ? '让 Agent 帮你写作、编辑或整理笔记…' : '问问你的笔记…'}
          rows={3}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit(input);
            }
          }}
        />
        <div className="agent-input-actions">
          <span className="muted small">Enter 发送 · Shift+Enter 换行</span>
          {running ? (
            <button className="btn small danger" onClick={stop}>
              ■ 停止
            </button>
          ) : (
            <button className="btn small primary" disabled={!input.trim()} onClick={() => submit(input)}>
              发送
            </button>
          )}
        </div>
      </div>
    </aside>
    </div>
    {open && showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </>
  );
}
