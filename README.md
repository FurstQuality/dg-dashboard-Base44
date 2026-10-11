# Disc-Golf-Dashboard

DG Dashboard provides disc golf course maps and editing, events, scoring, player statistics, and administration. This codebase is being migrated to the dedicated `FurstQuality/Disc-Golf-Dashboard` repository and Supabase project `aosklgewcakrhuxdynik`.

The current app still uses the original database while its data is preserved and migration is prepared. The destination project has been verified but has no app data yet. Follow [the migration and connection guide](docs/independent-connections.md) before changing runtime database settings.

## Development

Install Node.js and npm, clone this repository, then install the locked dependencies:

```sh
git clone https://github.com/FurstQuality/Disc-Golf-Dashboard.git
cd Disc-Golf-Dashboard
npm ci
```

Copy `.env.example` to `.env` and configure the server and browser values for the same populated Supabase project. Keep service-role keys and provider tokens server-only. Start the local preview with:

```sh
npm run dev -- --host 127.0.0.1 --port 5180
```

Configure direct GitHub and Supabase management access in **Admin → Platform operations → Connections**. Saving a connection verifies provider access; it does not copy data, change the app database, or deploy the app. Google sign-in requires the Google provider and callback URLs configured in Supabase Auth.

The full application is also imported into [DG Dashboard in Mike’s Base44 workspace](https://app.base44.com/apps/6ac96e8c9295eff8becd8869/editor/preview). Follow the [Base44 and Codex workflow](docs/base44-codex-workflow.md) for branch-based development, conflict checks, guarded source transfers and explicit publishing. Use `npm run base44:status -- --branch main` before transferring changes; the complete release review is `npm run release:check`.

## Validation

```sh
npm test
npx tsc --noEmit
npm run build
```

## Data and preview safety

- Keep existing database IDs, Auth identities, course layouts and event snapshots intact during migration. Local SQL migrations are not a data backup. Do not run `drizzle-kit push`; the current Drizzle schema is empty.
- An isolated app preview uses `.env.sandbox.example` and `npm run sandbox`. It requires a separate Supabase project; a code preview alone does not isolate database writes.
- Local secrets, connection vaults and migration backups are ignored by Git. Hosted connection settings require persistent private storage and an encryption key configured by the host.
- The project originated in Lovable. Some AI, Calendar, messaging and build dependencies still use Lovable and need separate replacement; see the migration guide for the remaining work.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
