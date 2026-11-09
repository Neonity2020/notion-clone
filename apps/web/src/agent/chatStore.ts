import { storageKey } from '../lib/storage-scope';
import { create } from 'zustand';
import { useStore } from '../store';
import { isConfigured, loadSettings, type ChatMessage } from './llm';
import { runAgent, type ToolEvent, type UIItem } from './agent';
import type { AgentMode, ToolContext } from './tools';
import { uid } from '../lib/id';
import type { PageMap } from '../types';

const CHAT_KEY = 'nc:chat';
const MODE_KEY = 'nc:agentMode';

interface Saved {
  items: UIItem[];
  history: ChatMessage[];
}

function loadChat(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(CHAT_KEY)) || 'null');
    if (s && Array.isArray(s.items)) return s;
  } catch {}
  return { items: [], history: [] };
}

function persistChat(items: UIItem[], history: ChatMessage[]) {
  const clean = items.map((it) => (it.kind === 'assistant' ? { ...it, undo: undefined, streaming: false } : it));
  try {
    localStorage.setItem(storageKey(CHAT_KEY), JSON.stringify({ items: clean.slice(-100), history: history.slice(-200) }));
  } catch {}
}

/** Drop a trailing assistant tool_call message that never got all its tool results (e.g. after abort). */
function sanitize(history: ChatMessage[]): ChatMessage[] {
  const out = [...history];
  for (let i = out.length - 1; i >= 0; i--) {
    const m = out[i];
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const ids = new Set(out.slice(i + 1).filter((x) => x.role === 'tool').map((x) => (x as { tool_call_id: string }).tool_call_id));
      if (!m.tool_calls.every((c) => ids.has(c.id))) return out.slice(0, i);
      break;
    }
  }
  return out;
}

interface ChatState {
  items: UIItem[];
  history: ChatMessage[];
  mode: AgentMode;
  running: boolean;
  showSettings: boolean;
  abortCtrl: AbortController | null;
  setMode(mode: AgentMode): void;
  setShowSettings(show: boolean): void;
  send(text: string): Promise<void>;
  stop(): void;
  undo(id: string): void;
  clear(): void;
}

const initial = loadChat();

export const useChatStore = create<ChatState>()((set, get) => {
  const patchAssistant = (id: string, fn: (it: Extract<UIItem, { kind: 'assistant' }>) => Extract<UIItem, { kind: 'assistant' }>) =>
    set((s) => {
      const items = s.items.map((it) => (it.id === id && it.kind === 'assistant' ? fn(it) : it));
      persistChat(items, s.history);
      return { items };
    });

  return {
    items: initial.items,
    history: initial.history,
    mode: ((typeof localStorage !== 'undefined' && localStorage.getItem(storageKey(MODE_KEY))) as AgentMode) || 'agent',
    running: false,
    showSettings: false,
    abortCtrl: null,

    setMode(mode) {
      try {
        localStorage.setItem(storageKey(MODE_KEY), mode);
      } catch {}
      set({ mode });
    },

    setShowSettings(showSettings) {
      set({ showSettings });
    },

    async send(rawText) {
      const text = rawText.trim();
      const { running, mode, history: prevHistory } = get();
      if (!text || running) return;
      const settings = loadSettings();
      if (!isConfigured(settings)) {
        set({ showSettings: true });
        return;
      }

      const userMsg: ChatMessage = { role: 'user', content: text };
      const aid = uid('a_');
      const history = sanitize([...prevHistory, userMsg]);
      const ctrl = new AbortController();
      const sessionKey = storageKey(CHAT_KEY);

      set((s) => {
        const items: UIItem[] = [
          ...s.items,
          { kind: 'user', id: uid('u_'), text, mode },
          { kind: 'assistant', id: aid, text: '', tools: [], streaming: true },
        ];
        persistChat(items, history);
        return { items, history, running: true, abortCtrl: ctrl };
      });

      const before: PageMap = useStore.getState().pages;
      const ctx: ToolContext = { touchedPages: new Set() };
      const sink: ChatMessage[] = [];
      let error: string | undefined;

      try {
        await runAgent({
          settings,
          mode,
          history,
          signal: ctrl.signal,
          sink,
          ctx,
          onText: (d) => patchAssistant(aid, (it) => ({ ...it, text: it.text + d })),
          onTool: (ev: ToolEvent) =>
            patchAssistant(aid, (it) => {
              const i = it.tools.findIndex((t) => t.id === ev.id);
              const tools = [...it.tools];
              if (i >= 0) tools[i] = ev;
              else tools.push(ev);
              return { ...it, tools };
            }),
        });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') error = (e as Error).message;
      } finally {
        if (sessionKey !== storageKey(CHAT_KEY)) return;
        const undoPages: Record<string, PageMap[string] | undefined> = {};
        ctx.touchedPages.forEach((id) => (undoPages[id] = before[id]));
        const nextHistory = sanitize([...history, ...sink]);
        set((s) => {
          const items = s.items.map((it) =>
            it.id === aid && it.kind === 'assistant'
              ? {
                  ...it,
                  streaming: false,
                  error,
                  text: ctrl.signal.aborted && !it.text ? '（已停止）' : it.text,
                  undo: ctx.touchedPages.size ? { pages: undoPages } : undefined,
                }
              : it,
          );
          persistChat(items, nextHistory);
          return { items, history: nextHistory, running: false, abortCtrl: null };
        });
      }
    },

    stop() {
      get().abortCtrl?.abort();
    },

    undo(id) {
      const item = get().items.find((x) => x.id === id);
      if (!item || item.kind !== 'assistant' || !item.undo || item.undo.undone) return;
      const pages = { ...useStore.getState().pages };
      for (const [pid, page] of Object.entries(item.undo.pages)) {
        if (page) pages[pid] = page;
        else delete pages[pid];
      }
      useStore.getState().replaceAll(pages);
      set((s) => {
        const items = s.items.map((it) => (it.id === id && it.kind === 'assistant' ? { ...it, undo: { ...it.undo!, undone: true } } : it));
        const history: ChatMessage[] = [
          ...s.history,
          { role: 'user', content: '（系统提示：用户撤销了你上一次对笔记所做的全部修改。）' },
          { role: 'assistant', content: '好的，修改已撤销。' },
        ];
        persistChat(items, history);
        return { items, history };
      });
    },

    clear() {
      if (get().running) get().abortCtrl?.abort();
      persistChat([], []);
      set({ items: [], history: [] });
    },
  };
});

export function prettyJSON(s: string) {
  try {
    return JSON.stringify(JSON.parse(s || '{}'), null, 2);
  } catch {
    return s;
  }
}

export function resetChatScope() {
  useChatStore.getState().stop();
  useChatStore.setState({ ...loadChat(), running: false, abortCtrl: null, showSettings: false, mode: 'agent' });
}
