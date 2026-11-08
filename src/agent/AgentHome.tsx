import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { useChatStore } from './chatStore';
import { ChatTurnView } from './AgentPanel';
import { SettingsDialog } from './Settings';
import type { AgentMode } from './tools';

interface QuickCard {
  icon: string;
  title: string;
  desc: string;
  mode: AgentMode;
  prompt: string;
}

const WELCOME_CARDS: QuickCard[] = [
  {
    icon: '🗓️',
    title: '创建本周计划',
    desc: '生成包含目标、优先级和每日待办的新页面',
    mode: 'agent',
    prompt: '帮我新建一个「📅 本周工作计划」页面，包含本周核心目标、高优先级待办清单和每日安排模板，并打开该页面。',
  },
  {
    icon: '🗂️',
    title: '生成知识库总目录',
    desc: '扫描所有页面，自动生成结构化导航索引页',
    mode: 'agent',
    prompt: '请浏览我工作区中的所有页面，新建或更新一个「🧭 知识库索引」页面，按主题分类列出所有页面的简介与结构。',
  },
  {
    icon: '✅',
    title: '汇总全部未完成待办',
    desc: '跨页面搜集所有未勾选的待办事项',
    mode: 'ask',
    prompt: '请检查我所有页面中的待办事项（todo），按页面汇总所有尚未完成的任务清单。',
  },
  {
    icon: '📝',
    title: '会议纪要模板页',
    desc: '创建包含议程、讨论要点和行动项的页面',
    mode: 'agent',
    prompt: '帮我创建一个「📋 会议纪要」新页面，包含会议信息、议程、核心结论和行动项（Action Items）待办列表。',
  },
  {
    icon: '🧹',
    title: '整理并润色当前页面',
    desc: '优化当前打开页面的排版层级与表达',
    mode: 'agent',
    prompt: '请阅读我当前打开的页面，在不丢失信息的前提下优化它的标题层级、列表结构和文字表达。',
  },
  {
    icon: '💡',
    title: '知识库洞察与总结',
    desc: '回顾最近记录的笔记，提炼关键主题',
    mode: 'ask',
    prompt: '请浏览我的全部笔记页面，帮我总结目前记录的核心内容、主要主题，并给出下一步整理建议。',
  },
];

