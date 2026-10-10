# Independent GitHub and Supabase connections

## Current connection audit — October 10, 2026

This section supersedes the older connection and missing-backup findings below. Provider connections, source-code synchronization and database migration are separate checks.

| Service | Verified state | Remaining work |
| --- | --- | --- |
| Base44 | DG Dashboard app `6ac96e8c9295eff8becd8869` belongs to Mike’s Workspace `69f19bca9bb88d5af75fba89`. PR #1 finished synchronizing at 23:04:31 UTC on October 10. Base44 reported ready at GitHub main commit `68161ce837f4d34f97258509df0b0b741ac05ef6`. | Verify the rendered cloud preview. Direct sandbox file access still timed out after the successful GitHub synchronization. |
| GitHub | Updated token access now works for `dg-dashboard-Base44`. The connected repository was cloned and the tested one-file startup repair was pushed and merged through PR #1, producing main commit `68161ce837f4d34f97258509df0b0b741ac05ef6`. The 2,311-file migration branch in `Disc-Golf-Dashboard` remains preserved at `90af4fa35c900e7a7a6531cd8f0b60322da6bc77`. | The separate Codex GitHub connector remains authenticated as `furst93`; the verified saved token provides repository access independently. Reconcile the remaining updates before transferring them. |
| Lovable | DG Dashboard project `51ec5e38-895e-487c-9ba7-99b8352b4eb5` is accessible, its agent is finished, and its source commit is `cd0067688df1bd7e1b34454182fb7b764906cbd7`. Its Supabase configuration names source project `ypeebzwggcsyfvafpifa`; read-only database queries work through the Lovable connector. | Preserve the original project and compare current data with the October 9 archive before cutover. Remaining legacy runtime integrations still need replacement and verification. |
| Supabase destination | `aosklgewcakrhuxdynik` is active and healthy. Saved management access and the public Auth endpoint work; Google OAuth is enabled with credentials present. The destination has no application tables, Auth users, Storage buckets/objects or Edge Functions. | Restore and verify data and Storage, configure exact Auth return URLs, and verify private runtime bindings. The private PostgreSQL connection currently contains a password placeholder. |
| Codex/local app | Existing source and backups remain intact. Ordinary local development still targets the source Supabase project; the Base44 public build configuration targets the empty destination. The startup repair passed TypeScript, the production Worker build and all 16 HTTP/access checks using the connected repository’s exact lockfile. | Verify the actual cloud preview, hydration, sign-in and provider workflows. Other local updates remain pending. Local checks do not establish cloud readiness. |

The live Lovable database reports 296 public base tables, 12,563 courses, seven Auth users, 11 Storage buckets and 147 Storage objects. The immutable October 9 archive records 12,570 courses and 146 Storage objects. These are aggregate differences, not an identified list of changed records. Retain the archive and compare a fresh export before restore/cutover; do not silently overwrite later changes with the older snapshot.

GitHub repository authorization is now complete for the saved token; another token is not required. Keep it scoped to the two repositories while reconciling the migration. Save any future replacement privately in Admin → Connections. Changing the saved repository target without supplying a replacement clears the saved token. See [GitHub’s token guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) and [the Base44 collaboration workflow](base44-codex-workflow.md).

