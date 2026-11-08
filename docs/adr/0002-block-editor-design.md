# 0002. Block-Based Editor Design

- **Status**: Accepted
- **Date**: 2025-01-01
- **Deciders**: Development Team

## Context

Notion's core interaction model is a block-based editor where content is composed of discrete, typed blocks (paragraphs, headings, lists, code, etc.). We need to replicate this with:
- WYSIWYG editing
- Keyboard shortcuts
- Drag-and-drop reordering
- Inline formatting
- AI-assisted editing

## Decision

Implement a **custom block editor** using React + contentEditable:

### Block Model
- Each block is a React component (`Block.tsx`)
- Block types defined in `store.ts` (paragraph, h1-h3, bullet, numbered, todo, quote, callout, code, divider)
- Content stored as Markdown (for structured types) or plain text (paragraph)

### Editor Architecture
- **Editor.tsx**: Top-level editor container
- **Block.tsx**: Individual block renderer
- **caret.ts**: Custom caret/selection management
- **context.ts**: React context for editor state

### Key Features
- **Keyboard shortcuts**: `/` for block type menu, `Enter` for new block
- **Markdown shortcuts**: `# ` for h1, `- ` for bullet, `1. ` for numbered, etc.
- **Drag-and-drop**: Reorder blocks via HTML5 DnD API
- **Inline formatting**: Bold, italic, code, links via Markdown parsing
- **AI integration**: Agent can read/write blocks, navigate page tree

### Rationale

- **Custom editor**: Full control over UX, not tied to ProseMirror/Slate ecosystem
- **Markdown-based storage**: Simple, diff-friendly, works with LLMs
- **React components**: Easy to add new block types

### Alternatives Considered

- **ProseMirror**: Feature-rich but heavy, complex plugin system
- **Slate.js**: More React-native but less mature for complex editors
- **Quill / TinyMCE**: Not block-based, harder to customize

## Consequences

### Positive
- Flexible, easy to extend with new block types
- Markdown-friendly (good for LLM integration)
- Full control over UX

### Negative
- Must handle edge cases in contentEditable ourselves
- No built-in collaboration (CRDT) support
- Custom caret/selection logic is complex
