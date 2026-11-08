# 0001. Use Bun Monorepo with Vite + Electron

- **Status**: Accepted
- **Date**: 2025-01-01
- **Deciders**: Development Team

## Context

We need to build a Notion-like web app that also works as a desktop application. The codebase should:
- Share most code between web and desktop
- Support rapid development (hot reload, fast builds)
- Be easy to package for macOS, Windows, and Linux
- Avoid heavy build tooling

## Decision

Use **Bun** as the package manager and runtime for a **monorepo** with two workspaces:
- `apps/web`: Vite + React web app
- `apps/desktop`: Electron wrapper that loads the web build

### Rationale

- **Bun**: Fast install/build, native TypeScript support, workspace support
- **Vite**: Modern dev server with HMR, optimized builds
- **Electron**: Mature cross-platform desktop framework
- **Monorepo**: Single source of truth, shared dependencies, atomic changes

### Alternatives Considered

- **Yarn Workspaces**: Slower, no native TS support
- **npm workspaces**: No Bun speed advantage
- **CRA / Create React App**: Legacy, slower builds
- **Tauri**: Lighter but less mature for complex Electron patterns

## Consequences

### Positive
- Fast dev loop (Bun + Vite)
- Cross-platform support out of the box
- Shared code between web and desktop

### Negative
- Larger bundle size (Electron)
- Must maintain both web and desktop builds
- Dependency on Electron's native module ecosystem
