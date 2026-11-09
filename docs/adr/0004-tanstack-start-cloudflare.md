# 0004. TanStack Start Web on Cloudflare Workers

- Status: Accepted
- Date: 2026-11-09
- Supersedes: the Web build and persistence portions of ADR-0001

## Decision

Keep Bun workspaces and Electron. Migrate `apps/web` to TanStack Start, React 19,
Vite 8, Tailwind 4 and shadcn/ui. Use the official Cloudflare Vite adapter for SSR
and server functions on Workers. Keep a separate static renderer build for
Electron; it continues to use its SQLite IPC adapter.

`packages/shared` owns Page and Block types. `packages/db` owns the Drizzle schema,
Cloudflare D1 driver and SQL migrations. Web server functions authenticate with Clerk,
validate inputs and constrain every query to the authenticated user. The database
primary key is `(owner_id, id)` so two accounts can import identical Page IDs safely.
Owner identity sent by a client is checked against Clerk, never trusted as authority.
CSRF middleware covers server functions. D1 bindings and secret keys stay server-side.

The existing editor stays client-side. SSR sends an accessible workspace skeleton;
Clerk loading, lazy editor loading and initial database reads retain that placeholder.
Reduced-motion preferences disable the pulse. Data loading failures offer retry;
failed saves keep dirty data and retry. Writes are serialized to prevent local
out-of-order saves.

Cross-device edits use per-Page optimistic concurrency, not collaborative CRDT
editing. Each row has a `revision`; the client sends the revision it last read and
the server only writes or deletes when the stored revision still matches (a single
conditional upsert with `RETURNING`). On conflict the stored Page wins in place and
the local version is kept as a new "（冲突副本）" Page, so no edit is silently lost.
Deleting a Page that another device edited restores the edited Page. Editing a Page
another device deleted recreates it.

A serialized Page is capped at 1.8 MB (`MAX_PAGE_BYTES`) to stay under D1's 2 MB
row limit. The client skips oversized Pages without retry loops and tells the user;
the server rejects them as a second line of defense. Cross-tab updates fetch only
the changed Pages (`getPages`).

## Data migration and limits

Existing local data is not silently uploaded or associated with a new account.
Export JSON from the local renderer, then import it into the desired signed-in Web
account. Import replaces the current workspace using the existing import UI.
Web notes live in D1; desktop notes remain local. Chat history and model settings
remain on the browser, scoped by Clerk user ID; they are not synchronized to D1.

Production rollout requires a D1 database, migration, production Clerk instance
and Cloudflare secrets. Development Clerk credentials are not production credentials.
