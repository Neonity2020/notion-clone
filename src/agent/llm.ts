/** Minimal OpenAI-compatible chat-completions client with streaming + tool calls. */

export interface LLMSettings {
  baseURL: string;
  apiKey: string;
  model: string;
}

const KEY = 'nc:llm';

export const PRESETS: { name: string; baseURL: string; model: string }[] = [
  { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'DeepSeek', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'Ollama (本地)', baseURL: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
  { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
];

export function loadSettings(): LLMSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.baseURL) return s;
  } catch {}
  return { baseURL: PRESETS[0].baseURL, apiKey: '', model: PRESETS[0].model };
}

export function saveSettings(s: LLMSettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function isConfigured(s: LLMSettings) {
  return !!s.baseURL && !!s.model && (!!s.apiKey || /localhost|127\.0\.0\.1/.test(s.baseURL));
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export async function chat(opts: {
  settings: LLMSettings;
  messages: ChatMessage[];
  tools?: ToolDef[];
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
  temperature?: number;
}): Promise<ChatResult> {
  const { settings, messages, tools, signal, onDelta } = opts;
  const url = settings.baseURL.replace(/\/+$/, '') + '/chat/completions';
  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: true,
    temperature: opts.temperature ?? 0.4,
  };
  if (tools && tools.length) body.tools = tools;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(`无法连接到 ${url}：${(e as Error).message}。请检查地址、网络或 CORS 设置（Ollama 需设置 OLLAMA_ORIGINS=*）。`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`LLM 请求失败 (${res.status})：${txt.slice(0, 500)}`);
  }

  const ctype = res.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream') || !res.body) {
    // non-streaming fallback
    const json = await res.json();
    const msg = json.choices?.[0]?.message ?? {};
    const content = msg.content ?? '';
    if (content) onDelta?.(content);
    return { content, toolCalls: msg.tool_calls ?? [] };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  const calls: ToolCall[] = [];

  const handle = (data: string) => {
    if (data === '[DONE]') return;
    let json: any;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    const delta = json.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) {
      content += delta.content;
      onDelta?.(delta.content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const i = tc.index ?? calls.length;
      if (!calls[i]) calls[i] = { id: tc.id ?? `call_${i}`, type: 'function', function: { name: '', arguments: '' } };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].function.name += tc.function.name;
      if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) handle(line.slice(5).trim());
    }
  }
  if (buf.trim().startsWith('data:')) handle(buf.trim().slice(5).trim());

  return { content, toolCalls: calls.filter(Boolean) };
}
