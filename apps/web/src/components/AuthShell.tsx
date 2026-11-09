import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-logo">
            <svg viewBox="0 0 28 28" aria-hidden="true">
              <rect width="28" height="28" rx="7" fill="var(--accent)" />
              <rect x="6" y="7" width="16" height="3.5" rx="1.75" fill="#fff" opacity=".95" />
              <rect x="6" y="13" width="12" height="3.5" rx="1.75" fill="#fff" opacity=".65" />
              <rect x="6" y="19" width="8" height="3.5" rx="1.75" fill="#fff" opacity=".4" />
            </svg>
            <span>块笔记</span>
          </div>
          <p className="auth-tagline">像搭积木一样组织想法 —— 文档、知识库与 AI 协作，都在一块块之间。</p>
          <ul className="auth-points">
            <li><span className="glyph">✓</span>块级编辑：拖拽排序、无限嵌套、Markdown 快捷输入</li>
            <li><span className="glyph">✓</span>Wiki 双链：[[引用]] 打通页面间的知识网络</li>
            <li><span className="glyph">✓</span>AI 协作：Agent 直接读写页面、替你动手改稿</li>
          </ul>
          <div className="auth-demo" aria-hidden="true">
            <div className="auth-demo-title">产品需求 · Roadmap</div>
            <div className="auth-demo-line w-80" />
            <div className="auth-demo-line w-65" />
            <div className="auth-demo-todo"><span className="tick">✓</span><div className="auth-demo-line w-50" /></div>
            <div className="auth-demo-callout"><span className="spark">✦</span>Agent 已完成 3 处修改，剩余 1 项待确认</div>
          </div>
        </div>
      </aside>
      <section className="auth-panel">{children}</section>
    </main>
  );
}
