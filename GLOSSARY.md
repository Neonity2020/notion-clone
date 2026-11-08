# GLOSSARY

Canonical domain vocabulary for the Notion Clone project. Use these terms consistently in issues, code, tests, and documentation.

## Core Concepts

### Page
A top-level document unit with a title, icon, parent-child hierarchy, and ordered list of blocks. Pages can be nested via `parentId`.

### Block
The atomic unit of content within a page. Each block has:
- **type**: one of `paragraph`, `h1`, `h2`, `h3`, `bullet`, `numbered`, `todo`, `quote`, `callout`, `code`, `divider`
- **content**: the block's text (Markdown for structured types, plain for paragraph)
- **id**: unique identifier (prefixed `b_`)
- **checked**: boolean, only for `todo` type

### Agent
An AI assistant integrated into the editor. Agents can:
- Read and write blocks
- Navigate the page tree
- Execute tools (defined in `agent/tools.ts`)
- Communicate via chat (persisted in `agent/chatStore.ts`)

### Store
The Zustand state container (`store.ts`) that manages:
- **pages**: `PageMap` (keyed by page ID)
- **currentPageId**: the page being viewed
- **mainView**: either `'page'` or `'agent-home'`
- **focus**: a `FocusRequest` to scroll to a specific block
- **agentOpen**: whether the AI sidebar is visible

### Editor
The block-based text editor system (`editor/`):
- **Block.tsx**: renders a single block
- **caret.ts**: manages cursor position and selection
- **context.ts**: React context for editor state

### Persist
The local storage layer (`persist.ts` + `lib/db.ts`) that:
- Hydrates the store from localStorage
- Syncs to remote (via `applyRemote`)

### Desktop
The Electron wrapper (`apps/desktop/`):
- **main.ts**: main process (window management, IPC)
- **preload.ts**: preloads and exposes APIs to the renderer

## Avoid These Terms

- ❌ "Document" → use **Page**
- ❌ "Element" → use **Block**
- ❌ "Assistant" → use **Agent**
- ❌ "State" → use **Store** (when referring to the Zustand store)
