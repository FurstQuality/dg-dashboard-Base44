# Building DG Dashboard in Base44 and Codex

Use [DG Dashboard in Mike’s Workspace](https://app.base44.com/apps/6ac96e8c9295eff8becd8869/editor/preview), app `6ac96e8c9295eff8becd8869`. Its complete application source is imported. The dedicated Supabase project is `aosklgewcakrhuxdynik`; restoring its existing data, completing Auth and configuring private server bindings remain separate tasks. The original app and backup are preserved.

## Share changes through GitHub

The user confirmed on October 10 that [FurstQuality/dg-dashboard-Base44](https://github.com/FurstQuality/dg-dashboard-Base44) is this app’s connected repository. Use that repository for Base44 collaboration; do not create another repository. After the token’s repository access was updated, the saved `FurstQuality` credential successfully cloned the repository, pushed a feature branch and merged [the preview startup repair](https://github.com/FurstQuality/dg-dashboard-Base44/pull/1). Base44’s Git source and recorded commit matched the connected repository before the merge. The separate Codex GitHub connector still authenticates as `furst93`; browser login and that connector’s authorization remain separate.

Keep the existing fine-grained token scoped to `dg-dashboard-Base44` and `Disc-Golf-Dashboard` while reconciling the migration, with Contents, Pull requests and Workflows read/write permissions and Metadata read permission. If a replacement token is issued, save it privately in Admin → Connections. First verify access and compare the actual connected branch; changing the Connections repository target alone does not grant access and clears the old saved token unless a replacement is supplied. The existing `FurstQuality/Disc-Golf-Dashboard` migration branch remains preserved. The connected development checkout is `.base44-runtime.local/`; recovery bundles and comparison/validation reports are under `.migration-data.local/`.

After verifying the new connection, clone that repository into a separate checkout. Do not change this dirty workspace’s remote and overwrite it with a new clone. Start each task by fetching current branches and checking for uncommitted changes. Use `codex/<task>` branches for Codex; use the branch menu in Base44 for builder work. Import the corresponding GitHub branch in Base44 when you need its preview. Review both sides before merging. Never force-push, reset away edits or use a complete source re-import as a synchronization method.

Base44 provides a preview for each branch. It permits parallel work on branches, but its direct sandbox interface supports one external agent per app and temporarily pauses builder edits while that agent is active. If Base44 reports `BUILDER_BUSY`, finish that builder task before retrying. Do not circumvent its lock. Local Codex work can continue during a Base44 build; transfer files after the builder finishes.

Merge reviewed changes into main, verify the resulting preview, then use **Publish** in Base44 when explicitly requested. Source sync and commits do not constitute a public release. Base44 branches share backend resources; they do not isolate the external Supabase database.

## Guarded direct transfers from this workspace

The official Base44 CLI is included as a locked development dependency. Log in with the account that owns Mike’s Workspace:

```sh
npm ci
npx base44 whoami
# Only if authentication is needed:
npx base44 login
npm run base44:status -- --branch main
```

`status` compares the verified import baseline, current local files and current Base44 files. It lists local changes, Base44 changes and conflicts. This check uses a sandbox shell command and may claim the external-agent session even though it does not edit application files. Do not poll it continuously while using Base44’s builder.

Transfer only the named files after reviewing the report:

```sh
npm run base44:pull -- --branch main src/components/example.tsx
npm run base44:push -- --branch main src/components/example.tsx
```

Replace the example path and branch with actual reviewed files and an existing branch. Push requires an explicit branch. The tool will not create or switch a branch, merge, publish, delete files, transfer credentials, or overwrite a conflict. It checks source hashes immediately before replacement, preserves originals, verifies both copies afterwards, and creates Base44 checkpoints around a push. The Base44 editor can restore checkpoints through version history.

Local baselines, original-file backups and reports live in `.base44-workspace.local/`. Remote originals live in `.dgd-sync.local/`. These directories are ignored by Git and denied by the Base44 Vite server. Common private-credential patterns and links outside the source tree are refused. These checks complement code review; they are not a complete secret scanner. Transfer batches are capped at 600 KB.

A transfer can be partially completed if another process changes a later file or a network call fails. **Run status again before retrying**; inspect backups and the checkpoint. Never reset the baseline to hide a conflict. If both editors changed one file, reconcile both versions through a reviewed Git merge. A stale `session.lock` should be removed only after confirming its recorded process has exited.

### Hosting files need a separate review

The shared-file tool excludes `package.json`, `package-lock.json`, the ordinary `vite.config.ts`, `.gitignore`, and Base44-managed resource/configuration files. They intentionally differ between the local checkout and cloud app. Update dependencies deliberately in both environments, preserving the cloud package’s Base44 dev/build commands. Never overwrite the cloud’s root Vite entry with the ordinary local configuration. Do not modify `.agents/`, copy local environment files, or run CLI resource/site deployment against this imported sandbox.

Shared code includes both `supabase/migrations/` and `drizzle/migrations/`, including Drizzle's journal and snapshots. Transferring these files does **not** execute a migration. The original Base44 import omitted the Drizzle history; the reconciled repository restores it so database security tests can run. Keep existing IDs, Auth identities, course layouts, scoring snapshots and payment records intact. The preserved database backup and Storage objects are not source files and must never enter Git or a Base44 upload.

## Verify a completed change

### Preview startup

`npm run dev:base44` serves the full application through TanStack's Vite development server. `vite.base44.config.ts` enables Nitro only for the production build, which still targets Base44's Cloudflare Worker. Running a separate Nitro development runner stalled the imported app's preview during the October 10 startup investigation even though its production build completed.

The preview-only `src/lib/preview-runtime-plugin.ts` adapter preserves the server environment interface that Base44 added during its investigation. It rejects browser imports of `base44:runtime`, is disabled for builds, and does not load local environment files. Provider credentials must be configured in the server environment; a working preview shell does not establish that sign-in or payments are configured.

If the builder is ready but file reads and sandbox commands time out, direct sandbox transfer cannot proceed safely. Preserve the current version and ask Base44 to recover the app's sandbox. Do not re-import the entire application or revert to an earlier checkpoint as a startup workaround. After access returns, run `base44:status`, reconcile independent cloud edits, checkpoint, and apply only reviewed changes. An accessible connected GitHub repository supports a separate, reviewed feature-branch repair; first verify that Base44 is idle and records the same commit as GitHub, preserve its files and history, and verify cloud synchronization afterwards.

On October 10, the connected GitHub repository supplied the actual cloud source after sandbox reads continued to time out. Its recorded Base44 commit and GitHub main both matched `bdee95ea35a94447d64b9ba75bb2dc0fb7a5d558`. The one-file startup repair was tested against that repository’s own lockfile, pushed on `codex/fix-base44-preview-startup`, and merged without rewriting history as `68161ce837f4d34f97258509df0b0b741ac05ef6`. TypeScript, the production Worker build and all 16 local HTTP/access-control checks passed. Base44 finished syncing at 23:04:31 UTC and subsequently reported ready at that exact GitHub commit. Direct sandbox file access still timed out after synchronization, so actual cloud rendering/hydration remains unverified. No public Publish action or database migration was performed.

The connected checkout pins Base44 CLI `0.1.25`, which supports the required branch, sandbox and checkpoint commands and respects the cloud repository's seven-day dependency cooldown. Its hosting adapters and newer Base44 SDK remain intact. The original local checkout's already-installed CLI is pinned separately. Do not disable the cooldown to make a fresh checkout install.

### Checks

Run focused tests during development and `npm run release:check` before a release review. That check includes application/database security tests, source-transfer and sandbox tests, TypeScript, and both local and Base44 full-stack builds. Run the cloud build and check the actual Base44 preview after a transfer. A successful HTTP page shell is not proof of hydration, sign-in or payment processing.

Before public use, complete the dedicated database restore and Storage migration, verify exact Auth callback origins, configure server-only provider bindings, and test signed-in workflows and payments with test accounts. Do not claim app-store readiness or a completed migration based on source sync alone.

Ace AI and transactional invitations now support direct OpenAI and Resend credentials. Follow [the direct service setup guide](direct-service-setup.md) for runtime settings and the distinction between app email and Supabase Auth email. Local source changes must still be transferred and checked in the Base44 preview before they are available there.

References: [Base44 GitHub connection](https://docs.base44.com/developers/app-code/local-development/github), [branches and previews](https://docs.base44.com/Building-your-app/working-with-branches), [external sandbox development](https://docs.base44.com/developers/app-code/sandbox/bring-your-own-agent).
