# App sandbox and explicit publishing

## Current status — October 9, 2026

The user selected Base44's own preview and Publish workflow and cancelled the separate local-preview setup. Do not provision another preview database or make the local sandbox a prerequisite for this migration. The existing `/admin/sandbox` implementation is preserved as an optional tool; it is not the selected deployment workflow. Reading, saving or checking local connection settings still requires the server to verify the caller's super-admin role.

The user authorized a fresh Base44 app using the existing DG Dashboard source. The new [app dashboard](https://app.base44.com/apps/6ac96e8c9295eff8becd8869/editor/preview) belongs in **Mike's Workspace** (`69f19bca9bb88d5af75fba89`), whose `elite_yearly` membership was verified through the freshly authenticated CLI. Base44 initially created it in the separate DG Dashboard – Powered by SmartCaddy workspace (`6a235274ef69a7f2246a32ba`), causing `PREMIUM_REQUIRED`. Moving the new app to Mike's Workspace resolved sandbox access. No additional subscription is required. The old app ID `6ac9557772bd04647013b3d2` and its public URL are no longer the migration target.

The new app's onboarding README and scaffold were inspected. The MCP connection remains scoped to the old workspace; the user authenticated the official CLI against the owning account, and its sandbox file access works. A clean restore point was saved before importing source: checkpoint `6ac970b08f35db7896cafe1d`, commit `f39b7a7e232984afbb37ea0e638882c81a22f28b`. Use `base44 sandbox` commands with the explicit new app ID; do not run a separate CLI deployment or publish unverified changes.

Port 5180 remains the existing app using its current source database; it is not disposable test data. The optional local preview's isolation checks remain intact. Base44 backend resource changes can sync immediately, so frontend Publish and database migration are separate operations.

## Optional local draft tooling — not required for the selected Base44 workflow

1. Copy `.env.sandbox.example` to `.env.sandbox.local`.
2. Configure a separate Supabase project with matching browser/server URLs and publishable keys. Configure sandbox Auth redirects including `http://127.0.0.1:5190/auth-callback`. Preserve source data and use reviewed migrations and a sanitized test dataset; never overwrite production with sandbox records.
3. Run `npm run sandbox`. This launches the same complete app, including server functions, on loopback port 5190 with hot reload.
4. In `/admin/sandbox`, save the draft app URL and the separate draft/live Supabase URLs, then choose **Check connection**. These URLs describe existing environments; the form does not provision a database or change runtime credentials.
5. Navigate and test the app in the preview. **Open full app** follows the currently viewed route and is useful for OAuth, camera/GPS permissions or providers that prohibit embedding.
6. Run `npm run release:check` when ready to review a version. This performs the test suite, sandbox tests, TypeScript and a production build. A SHA-256 source fingerprint becomes stale when code changes. The report contains no credentials and does not publish anything.

The launcher compares the draft target with known source/production URLs from `.env`, inherited runtime settings and `DGD_PRODUCTION_SUPABASE_URL`. Missing or matching production targets, mismatched browser/server URLs or keys, live Stripe keys and privileged browser keys are rejected. Only operating-system essentials inherit; provider keys must be explicitly configured for the draft. GitHub, Supabase management, Base44, migration and live connection-vault settings are stripped. The draft uses its own encrypted vault inside `.sandbox/`.

Vite uses an isolated environment directory and dependency cache. Root `VITE_*` injection by the existing configuration package is disabled in sandbox mode. The server refuses sandbox requests if runtime database isolation is invalid. Service workers are disabled in the draft, and its root badge identifies the app as unpublished. Parent/iframe messages require exact origin and source matches; navigation stays in the draft origin and strips OAuth credentials from reported URLs.

These are configuration-isolation checks, not proof of database ownership, matching schema, successful authentication or a safe test dataset. Third-party providers also need sandbox/test accounts. The launcher never copies production provider credentials automatically.

## Hosted preview and production

Saved connection settings use the same private encrypted storage as admin connections, with revision checks that reject stale saves. For hosted admin configuration, set a persistent private `ADMIN_CONNECTIONS_DIRECTORY` and a 32-byte base64 `ADMIN_CONNECTIONS_ENCRYPTION_KEY`. Keep the vault out of static assets and backups with broader permissions. Configure each environment separately.

For remote embedding, set `PREVIEW_FRAME_ORIGINS` on the draft server to the HTTPS studio origin. Set `PREVIEW_APP_ORIGINS` on the studio server to allowed HTTPS draft origins for camera/geolocation delegation. Local loopback embedding is enabled for development. Browser permission prompts and provider restrictions still apply. Set `VITE_DGD_STUDIO_ORIGIN` on the draft to the exact studio origin. The navigation bridge never sends auth sessions to the parent.

A production pipeline must select the exact reviewed code version, deploy with production-specific credentials, record the release SHA and retain rollback artifacts. Ordinary code pushes must not deploy production automatically. The checked-in security workflow runs validation only and has no deployment step or production secrets. Database migrations require separate review; publishing code must not copy draft data into production.

## Base44 compatibility and remaining setup

DG Dashboard is a TanStack Start app with server functions, API routes, Supabase data/auth, payment webhooks and server-side connection storage. Base44's installed `@base44/vite-plugin` 1.0.44 includes a documented TanStack SSR document bridge and a Cloudflare Worker runtime. `vite.base44.config.ts` retains the existing full-stack routes and builds a Nitro `cloudflare-module` worker; it does not use the Lovable build wrapper. The ordinary local build remains available.

The Base44 build reads only `deployment/base44/public-config.json`, containing the dedicated destination's URL and validated public key. It does not load the original `.env`. Private provider keys come from server-only Base44 runtime bindings. Credential-vault persistence is disabled in Base44's temporary filesystem. The dedicated database still requires its reviewed restore, storage transfer and Auth URL configuration. Remote backend edits can sync immediately, so an unpublished frontend alone is not backend/data isolation.

Before release:

- Finish the cloud import and verify the actual Base44 preview and server runtime against the new app.
- Complete the dedicated Supabase data migration and verify which database the Base44 app uses. Inspect Base44's backend changes separately from frontend publication; no separate local-preview database is requested.
- Verify the complete server runtime and production deployment target, then wire an explicit release action with a rollback path.
- Validate authentication, permissions and provider workflows against test accounts and staging data.
- Configure Apple/Google developer accounts, package signing, store review and the supported billing path for digital subscriptions before mobile submission.

The new Base44 app was created and moved to the verified Elite workspace. Local full-stack compilation passed. Public publication, app-store submission and remote database cutover have not occurred.

References: [Base Code](https://docs.base44.com/Getting-Started/base-code), [Base44 site deploy](https://docs.base44.com/developers/references/cli/commands/site-deploy), [app-store packaging](https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores), [Vite environment modes](https://vite.dev/guide/env-and-mode), [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
