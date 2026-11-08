import type { Page } from './types';
import { uid } from './lib/id';
import { markdownToBlocks } from './lib/markdown';

export function seedPages(): Page[] {
  const t = Date.now();
  const welcomeId = uid('p_');
  const mk = (title: string, icon: string, md: string, parentId: string | null, order: number, id = uid('p_')): Page => ({
    id,
    title,
    icon,
    parentId,
    order,
    blocks: markdownToBlocks(md),
    createdAt: t,
    updatedAt: t,
  });
  return [
    mk(
      '欢迎使用',
      '👋',
      `这是一个**本地优先**的块笔记应用：所有数据都保存在浏览器的 IndexedDB 中，无需服务器，断网也能用。

## 基本操作
- 输入 / 打开块菜单，选择块类型
- 使用 Markdown 快捷方式：# 标题、- 列表、[] 待办、> 引用、\`\`\` 代码、--- 分割线
- Tab / Shift+Tab 调整列表缩进
- 拖动块左侧的 ⋮⋮ 手柄重新排序
- 在侧边栏中悬停页面可以新建子页面

## Agent 模式（双形态）
- **右侧边栏模式**：在页面中按 \`⌘/Ctrl + J\` 或点击右上角「✨ AI 侧边栏」，边看笔记边让 Agent 协作编辑
- **AI Agent 欢迎页**：点击左侧边栏顶部的「✨ AI Agent」进入全屏工作台，支持全局知识库洞察、快捷任务卡片与指定页面上下文
- 「问答」模式只读：搜索、阅读你的所有页面
- 「Agent」模式可直接读写：插入/修改/删除块，创建和整理页面，所有修改均可**一键撤销**
- 选中任意段落文字，还会浮出 AI 快捷操作栏（润色、精简、扩写、总结、翻译…）
> [!NOTE] 首次使用请点击 ⚙️ 配置 OpenAI 兼容接口（OpenAI / DeepSeek / Ollama 等）。

## 试一试
- [ ] 新建一个页面
- [ ] 让 Agent 帮你写一份周计划
- [x] 打开这个应用`,
      null,
      1,
      welcomeId,
    ),
    mk(
      '快速笔记',
      '🗒️',
      `随手记点什么吧。`,
      welcomeId,
      1,
    ),
  ];
}
