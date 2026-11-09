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
│   ├── web/          # TanStack Start + React web app
│   └── desktop/     # Electron desktop wrapper
├── docs/
│   ├── agents/       # Agent configuration
│   └── adr/          # Architecture Decision Records
└── GLOSSARY.md       # Domain vocabulary
```

### Key Technologies

- **Bun**: Package manager + runtime
- **React 19 + TypeScript**: UI framework
- **Zustand**: State management
- **Electron 45**: Desktop wrapper
- **Vite 8**: Web build tool

### Important Files

- `GLOSSARY.md`: Domain vocabulary (read this first)
- `docs/adr/`: Architecture decisions
- `apps/web/src/store.ts`: Zustand store (core state)
- `apps/web/src/editor/`: Block editor system
- `apps/web/src/agent/`: AI agent integration

### Web platform

- TanStack Start + shadcn/ui + Tailwind 4 in `apps/web`.
- Clerk authentication; Drizzle + Cloudflare D1 in `packages/db`; shared types in `packages/shared`.
- Cloudflare Workers deployment. Read ADR-0004 for server boundaries and desktop compatibility.
- Run `bun run test`, `bun run typecheck`, and `bun run build` after architectural changes.
