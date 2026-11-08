import { useStore } from '../store';
import { chat, type ChatMessage, type LLMSettings } from './llm';
import { describeCall, runTool, toolDefs, type AgentMode, type ToolContext } from './tools';

export interface ToolEvent {
  id: string;
  name: string;
  label: string;
  args: string;
  status: 'running' | 'ok' | 'error';
  output?: string;
}

/** UI-level transcript item. `api` holds the raw messages sent to the model. */
export type UIItem =
  | { kind: 'user'; id: string; text: string; mode: AgentMode }
  | { kind: 'assistant'; id: string; text: string; tools: ToolEvent[]; streaming?: boolean; error?: string; undo?: UndoInfo };

export interface UndoInfo {
  pages: Record<string, import('../types').Page | undefined>;
  undone?: boolean;
}

const MAX_STEPS = 16;

export function systemPrompt(mode: AgentMode): string {
  const s = useStore.getState();
  const cur = s.currentPageId ? s.pages[s.currentPageId] : undefined;
  return [
    '你是内置在一个本地优先块笔记应用（类似 Notion）中的 AI 助手。用户的所有笔记都由页面 (page) 组成，每个页面包含一组块 (block)。',
    `当前时间: ${new Date().toLocaleString()}。`,
    cur
      ? `用户当前打开的页面: 「${cur.title || '无标题'}」(page_id: ${cur.id})。当用户说"这个页面"、"这里"、"当前页"时，指的就是它。`
      : '用户当前没有打开任何页面。',
    mode === 'agent'
      ? [
          '当前为【Agent 模式】：你可以使用工具直接读取和编辑用户的笔记。',
          '工作方式：',
          '1. 修改页面前先用 read_page 获取最新内容和 block_id，不要猜测 id。',
          '2. 小改动用 update_block / insert_blocks / delete_blocks；大幅重写用 replace_page_content。',
          '3. 写入的内容使用 Markdown，结构清晰、简洁实用，语言与用户保持一致。',
          '4. 除非用户明确要求，不要删除页面或大段删除用户内容。',
          '5. 完成后用一两句话简要说明你做了什么，不要把写入页面的内容再完整重复一遍。',
        ].join('\n')
      : [
          '当前为【问答模式】（只读）：你可以搜索和阅读用户的笔记来回答问题，但不能修改任何内容。',
          '如果用户要求修改笔记，请先给出建议内容，并提示用户切换到 Agent 模式即可让你直接修改。',
          '回答时引用相关页面的标题。',
        ].join('\n'),
  ].join('\n\n');
}

/**
 * Run the agent loop: call the model, execute tool calls, feed results back,
 * repeat until the model answers without tools.
 */
export async function runAgent(opts: {
  settings: LLMSettings;
  mode: AgentMode;
  history: ChatMessage[];
  signal: AbortSignal;
  onText(delta: string): void;
  onTool(ev: ToolEvent): void;
  ctx: ToolContext;
  /** receives every message produced during the run (survives aborts) */
  sink: ChatMessage[];
}): Promise<ChatMessage[]> {
  const { settings, mode, signal, ctx } = opts;
  const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(mode) }, ...opts.history];
  const added = opts.sink;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (signal.aborted) break;
    const res = await chat({ settings, messages, tools: toolDefs(mode), signal, onDelta: opts.onText });
    const assistant: ChatMessage = {
      role: 'assistant',
      content: res.content || null,
      ...(res.toolCalls.length ? { tool_calls: res.toolCalls } : {}),
    };
    messages.push(assistant);
    added.push(assistant);
    if (!res.toolCalls.length) return added;
    if (res.content) opts.onText('\n\n');

    for (const call of res.toolCalls) {
      const ev: ToolEvent = {
        id: call.id,
        name: call.function.name,
        args: call.function.arguments,
        label: describeCall(call.function.name, call.function.arguments),
        status: 'running',
      };
      opts.onTool(ev);
      const out = await runTool(call.function.name, call.function.arguments, mode, ctx);
      opts.onTool({ ...ev, status: out.ok ? 'ok' : 'error', output: out.output });
      const toolMsg: ChatMessage = { role: 'tool', tool_call_id: call.id, content: out.output };
      messages.push(toolMsg);
      added.push(toolMsg);
    }
  }
  if (!signal.aborted) {
    const note: ChatMessage = { role: 'assistant', content: `（已达到单次最多 ${MAX_STEPS} 步的限制，停止执行。）` };
    added.push(note);
    opts.onText(String(note.content));
  }
  return added;
}