The startup repair was pushed and merged through [PR #1](https://github.com/FurstQuality/dg-dashboard-Base44/pull/1). No publication or data migration was performed. Public payments and sensitive-data workflows are not verified as release-ready.

## Configure connections in DG Dashboard

Open **Admin → Platform operations → Connections** (`/admin/operations?section=connections`).
The Overview page has a **Connect GitHub & Supabase** button; the Connectors and Git screens also link here.

The setup form suggests the destinations selected by the user:

- GitHub: `FurstQuality/Disc-Golf-Dashboard` (accepts the repository URL or `owner/repository`).
- Supabase: `aosklgewcakrhuxdynik` (accepts the project ID, API URL, or project dashboard URL).

Enter a personal access token, **Save connection**, then **Test saved connection**.
GitHub needs a fine-grained token owned by an account with access to the repository, with Metadata and Contents read access.
Supabase needs an account personal access token scoped to the destination with Project Settings read access; an anon, publishable, or service-role API key is not a management token.
The form links to the appropriate token creation pages. Additional cloud tools require their corresponding provider permissions.

### If a connection returns HTTP 401

The Connections page detects credential-type mismatches before saving or contacting a provider. It also checks credentials already saved by earlier versions. A saved mismatch stays encrypted until it is deliberately replaced or removed; it is never sent to the wrong provider again.

| Connection field | Credential | Where to create it |
| --- | --- | --- |
| GitHub personal access token | `github_pat_…` (fine-grained) or `ghp_…` (classic) | GitHub account → Settings → Developer settings → Personal access tokens |
| Supabase personal access token | `sbp_…`, including scoped `sbp_fc…` tokens | Supabase account → Access tokens |
| App/database API configuration | Supabase publishable/anon and secret/service-role keys | Supabase project → Settings → API Keys; these do not authenticate the Management API |

The October 9 connection investigation found a Supabase publishable key saved as the GitHub token and a destination `service_role` API key saved as the Supabase management token. Both Management/API connection tests returned 401. The destination service-role key was independently accepted by the project's Auth API, confirming a credential-purpose mismatch rather than an invalid project API key. The destination course-table request returned `PGRST205` (not available in the API schema cache); migration/schema availability still needs verification before switching the running app. No credential values, runtime database settings, or course data were changed during diagnosis.

Tokens are write-only in the UI. A blank token preserves an existing token for the same target; changing a target clears its token unless a replacement is supplied. The explicit removal checkbox clears it on save. Tests show the last check time and report only verified access, not migration completion. Token changes and branch/target changes invalidate earlier checks. Stale saves are rejected by revision.

Every read, save and test passes the authenticated server middleware and the database `super_admin` role check. Credentials are encrypted with AES-256-GCM in a server-only vault; no token is placed in browser storage, a URL, a response, or provider error text. The development vault and its random key are in `.admin-connections.local/` (inside `.sandbox/` for sandbox mode), excluded from Git and denied by Vite's file server. Protect this directory like `.env`; local encryption does not protect against someone who can read both the vault and its local key.

On a hosted Node server, configure an absolute `ADMIN_CONNECTIONS_DIRECTORY` on private persistent storage plus `ADMIN_CONNECTIONS_ENCRYPTION_KEY` (32 random bytes, base64). Store that key in the host's secret manager, separately from the vault, and retain it across restarts/deploys. UI saves are disabled on hosts without this setup; ephemeral/serverless filesystems are not durable storage. Environment-configured connections remain usable. A missing or changed encryption key never silently resets an existing vault. Interrupted writers may leave `write.lock`; an operator can remove that lock only after confirming no writer is running. Back up the encrypted vault and encryption key securely and separately.

Saving these settings does **not** change `SUPABASE_URL`, browser API keys, local Git remotes, production deployments or course data. Git status uses the saved GitHub connection immediately. Cloud tools stay on the active app project and use a saved Supabase token only when its project matches that active project. The selected destination can be tested and opened independently while migration is prepared. Coding-assistant connectors are a separate connection surface; these app settings do not grant the assistant's connectors access.

Provider references: [Supabase scoped personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens), [GitHub repository API](https://docs.github.com/en/rest/repos/repos), [GitHub token permissions](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens).

## Verified state on 2026-10-08

- This workspace's `origin` points directly to `https://github.com/furst93/chain-linked.git`. Fetching `main` succeeded without a Lovable API.
- The imported local commit `83bc9d96` and fetched GitHub head `cd006768` have unrelated histories. GitHub contains 11,904 commits; this local history contains one import commit plus uncommitted work. No merge, push, reset, or history rewrite was performed.
- GitHub's repository content is close to the imported baseline, but the working tree has substantial later migration changes. Reconcile those changes on a branch based on GitHub history before publishing. Preserve the local workspace and its untracked files; never force-push this imported `main` over the remote.
- The admin Git integration calls `api.github.com` directly. It needs its own server-side repository token; a local Git credential does not configure the deployed admin dashboard.
- App database access and Google sign-in use Supabase directly. The configured source project is `ypeebzwggcsyfvafpifa`, which was absent from the connected Supabase account and denied schema access. Ownership has not been transferred and no database destination has been changed.
- Admin management reads call `api.supabase.com` directly. A management token enables authorized API access, but does not transfer a Lovable-managed project into your account.

## GitHub separation

In Lovable, open this project's **Settings → Git → GitHub**, open the active repository dropdown, and select **Disconnect**. This stops project sync and keeps the repository and history on GitHub. This action has not been performed here. Do not remove the workspace-wide connection if other projects still use it.

Use Connections for the admin dashboard, or supply `GITHUB_REPOSITORY`, `GITHUB_BRANCH`, and a repository-scoped `GITHUB_TOKEN` in the server environment. Saved UI settings take precedence. Set `DEPLOY_COMMIT_SHA` from the actual deployment. Fetching locally does not verify dashboard credentials or GitHub push permission.

The dashboard's status checks need only Metadata and Contents read access. Pushing code requires Contents **read and write** on the selected repository; opening the migration draft PR also requires Pull requests **read and write**. The prepared branch now includes a validation workflow, so its token also needs Workflows **read and write**. Restrict the token to `FurstQuality/Disc-Golf-Dashboard`; Metadata stays read-only. The Connections screen has a prefilled token-creation link under **Permissions for migrating code and opening pull requests**. A successful dashboard check confirms read access only, and pushing a draft branch does not publish the app.

## Supabase separation without data loss

1. The user created and selected the dedicated destination `aosklgewcakrhuxdynik`. Direct Management API access was verified on 2026-10-09: the project is active and healthy in `us-west-2` and is currently named `FurstQuality's Project`. Read-only queries confirmed no public application tables, Auth users, storage buckets or objects; no Edge Functions are deployed. Smartcaddy, asset1st and CoreFlow remain unrelated projects.
2. Obtain an authorized export of the source schema and data, including Auth identities/UUIDs, functions, policies, triggers and grants. Inventory storage objects and buckets, Edge Functions, scheduled jobs, Realtime configuration, authentication settings and external integrations separately. Keep an immutable source export and a manifest; a Git checkout is not a database backup.
3. Restore into the destination using a reviewed migration plan compatible with the source export. Preserve IDs and relationships. Transfer storage files as well as their metadata. Reconfigure provider credentials through the provider consoles; do not put secrets in source control or project notes.
4. Verify table counts, key relationships, roles/RLS, existing-user sign-in, course/layout data, storage access and required functions. Review source changes made during migration and plan a final delta or maintenance window before switching production. Keep the source available for rollback.
5. Configure Google OAuth in the destination Supabase Auth provider. Register `https://<destination-ref>.supabase.co/auth/v1/callback` with Google. Configure the local `http://127.0.0.1:5180/auth-callback` and production app callbacks in Supabase's redirect allow list. Existing source callbacks stay valid during migration.
6. Switch server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and browser `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` together, only after verification. Rebuild/restart because browser variables are embedded at build time. Configure an authorized `SUPABASE_MANAGEMENT_TOKEN` separately for admin management reads.
7. Verify the local preview against the destination: directory and course detail, a real Google sign-in and callback, super-admin access, connection checks and existing records. Repeat critical checks after deployment before retiring source access.

`DATABASE_URL` now supplies a direct PostgreSQL connection to Drizzle from the process environment. This only prepares configuration; it does not connect, restore data or run migrations. **The current `drizzle/schema.ts` is empty. Do not run `drizzle-kit push` against either project.** Review database migrations individually; the local shared-fairways migration is currently an empty placeholder and the admin settings migration has not been applied.

### Source export and local preflight

The source project cannot currently be accessed through this Supabase account. Request a full export in the Lovable project at **More → Cloud → Overview → Advanced settings → Export project data → Export data → Database → Export → Start export**. Download the resulting archive locally when ready. Keep it in an ignored private directory such as `.migration-data.local/`; it contains user accounts and password hashes and must not be committed or pasted into chat. This export includes database structure and records, but storage files, Edge Function code, secrets, auth-provider settings and API keys need separate transfer/configuration.

Local inventory on 2026-10-08: 327 Supabase SQL migration files and 117 Drizzle SQL migration files, with Drizzle order recorded in `drizzle/migrations/meta/_journal.json`. The shared-pairing-fairways placeholder is empty. `supabase/functions/` is absent. `pg_restore` was not found on PATH. These are preflight findings, not proof that local migrations exactly match the live schema. Inspect the full export's format/table of contents and review it against the initialized destination before choosing restore commands. Do not blindly apply both migration families or restore an entire dump over Supabase's managed schemas.

See [Lovable's documented full export process](https://docs.lovable.dev/features/advanced-settings#export-lovable-cloud-data) and [managed Supabase migration sequence](https://docs.lovable.dev/tips-tricks/external-deployment-hosting#host-backend-and-data-on-a-managed-provider-supabase-example). The existing source remains the app's active database until the destination has been restored and verified.

## Remaining app dependencies

Separating GitHub and Supabase does not replace the remaining Lovable AI, Calendar, email/SMS and connector gateways or the Lovable Vite configuration package. Those need their own migration and functional verification before claiming that the entire app is independent. The admin console labels the gateway dependencies.

## Official references

- [Lovable GitHub disconnect behavior](https://docs.lovable.dev/integrations/github#disconnect-a-project-from-a-github-repository)
- [Supabase: accessing a Lovable Cloud project](https://supabase.com/docs/guides/troubleshooting/cant-access-supabase-project-lovable-cloud)
- [Deployment, hosting and ownership](https://docs.lovable.dev/tips-tricks/deployment-hosting-ownership)

## Connection recheck — October 9, 2026

The user supplied `https://github.com/FurstQuality/Disc-Golf-Dashboard` and Supabase project `aosklgewcakrhuxdynik`. Earlier coding-assistant connector checks could not access either destination. The app's Connections screen now provides an independent connection using authorized provider tokens.

At 17:20 UTC on October 9, both replacement tokens passed their direct provider checks, and the verified results were saved to the local Connections screen. GitHub verified the private repository and `main` at `99536cae02e2831eb3c767c419f1733848e6dd87`; this initial commit contains only `README.md`. Supabase verified project metadata and permitted read-only database inventory. The destination contains no application tables, users, storage objects or functions. Google OAuth is disabled, its client credentials are unset, and Auth still has the default `http://localhost:3000` site URL with no redirect allow list.

The same Supabase token receives HTTP 403 for the source project `ypeebzwggcsyfvafpifa`. A complete authorized source export is still required to migrate existing data. Working destination credentials do not grant access to the source or replace a source database backup.

The local origin remains furst93/chain-linked and local Supabase configuration remains ypeebzwggcsyfvafpifa. No remote, database, or environment switch was performed. No complete source database export was found in the migration directory, and supabase/functions is absent.

A private preservation archive at .migration-data.local/preflight-20261009T151907Z/workspace-source.zip contains 2,254 current source files, including uncommitted and untracked work. Its manifest records individual SHA-256 hashes, source HEAD, branch, remotes, and working-tree status. All file hashes and archive CRCs were verified. Runtime credentials and Supabase CLI temporary files were excluded. This is a source backup, not a database, Auth, or Storage backup.

### Prepared repository migration

The current app was copied into `.migration-data.local/repository-20261009` on branch `codex/independent-migration-20261009`, based on the destination's initial README commit. Commit `17f90ab865f4e5a7c0606ad9b53d2b670cdbec92` preserves 2,261 source files, including existing uncommitted/untracked app work. The private manifest records and verifies every copied SHA-256. Saved credentials, local migration data, build output and Supabase CLI temporary files were excluded; scans found no saved credential values in the source snapshot.

Validation passed: 1,049 tests across 126 files, TypeScript, production build, desktop/mobile rendering of the actual saved provider check results, and HTTP 403 for private migration files through both ordinary and `/@fs` preview paths. Vite also ignores the private migration directory when watching for edits.

The branch push was rejected for missing write access. The existing Windows Git login and coding-assistant GitHub connector could not access this private repository either. No remote branch or PR was created, no deployment occurred, and `main` remains the original README commit. The prepared checkout and PR description (`.migration-check.local/github-migration-pr.md`) are ready to resume after the selected token receives the required repository write permissions. The source database export remains separately required before restoring or switching Supabase.

### Refreshed migration and preview verification — October 9, 2026

The preserved migration branch was updated without rewriting its earlier commits. Commit `f7503a71ddf8ffc4aac6bcd8338611b3364f4908` includes the whole-app preview, payment security fixes and validation workflow. All 2,288 copied files were checked against their source hashes, saved credential values were excluded, and a verified Git bundle was saved privately. Subsequent connection-permission guidance is included in the current prepared snapshot; `.migration-data.local/github-migration-latest.json` records its exact commit, manifest and recovery bundle.

The latest source passed 1,099 tests across 133 files, seven sandbox/release-script checks, TypeScript and the production build. The source fingerprint is `d79a82297c270713f617976f8a94fe5f421d18c7f935e1a025adee9832afdf73`. Local preview checks verified the actual connection controls with isolated provider fixtures. The source database and public application were not changed.

At 21:33 UTC, the saved GitHub token (connection revision 5) again failed the actual branch push with HTTP 403. Repository metadata reported that the account has push access, but the token did not authorize this operation. No branch or pull request was created remotely. Replace the saved token through Admin → Connections with repository-limited Contents, Pull requests and Workflows read/write permissions, then recheck and resume the branch push. A dashboard read check alone does not establish those write permissions. The Base44 connector still denies the supplied app, source Supabase access is still unavailable, and no separate preview database is configured.

### Backup received and remaining connection steps — October 9, 2026

This update supersedes the earlier missing-backup, unconfigured-Google and generic GitHub-authentication findings above. The user selected Base44's own preview and Publish workflow; a separate local-preview database is no longer a migration requirement.

- GitHub connection revision 6 now pushed the preserved app successfully to [codex/independent-migration-20261009](https://github.com/FurstQuality/Disc-Golf-Dashboard/tree/codex/independent-migration-20261009). Contents and Workflows write access are working. The remote branch was verified and `main` remains the original README commit. Draft PR creation is blocked: `GET /pulls` returned HTTP 403 and reported `pull_requests=read` as required. Add **Pull requests → Read and write** to this token and save any replacement in Admin → Connections. No PR, merge or deployment has occurred.
- The immutable `dgdashboard_261009.backup` is present in the ignored migration directory. PostgreSQL tools successfully read every data section: 343 table definitions, 345 COPY sections and 1,113,287 rows. Counts include 12,570 courses, 13,828 layouts, 196,688 course-hole rows and seven Auth users. SHA-256 remains `52bb81537393a73242217b8e9a603d838687ef1852ec2b49dff134a589d5666c`. This validates archive readability, not a completed restore.
- Storage metadata identifies 11 private buckets and 146 files totaling 415,398,851 bytes. File contents are not inside the database archive. One course upload (53,439,035 bytes) was downloaded through its existing public-read policy using the source publishable key, then verified against archive metadata and its on-disk SHA-256. The other 145 objects still need authorized export/download; preserve bucket/object paths and owners. No source service-role credential is available locally, and destination credentials do not grant source Storage access.
- Nine enabled scheduled jobs are preserved in the archive; six call the old Lovable app. Review and retarget jobs before enabling them in the destination. The original export and audit history remain unchanged. The archive has no Vault secret rows; provider settings and secrets still require independent configuration.
- The backup contains Rogers Lakewood's separate **Main (27 Hole Layout)** with mapped holes and red alternate tees on holes 1, 3 and 4. Hole 2 has no alternate-tee entry in that layout. A separate legacy 45-hole layout and the course's 45-hole summary also remain in the archive. Preserve both during restore and reconcile them using the course-builder rules afterwards; do not delete layouts or rewrite pinned event history as part of import.
- Destination Google OAuth is enabled and both credentials are present. Auth still has `http://localhost:3000` as Site URL and no redirect allow list. An attempt to update those URLs returned **HTTP 403**; no Auth settings were changed. Credentials do not need to be entered again.
- Base44 access is now working through the official CLI. The user's Elite membership belongs to **Mike's Workspace** (`69f19bca9bb88d5af75fba89`), not the separate SmartCaddy workspace used by the MCP connection. The fresh [DG Dashboard app](https://app.base44.com/apps/6ac96e8c9295eff8becd8869/editor/preview) was moved into Mike's Workspace, and 1,947 source files were imported and hash-verified without copying private credentials or database files. No subscription change was necessary. See [App sandbox](app-sandbox.md) for preview/runtime verification and remaining release work.

#### Database password and connection string

1. Open [the destination's Database settings](https://supabase.com/dashboard/project/aosklgewcakrhuxdynik/database/settings). Use the database password saved when this project was created. If unavailable, select **Reset database password**, save the new password in your password manager, and allow the reset to finish. This is not a Supabase API key or personal access token.
2. In that same project, open **Connect → Session pooler** and copy its connection string. Replace `[YOUR-PASSWORD]` with the database password, percent-encoding reserved characters as documented by Supabase. Keep the copied host and `postgres.aosklgewcakrhuxdynik` username; do not guess the pooler host.
3. In the already-created private file `.migration-data.local/destination-db.env`, set `MIGRATION_DATABASE_URL=` followed by that complete string. Replace the password placeholder privately with the actual database password. Keep it out of chat and Git. The October 10 preflight found the destination URL but its password placeholder was still present.
4. The migration can then verify the destination over PostgreSQL, preserve its current state, compare managed schemas, and restore a reviewed selection of application/Auth data and custom policies. Do not restore the entire archive indiscriminately over managed Supabase schemas or enable its original cron jobs.

See [Supabase connection strings](https://supabase.com/docs/guides/database/connecting-to-postgres) and [backup/restore guidance](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

#### Auth return URLs

The old `my-dg-dashboard.base44.app` address belongs to the earlier app and is no longer the migration target. In the destination's **Authentication → URL Configuration**, use the new app's verified public origin once Base44 assigns it. Do not guess the hostname or use the editor URL as Site URL. Add `/auth-callback` and `/reset-password` on that exact public origin, plus these local development return URLs, while preserving any later verified entries:

- `http://127.0.0.1:5180/auth-callback`
- `http://127.0.0.1:5180/reset-password`

Add the exact Base44 preview callback origin after the connected sandbox supplies it; do not guess it or add a broad wildcard. Google Cloud must allow `https://aosklgewcakrhuxdynik.supabase.co/auth/v1/callback`. A successful real Google sign-in remains to be verified after the app and destination data are connected.
