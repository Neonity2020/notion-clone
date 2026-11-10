# 0005. Self-Contained Electron Desktop Packaging

- Status: Accepted
- Date: 2026-11-09
- Refines: the desktop packaging portions of ADR-0001 and ADR-0004

## Context

The desktop app shipped a packaged `.app` that appeared to work only because it was
built and launched on the same machine. Two defects made the artifact unusable
elsewhere:

1. `apps/desktop/src/main.ts` resolved the preload script and the renderer entry
   through `__dirname`. Bun's bundler rewrites `__dirname` to the source folder of
   the machine that produced the bundle, so the packaged app looked for
   `<repo>/apps/desktop/dist/preload.js` and `<repo>/apps/web/dist-desktop/desktop.html`.
   On any other machine both paths are missing: the preload never loads and the
   window falls back to the "Web 构建未找到" placeholder.
2. The renderer was declared as an electron-builder `files` pattern pointing
   outside the app directory (`../web/dist-desktop/**/*`). The pattern was ignored,
   so the shipped renderer only existed inside `node_modules/@notion-clone/web`,
   which the main process never looked at. Keeping the whole web workspace as a
   production dependency of the desktop app also grew `app.asar` to 208 MB.

## Decision

The desktop app is self-contained: everything it loads at runtime lives inside the
Electron app directory.

- `apps/desktop/scripts/build-renderer.ts` builds the static renderer of
  `apps/web` and copies it to `apps/desktop/dist/renderer`. `dist/renderer` is the
  single canonical renderer location for both development and packaged builds.
- The main process resolves every path from `app.getAppPath()` — the runtime app
  root (`apps/desktop` in development, `Resources/app.asar` when packaged) — and
  never from `__dirname`. `getRendererEntry()` falls back to the in-place web build
  for development and to the legacy workspace layout for older packages.
- `apps/desktop` no longer depends on `@notion-clone/web`. The renderer is static
  output, so the workspace dependency only inflated the package. `app.asar` drops
  from 208 MB to under 1 MB.
- The renderer entry declares a Content-Security-Policy that allows only
  same-origin scripts, inline styles and `https:`/`wss:` connections for the Agent
  provider calls.

## Consequences

- A packaged `.app` runs on a machine without the repository; the renderer,
  preload script and the `better-sqlite3` native module are all inside the bundle.
- The web workspace and the desktop app share the renderer through a build step
  instead of a runtime dependency, so a renderer change requires
  `bun run build:renderer` before the desktop app picks it up. `bun run build`
  and `bun run package:desktop` already do this.
- `bun run dev:desktop` rebuilds the renderer before starting Electron, so the
  development loop stays a single command.
