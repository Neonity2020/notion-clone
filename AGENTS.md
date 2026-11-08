# Agent Configuration

This repository is configured for AI agent-driven development.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues. Use the `gh` CLI for all operations. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout: `GLOSSARY.md` at the root + `docs/adr/` for architecture decisions. See `docs/agents/domain.md`.

## Project Overview

**Notion Clone** - A block-based document editor with AI agent integration.

### Monorepo Structure

```
notion-clone/
├── apps/
│   ├── web/          # Vite + React web app
│   └── desktop/     # Electron desktop wrapper
├── docs/
│   ├── agents/       # Agent configuration
│   └── adr/          # Architecture Decision Records
└── GLOSSARY.md       # Domain vocabulary
```

### Key Technologies

- **Bun**: Package manager + runtime
- **React 18 + TypeScript**: UI framework
- **Zustand**: State management
- **Electron 33**: Desktop wrapper
- **Vite 5**: Web build tool

### Important Files

- `GLOSSARY.md`: Domain vocabulary (read this first)
- `docs/adr/`: Architecture decisions
- `apps/web/src/store.ts`: Zustand store (core state)
- `apps/web/src/editor/`: Block editor system
- `apps/web/src/agent/`: AI agent integration
