# Notion Clone

A block-based document editor with AI agent integration, built with React, TypeScript, and Electron.

## Features

- **Block-based editing**: WYSIWYG editor with 11 block types (paragraph, headings, lists, todos, quotes, code, etc.)
- **Page hierarchy**: Nested pages with parent-child relationships
- **AI Agent**: Integrated LLM assistant that can read/write documents
- **Cross-platform**: Works in browser (Vite) and desktop (Electron)
- **Local persistence**: localStorage + remote sync support

## Project Structure

```
notion-clone/
├── apps/
│   ├── web/          # Vite + React web application
│   │   └── src/
│   │       ├── agent/          # AI agent (chat, tools, LLM)
│   │       ├── components/     # Reusable UI components
│   │       ├── editor/         # Block-based editor
│   │       ├── lib/            # Utilities (DB, ID, Markdown)
│   │       ├── store.ts        # Zustand state management
│   │       ├── types.ts        # TypeScript types
│   │       └── ...
│   └── desktop/      # Electron wrapper
│       └── src/
│           ├── main.ts         # Main process
│           └── preload.ts      # Preload script
├── docs/
│   ├── adr/          # Architecture Decision Records
│   └── agents/       # Agent configuration
├── GLOSSARY.md       # Domain vocabulary
├── AGENTS.md         # AI agent configuration
└── package.json      # Bun monorepo workspace
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) 1.0+
- Node.js 22+ (for Electron)

### Installation

```bash
# Install dependencies
bun install

# Start web dev server
bun run dev

# Start desktop app (with web build)
bun run dev:desktop
```

### Building

```bash
# Build web + desktop
bun run build

# Package desktop app (Electron Builder)
bun run package:desktop
```

### Testing

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## Documentation

- **[GLOSSARY.md](./GLOSSARY.md)**: Domain vocabulary and terminology
- **[AGENTS.md](./AGENTS.md)**: AI agent configuration
- **[docs/adr/](./docs/adr/)**: Architecture decisions
  - [0001: Monorepo Architecture](./docs/adr/0001-monorepo-architecture.md)
  - [0002: Block Editor Design](./docs/adr/0002-block-editor-design.md)
  - [0003: Zustand State Management](./docs/adr/0003-zustand-state-management.md)
- **[docs/agents/](./docs/agents/)**: Agent configuration files

## Development

### Adding a New Block Type

1. Add the type to `BlockType` in `types.ts`
2. Add a rendering component in `editor/Block.tsx`
3. Add to `BLOCK_TYPES` array in `store.ts`
4. Update Markdown parsing in `lib/markdown.ts`

### AI Agent Tools

The agent system is in `apps/web/src/agent/`:
- `tools.ts`: Tool definitions (page read/write, block operations)
- `agent.ts`: Agent orchestration
- `llm.ts`: LLM provider integration
- `chatStore.ts`: Chat state management

### State Management

All state is managed by the Zustand store in `store.ts`:
- **Pages**: CRUD operations, hierarchy
- **Blocks**: Insert, update, delete, move
- **UI**: Focus requests, agent visibility

## License

MIT
