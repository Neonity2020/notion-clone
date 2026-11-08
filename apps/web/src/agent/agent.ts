import { useStore } from '../store';
import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core';
import { createPiStreamFn, makeAssistantMessage, type ChatMessage, type LLMSettings } from './llm';
import { createPiTools, describeCall, type AgentMode, type ToolContext } from './tools';

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
 * Run the agent using Pi-SDK (@earendil-works/pi-agent-core) as the agent runtime.
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

  // 1. Convert history to Pi-SDK initial messages
  const initialMessages: AgentMessage[] = [];
  for (const m of opts.history) {
    if (m.role === 'user') {
      initialMessages.push({
        role: 'user',
        content: [{ type: 'text', text: m.content }],
        timestamp: Date.now(),
      });
    } else if (m.role === 'assistant') {
      const content: any[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {}
          content.push({
            type: 'toolCall',
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        }
      }
      initialMessages.push(
        makeAssistantMessage(
          content,
          m.tool_calls?.length ? 'toolUse' : 'stop',
          settings.model,
        ),
      );
    } else if (m.role === 'tool') {
      initialMessages.push({
        role: 'toolResult',
        toolCallId: m.tool_call_id,
        toolName: '',
        content: [{ type: 'text', text: m.content }],
        isError: false,
        timestamp: Date.now(),
      });
    }
  }

  // 2. Build Pi-SDK tools and streamFn
  const piTools = createPiTools(mode, ctx);
  const streamFn = createPiStreamFn(settings, signal);

  // 3. Instantiate the Pi-SDK Agent runtime
  const agent = new Agent({
    streamFn,
    initialState: {
      systemPrompt: systemPrompt(mode),
      model: { id: settings.model, provider: 'custom', api: 'chat' } as any,
      tools: piTools,
      messages: initialMessages,
    },
  });

  // Track active tool calls and text deltas emitted by the Pi-SDK runtime
  agent.subscribe((event) => {
    if (event.type === 'message_update') {
      if (event.assistantMessageEvent.type === 'text_delta') {
        opts.onText(event.assistantMessageEvent.delta);
      }
    } else if (event.type === 'tool_execution_start') {
      const argsStr = JSON.stringify(event.args ?? {});
      opts.onTool({
        id: event.toolCallId,
        name: event.toolName,
        args: argsStr,
        label: describeCall(event.toolName, argsStr),
        status: 'running',
      });
    } else if (event.type === 'tool_execution_end') {
      const resultText =
        Array.isArray(event.result?.content)
          ? event.result.content.map((c: any) => c.text || '').join('')
          : typeof event.result === 'string'
            ? event.result
            : JSON.stringify(event.result ?? '');
      opts.onTool({
        id: event.toolCallId,
        name: event.toolName,
        args: '',
        label: describeCall(event.toolName, ''),
        status: event.isError ? 'error' : 'ok',
        output: resultText,
      });
    }
  });

  const onAbort = () => {
    agent.abort();
  };
  signal.addEventListener('abort', onAbort);

  try {
    await agent.continue();
  } finally {
    signal.removeEventListener('abort', onAbort);
  }

  // 4. Extract new messages produced by Pi Agent during this run and append to sink
  const newMessages = agent.state.messages.slice(1 + initialMessages.length);
  for (const m of newMessages as any[]) {
    if (m.role === 'assistant') {
      const text = (m.content || [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text || '')
        .join('');
      const toolCalls = (m.content || [])
        .filter((c: any) => c.type === 'toolCall')
        .map((c: any) => ({
          id: c.id,
          type: 'function' as const,
          function: {
            name: c.name,
            arguments: typeof c.arguments === 'string' ? c.arguments : JSON.stringify(c.arguments ?? {}),
          },
        }));
      opts.sink.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else if (m.role === 'toolResult') {
      const text = Array.isArray(m.content)
        ? m.content.map((c: any) => c.text || '').join('')
        : String(m.content ?? '');
      opts.sink.push({
        role: 'tool',
        tool_call_id: m.toolCallId,
        content: text,
      });
    }
  }

  return opts.sink;
}