export function AgentHome({
  sidebarCollapsed,
  onExpandSidebar,
}: {
  sidebarCollapsed: boolean;
  onExpandSidebar(): void;
}) {
  const pages = useStore((s) => s.pages);
  const currentPageId = useStore((s) => s.currentPageId);
  const currentPage = currentPageId ? pages[currentPageId] : undefined;

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
  const [targetPageId, setTargetPageId] = useState<string>('auto');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const stats = useMemo(() => {
    const list = Object.values(pages);
    let openTodos = 0;
    let doneTodos = 0;
    for (const p of list) {
      for (const b of p.blocks) {
        if (b.type === 'todo') {
          if (b.checked) doneTodos++;
          else openTodos++;
        }
      }
    }
    const recent = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
    return { pageCount: list.length, openTodos, doneTodos, recent };
  }, [pages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && items.length > 0) el.scrollTop = el.scrollHeight;
  }, [items]);

  const submit = (rawText: string, overrideMode?: AgentMode) => {
    const text = rawText.trim();
    if (!text || running) return;
    if (overrideMode && overrideMode !== mode) setMode(overrideMode);
    const prefix =
      targetPageId !== 'auto' && pages[targetPageId]
        ? `（针对页面「${pages[targetPageId].title || '无标题'}」page_id: ${targetPageId}）\n`
        : '';
    setInput('');
    void send(prefix + text);
  };

  return (
    <main className="main agent-home-main">
      <div className="topbar">
        {sidebarCollapsed && (
          <button className="icon-btn" title="展开侧边栏 (⌘\)" onClick={onExpandSidebar}>
            ☰
          </button>
        )}
        <div className="breadcrumbs">
          <span className="crumb active-crumb">✨ AI Agent 工作台</span>
        </div>
        <span style={{ flex: 1 }} />
        {items.length > 0 && (
          <button className="btn ghost small" onClick={clear} title="清空对话回到欢迎界面">
            ⟲ 新对话
          </button>
        )}
        <button
          className="btn ghost small"
          title="切换到页面视图并在右侧边栏打开 Agent (⌘J)"
          onClick={() => {
            const s = useStore.getState();
            const fallbackId = s.currentPageId ?? Object.keys(s.pages)[0] ?? null;
            s.setAgentOpen(true);
            s.openPage(fallbackId);
          }}
        >
          ◫ 侧边栏模式
        </button>
        <button className="btn ghost small" onClick={() => setShowSettings(true)}>
          ⚙️ 模型设置
        </button>
      </div>

      <div className="agent-home-scroll" ref={scrollRef}>
        <div className="agent-home-container">
          {/* Welcome Hero Header */}
          <div className={`agent-welcome-hero${items.length > 0 ? ' compact' : ''}`}>
            <div className="agent-welcome-badge">✨ Local-First AI Agent</div>
            <h1 className="agent-welcome-title">你好，今天想处理什么笔记？</h1>
            <p className="agent-welcome-sub">
              我可以搜索和阅读你的全部本地笔记，也可以直接帮你创建页面、撰写内容、整理待办与重组知识结构。
            </p>

            <div className="agent-stats-bar">
              <span>📚 共 {stats.pageCount} 个页面</span>
              <span>·</span>
              <span>☐ {stats.openTodos} 项待办未完成</span>
              {stats.doneTodos > 0 && (
                <>
                  <span>·</span>
                  <span>☑ 已完成 {stats.doneTodos} 项</span>
                </>
              )}
            </div>
          </div>

          {/* Conversation Thread (when active) */}
          {items.length > 0 && (
            <div className="agent-home-thread">
              {items.map((it) => (
                <ChatTurnView key={it.id} item={it} onUndo={undo} />
              ))}
            </div>
          )}

          {/* Composer Box */}
          <div className="agent-home-composer">
            <div className="composer-toolbar">
              <div className="mode-switch" role="tablist">
                <button
                  className={mode === 'agent' ? 'on' : ''}
                  onClick={() => setMode('agent')}
                  title="Agent 模式：可读取、创建、修改和整理页面与块"
                >
                  ✨ Agent 读写模式
                </button>
                <button
                  className={mode === 'ask' ? 'on' : ''}
                  onClick={() => setMode('ask')}
                  title="问答模式：只读搜索与回答，不修改任何笔记"
                >
                  💬 问答只读模式
                </button>
              </div>

              <select
                className="context-select"
                value={targetPageId}
                onChange={(e) => setTargetPageId(e.target.value)}
                title="选择上下文范围"
              >
                <option value="auto">
                  🌐 全库笔记{currentPage ? `（默认关联：${currentPage.title || '无标题'}）` : ''}
                </option>
                {Object.values(pages).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} 限定页面：{p.title || '无标题'}
                  </option>
                ))}
              </select>
            </div>

            <textarea
              ref={inputRef}
              value={input}
              rows={items.length > 0 ? 3 : 4}
              placeholder={
                mode === 'agent'
                  ? '输入指令，例如：「帮我新建一份本周读书笔记页面」「把欢迎页的要点整理成待办清单」…'
                  : '向你的本地知识库提问，例如：「我有哪些未完成的待办？」「总结我所有的页面」…'
              }
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit(input);
                }
              }}
            />

            <div className="composer-footer">
              <span className="muted small">Enter 发送 · Shift+Enter 换行 · ⌘J 随时切换右侧边栏模式</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {running ? (
                  <button className="btn small danger" onClick={stop}>
                    ■ 停止生成
                  </button>
                ) : (
                  <button className="btn small primary" disabled={!input.trim()} onClick={() => submit(input)}>
                    发送指令 ↵
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Welcome Cards & Recent Pages (shown when conversation is empty) */}
          {items.length === 0 && (
            <>
              <div className="welcome-section">
                <div className="welcome-section-title">⚡ 快捷 Agent 任务</div>
                <div className="welcome-grid">
                  {WELCOME_CARDS.map((card) => (
                    <button
                      key={card.title}
                      className="welcome-card"
                      onClick={() => submit(card.prompt, card.mode)}
                    >
                      <div className="welcome-card-top">
                        <span className="welcome-card-icon">{card.icon}</span>
                        <span className={`welcome-card-tag ${card.mode}`}>
                          {card.mode === 'agent' ? 'Agent 编辑' : '只读问答'}
                        </span>
                      </div>
                      <div className="welcome-card-title">{card.title}</div>
                      <div className="welcome-card-desc muted">{card.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {stats.recent.length > 0 && (
                <div className="welcome-section">
                  <div className="welcome-section-title">🕒 针对最近页面执行操作</div>
                  <div className="recent-pages-list">
                    {stats.recent.map((p) => (
                      <div key={p.id} className="recent-page-row">
                        <button
                          className="recent-page-main"
                          onClick={() => useStore.getState().openPage(p.id)}
                          title="点击直接打开页面"
                        >
                          <span>{p.icon}</span>
                          <span className="recent-page-title">{p.title || '无标题'}</span>
                          <span className="muted small">{p.blocks.length} 个块</span>
                        </button>
                        <div className="recent-page-actions">
                          <button
                            className="chip"
                            onClick={() =>
                              submit(`请阅读并总结页面「${p.title || '无标题'}」(page_id: ${p.id}) 的核心要点。`, 'ask')
                            }
                          >
                            💬 总结此页
                          </button>
                          <button
                            className="chip"
                            onClick={() =>
                              submit(
                                `请阅读页面「${p.title || '无标题'}」(page_id: ${p.id})，在页面开头插入一段精炼的内容摘要。`,
                                'agent',
                              )
                            }
                          >
                            ✨ 插入摘要
                          </button>
                          <button
                            className="chip"
                            onClick={() => {
                              const s = useStore.getState();
                              s.openPage(p.id);
                              s.setAgentOpen(true);
                            }}
                          >
                            ◫ 边看边聊
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </main>
  );
}
