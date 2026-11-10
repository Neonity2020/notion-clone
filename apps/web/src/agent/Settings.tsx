import { useState } from 'react';
import { PRESETS, chat, loadSettings, saveSettings, type LLMSettings } from './llm';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const [s, setS] = useState<LLMSettings>(loadSettings);
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'error'; msg?: string }>({ state: 'idle' });
  const [saveError, setSaveError] = useState(false);

  const runTest = async () => {
    setTest({ state: 'running' });
    try {
      const r = await chat({ settings: s, messages: [{ role: 'user', content: '回复"OK"两个字母即可。' }] });
      setTest({ state: 'ok', msg: `连接成功：${r.content.slice(0, 60)}` });
    } catch (e) {
      setTest({ state: 'error', msg: (e as Error).message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>AI 设置</h3>
        <p className="muted">使用任意 OpenAI 兼容的 Chat Completions 接口（需支持 function calling）。配置仅保存在本机浏览器。</p>
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button key={p.name} className="chip" onClick={() => setS({ ...s, baseURL: p.baseURL, model: p.model })}>
              {p.name}
            </button>
          ))}
        </div>
        <label>
          Base URL
          <input value={s.baseURL} onChange={(e) => setS({ ...s, baseURL: e.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          API Key
          <input type="password" value={s.apiKey} onChange={(e) => setS({ ...s, apiKey: e.target.value })} placeholder="sk-...（本地 Ollama 可留空）" />
        </label>
        <label>
          模型
          <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} placeholder="gpt-4o-mini" />
        </label>
        {test.state !== 'idle' && (
          <div className={`test-result ${test.state}`}>{test.state === 'running' ? '测试中…' : test.msg}</div>
        )}
        {saveError && <div className="test-result error" role="alert">保存失败，请检查浏览器是否允许本地存储后重试。</div>}
        <div className="modal-actions">
          <button className="btn" onClick={runTest} disabled={test.state === 'running'}>
            测试连接
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            onClick={() => {
              try {
                saveSettings(s);
                onClose();
              } catch {
                setSaveError(true);
              }
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
