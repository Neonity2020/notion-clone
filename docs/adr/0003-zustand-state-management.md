# 0003. Zustand for State Management

- **Status**: Accepted
- **Date**: 2025-01-01
- **Deciders**: Development Team

## Context

The app needs to manage:
- Page tree (nested structure)
- Current view (page vs agent home)
- Block state (CRUD operations)
- AI agent chat
- UI state (focus, highlights, sidebar)

We need a state management solution that:
- Is simple and easy to understand
- Has minimal boilerplate
- Works well with React 18
- Supports time-travel debugging (nice-to-have)

## Decision

Use **Zustand** for all state management.

### Store Structure

```typescript
interface State {
  // Page operations
  pages: PageMap;
  currentPageId: string | null;
  mainView: MainView;
  
  // Block operations
  setBlocks, updateBlock, insertBlocks, deleteBlocks, moveBlock
  
  // Agent state
  agentOpen: boolean;
  agentTouched: Record<string, number>;
  
  // Actions
  createPage, movePage, deletePage, openPage, ...
}
```

### Rationale

- **Minimal API**: `create<State>()((set, get) => ({...}))`
- **No boilerplate**: No reducers, no providers
- **Selector-based subscriptions**: Avoid re-renders
- **Works with React 18**: No concurrency issues
- **Small bundle**: ~1KB gzipped

### Alternatives Considered

- **Redux**: Heavy boilerplate, learning curve
- **MobX**: Complex, requires decorators
- **React Context**: Too many re-renders for frequent updates
- **Jotai**: Good but less battle-tested for complex state

## Consequences

### Positive
- Simple, easy to maintain
- Fast performance (selector-based)
- Easy to test (pure functions)

### Negative
- No built-in time-travel (would need devtools extension)
- No built-in persistence (must implement manually)
