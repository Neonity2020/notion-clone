# Notion Clone

A block editor with an AI agent, built as a Bun monorepo.

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | TanStack Start, React 19, shadcn/ui, Tailwind 4, Clerk; Cloudflare Workers |
| `apps/desktop` | Electron with local SQLite storage |
| `packages/shared` | Shared Page and Block types |
| `packages/db` | Drizzle SQLite schema, Cloudflare D1 binding and versioned migrations |

The existing block editor, nested pages, import/export and AI tools are retained.
The Web app renders a skeleton before browser JavaScript starts, while authentication
loads, and while the editor and notes load. Loading failures can be retried.

## Local development

Use Bun 1.3.14 and Node 22.12+ (Node 24 recommended).

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
```

Configure Clerk development keys in the local file. D1 uses a local SQLite database
for development and the Wrangler binding for deployment. Never prefix a secret key
with `VITE_`. For an already linked Clerk application, `clerk env pull`
from `apps/web` restores development keys without creating a replacement app.

```sh
bun run db:migrate
bun run dev
```

Web runs at `http://localhost:5173`. Sign in or sign up using Clerk. All note reads
and mutations require the signed-in owner. The initial empty workspace gets example
pages. Chat history and AI provider settings remain browser-local, per account.

```sh
bun run dev:desktop     # Static renderer + Electron; no cloud credentials needed
bun run test           # Vitest, including ownership and persistence regressions
bun run typecheck
bun run build          # Workers + static renderer + Electron main/preload
bun run package:desktop
bun run db:generate    # After changing the Drizzle schema; review generated SQL
```

## Cloudflare deployment

This is a Workers deployment, not a static Pages deployment. The checked-in Wrangler
configuration and official Cloudflare Vite plugin build the server and client assets.

1. The `notion-clone` D1 database is bound as `DB` in `apps/web/wrangler.jsonc`.
   For another Cloudflare account, create a D1 database and update the account/database IDs.
2. Run `bun run db:migrate:remote` to apply reviewed SQL migrations to the remote D1
   database. `bun run db:migrate` only changes the local development database.
3. From `apps/web`, authenticate with `bunx wrangler login`. Configure
   `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` as Worker secrets. The public
   key must also be present in the build environment. For a new Worker, deploy once
   before `bunx wrangler secret put <name>`, or allow Wrangler to create the Worker.
4. From the repository root, run `bun run deploy`.
5. Verify sign-in, create/edit/reload a Page, and confirm another user cannot read it.

The current preview is https://notion-clone.orange-office.workers.dev, using the
existing Clerk development instance, as requested. Production login requires a
custom domain and production Clerk configuration; replace both keys and rebuild
when promoting the preview.

Use `bunx wrangler deploy --dry-run` from `apps/web` after building to verify packaging
without publishing. Do not deploy development Clerk credentials as production.

## Existing local notes

The local renderer still opens the existing SQLite/IndexedDB store. Export its JSON
backup, sign into the intended Web account, and import there. Import replaces that
account's current workspace, so export a backup first. No existing local data is
uploaded automatically. Desktop and Web do not automatically synchronize.

Web writes retry on transient failures and show an error while unsaved. Keep the
page open until the error clears. Simultaneous edits from multiple devices are
last-write-wins; there is no CRDT collaboration in this migration.

## Architecture

Read [GLOSSARY.md](GLOSSARY.md), [ADR-0004](docs/adr/0004-tanstack-start-cloudflare.md)
and [AGENTS.md](AGENTS.md). Server database access belongs in `src/server`; keep
secrets out of client code. `apps/web/desktop.html` is the separate Electron entry.

## License

MIT
