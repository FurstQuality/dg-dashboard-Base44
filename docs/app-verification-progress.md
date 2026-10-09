# App Verification Progress

## Verified on October 8, 2026

- Production build and TypeScript checks pass.
- Full unit suite: 102 files, 901 tests pass.
- `npm run check:pages` checks the static React page routes in the generated feature registry against the local preview. All 177 returned successful HTML responses with no recognized SSR error marker.
- The local TanStack server-function endpoint returns Rogers Lakewood Park, its canonical course ID, and four layout records through the course directory search.
- The public Supabase course-map RPC returns 12,465 matching courses for the broad tested viewport, using clusters at low zoom.
- Google, Apple, and Microsoft buttons now use direct Supabase OAuth. Microsoft uses the Supabase `azure` provider and requests the email scope. Existing callback/session handling is preserved.

HTTP page checks do not verify browser hydration, login gates, API authorization, interactive controls, writes, dynamic detail routes, mobile layout, or complete workflows. They are a repeatable loading baseline, not proof that every feature works.

## Google Configuration Blocker

Supabase's public auth settings report Google enabled, but its authorization endpoint returns HTTP 400 with `Unsupported provider: missing OAuth secret`.

The project administrator must configure the Google OAuth client ID and secret in:
https://supabase.com/dashboard/project/ypeebzwggcsyfvafpifa/auth/providers

Google's authorized redirect URI must include the project's Supabase Auth callback:
`https://ypeebzwggcsyfvafpifa.supabase.co/auth/v1/callback`.

Supabase's redirect allow list must include the local app callback:
`http://127.0.0.1:5180/auth-callback`.

Provider credentials belong in the Supabase dashboard, never frontend environment variables. Google sign-in cannot be considered verified until the missing secret is configured and a browser round trip completes. Reference: https://supabase.com/docs/guides/auth/social-login/auth-google

## Access Limitations

- Local sandbox execution fails before process creation. Scoped checks were run through approved execution outside the sandbox.
- Browser inspection has previously failed through the same sandbox runtime. This pass verified course data through API requests, not a fresh rendered browser view.
- Supabase security and performance advisors were requested for this project; both were denied because the connected account lacks permission. No clean database-security claim is made.
- No database schema or record changes were made in this pass.

## Next Workflow Gates

1. Complete Google provider configuration and browser login/callback verification.
2. Verify directory search, distance filters, map clusters/pins, course detail, and Course Studio with Rogers Lakewood. Check data parity across map, layouts, and signs.
3. Verify layout draft editing, publication immutability, and tee/basket references before changing persistence.
4. Verify event creation/version pins/overlays, card creation, hole scoring, score correction, and finalization with an isolated test event.
5. Verify owner/staff/steward/admin authorization through server/database rules; obtain advisor access and run security checks.
6. Cover remaining community, stats, tracker, and integration pages with role-specific browser workflows and realistic datasets.
7. Measure browser loading, map interactions, server queries, and mobile scoring before making performance changes. Optimize based on evidence, keeping audit history and published snapshots intact.


## Map editor continuation — October 9, 2026

- Course Studio opens the existing map builder directly. The directory map popup has adjacent Open course / Open map editor actions. The layouts route also uses the same builder with an embedded layout drawer.
- Layout creation, copy, slot editing, details, comparison and publication use the existing canonical Layout Studio components and RPCs in the drawer. Map drafts require an explicit Save changes or Undo before opening it; opening the drawer never saves map edits. Dirty layout edits require an explicit discard when leaving, pending saves block closing, and saved layouts reload before further map edits. Selecting a layout updates the route search parameter for refresh/bookmarks.
- Map tools and view options are collapsed menus. A shared Whole course / Hole only filter drives map objects and inventory. Removed the aerial overlay/file-import controls and builder Conditions mode; the player course map now opens condition reports.
- Walk course supports additional named/color-coded tees, drop zones and baskets. Stable step keys prevent inserted tees from changing the selected location; each location requires fresh GPS readings. Placements use the existing fairway and save pipeline.
- Isolated Playwright preview checks passed for drawer creation/details/slot saves/switching, dirty-close protection, layout refresh persistence, multiple GPS endpoints, desktop/mobile controls, directory editor navigation, and the player Conditions dialog. Role/color/save/reload and save-safety regression checks passed. These tests use a local fake database and GPS readings; no live course records were changed.
- Repository tests: 116 files / 976 tests passed. TypeScript and production build checked separately. Existing Supabase provider/access and Rogers Lakewood recovery limitations above are not resolved by these UI changes.

## Explicit map saves, directional symbols, and calendar readability — October 9, 2026

- Removed map autosave, reconnect saves, implicit saves on opening Layouts, and automatic saving after the final guided hole. Course color groups and colors now participate in the same draft, Undo/Redo and explicit Save changes flow.
- Undo records edits immediately, retains the editing session across saves, and preserves assigned database identities for restored features and alternate tees. Undo back to the saved baseline archives then clears the cancelled pending recovery draft. An Undo while a save is in flight remains an unsaved change against the submitted snapshot.
- Tee and basket positions start locked; Map tools → Unlock tee and basket positions enables dragging on the active hole. Tee footprints and mando passing arrows follow their geographic bearing through map rotation while labels remain readable. Player-facing mando markers use saved direction and passing-side data.
- Calendar event labels use solid backgrounds with L/T badges instead of white/black diagonal stripes. Label contrast is at least 4.5:1 in the preview fixture. Clicking a directory calendar label now selects its day when there is no separate event-click callback.
- Isolated local-preview browser checks passed for drag/Undo/Redo, no timer/reconnect/navigation writes, explicit save, saved-item removal/restoration with stable IDs, concurrent Undo during save, course color groups, 55-degree tee map rotation, mando direction at five map bearings, calendar day selection and mobile viewport fit. Browser checks used a fake database; no live course records were written.
- 1,013 tests across 124 files passed. Production build completed successfully, including the formerly reported course-editor parse location. The prior cloud-access and missing-data recovery limitations remain separate from this work.

## Security and whole-app preview sweep — October 9, 2026

### Completed locally

- Reviewed a static inventory of 1,437 TS/TSX source files, 514 server functions and 18 API route files at the start of the pass. The inventory identified public exceptions for targeted review; it is not an exhaustive proof of authorization for every feature.
- Hardened Stripe and mobile-purchase webhooks: verified signatures/constant-time shared-secret checks, bounded request bodies, environment separation, stable event/purchase identity, explicit product-to-tier mapping, ownership validation, and retryable processing failures. Stripe processing retrieves the current subscription instead of trusting delivery order.
- Added `20261009181152_billing_webhook_transaction_safety.sql`. Receipt deduplication, ownership checks, stale-state handling, subscription updates and minimal billing audit now form one transaction. A failed write rolls back the entitlement and receipt together. Only the service role may invoke the transaction. The migration preserves existing subscription data and has **not been applied to a remote database**.
- Checkout verifies billing storage readiness, configured public plans and exact Stripe price/interval/currency; checks existing subscriptions and pending checkouts; uses fixed configured return URLs and provider idempotency keys. Portal lookup is scoped to the authenticated user's Stripe customer. Concurrent checkout races and actual provider behavior still require staging verification.
- Restricted global course-model rebuilds to a server-verified super admin. Admin preview reads, saves and connection checks also require this role; the UI does not decide authorization.
- Constrained outbound photo/event fetches at every redirect, added streaming byte limits, validated raster photo headers and bounded push endpoints to browser push-service hosts. Push links remain inside the app.
- Escaped map-marker style inputs, rejected privileged Supabase keys from browser configuration, and constrained preview auth messages to the expected parent window/origin.
- Added baseline response headers: content sniffing prevention, referrer and device-permission policies, restricted framing, HSTS on HTTPS, and no-store for API/auth/admin/billing and authenticated responses. A strict script-src CSP is still outstanding because the existing app uses inline hydration.
- Updated the affected esbuild dependency. `npm audit --json` reports **0 known vulnerabilities**; Drizzle CLI loads after the change. This is the audit database's result at the time of checking, not a guarantee against undiscovered issues.
- Added a validation-only GitHub workflow. It has read-only repository permissions and no deployment step or production secrets.
- Replaced the page-only sandbox panel with full-app navigation and a root preview bridge. Connection settings persist privately with stale-save protection, and the preview checks declared browser/server database isolation before loading. Source release reports become stale after code changes. Publish remains disabled until the production runtime is connected and verified.
- Saved the user's Base44 app URL and **Mikes workspace** preference locally. The Base44 connector still lists no apps and denies access to app `6ac9557772bd04647013b3d2`; no workspace transfer, import or deployment has occurred.

### Verification evidence

- `npm run release:check`: **passed** — 133 test files / **1,099 tests**, seven sandbox/release-script checks, TypeScript, production build and unchanged-source fingerprint. Report: `.sandbox/release-check.json`; latest checked source prefix `d79a82297c27` at 21:36 UTC, including migration-permission guidance. The report explicitly records `published: false`.
- Database security tests execute the billing migration in an isolated PGlite PostgreSQL instance. They cover transaction rollback/retry, duplicate/stale deliveries, conflicting owners/providers and denied anonymous/authenticated writes. They do not establish deployed Supabase RLS or production permissions.
- Stripe tests use real SDK-generated webhook signatures with simulated provider/database responses. No live payment was made. Mobile-purchase authentication/environment/mapping failures and checkout configuration/ownership paths are covered with provider fixtures.
- All **178 static page routes** returned successful HTML without recognized SSR failures in the local preview. This check does not exercise every dynamic route, authenticated workflow, browser hydration or write.
- Real anonymous server calls were denied for preview read/save/check, checkout, portal, subscription override revocation and global course-model rebuilding. The admin sandbox page redirects an anonymous browser to sign-in.
- Browser tests of the actual preview component passed persistence, workspace default, whole-app navigation, back/forward, current-page reload/full-tab links, credential-query removal, spoofed-message rejection, phone sizing, offline blocking and disabled Publish. Configuration/provider responses were isolated fixtures.
- A real temporary sandbox Vite server used a non-routable local database fixture. Its compiled client excluded the source database URL; the status endpoint reported matching isolated configuration; its actual root bridge navigated inside an iframe; the unpublished badge rendered; no service worker registered; private environment/vault/report requests were denied. External network requests were blocked during the test, and the temporary server was stopped. This does not claim a real sandbox database exists.
- The Connections screen now distinguishes read-only status checks from the Contents, Pull requests and Workflows write permissions needed for the prepared migration branch. An isolated desktop/mobile browser check verified the token-creation link, wrong-provider rejection, save/reload, token retention/removal, stale-check reset and provider errors without contacting either provider or changing saved credentials.

### Required before sensitive-data or payment release

1. Obtain access to the source and destination Supabase projects, reconcile migrations/data, and run live RLS, storage-policy, grants and advisor checks with ordinary-user/staff/admin separation. Verify backups by restoring them to an isolated target.
2. Use the user's selected Base44 preview workflow and verify its actual database and backend behavior; the separate local-preview setup was cancelled. Confirm Auth provider settings, redirect allow lists, session revocation/MFA requirements and account recovery. The current port-5180 app still uses the source database. Unpublished frontend changes do not imply isolated backend data.
3. Apply reviewed migrations to staging first. Configure APP_ORIGIN, server-only Supabase credentials and test Stripe/mobile-purchase webhook secrets. Exercise checkout, cancellation, retry/replay, refund/expiry, conflicting subscriptions, portal and real persistence end to end. The checked local runtime currently has no payment secrets or service-role key, and payment endpoints correctly return unavailable.
4. Verify rate limiting and abuse controls for public/guest capabilities and integrations, plus full role-based browser workflows for scoring, course editing, events, community, exports and administration. Add a strict script CSP after nonce-compatible hydration is established. The static inventory and local regressions are not a penetration test or compliance certification.
5. Finish authenticated browser testing and verify the production Worker deployment path for the imported Base44 app in Mike's Workspace. The CLI now has access, source is imported, and cloud builds and HTTP checks pass; these do not establish successful public deployment or signed-in feature behavior.
6. Configure production protection, explicit version selection, audit/rollback, mobile signing/store review and applicable billing support. No public code, production data or app-store release was published in this sweep.

See [App sandbox and publishing](app-sandbox.md) for setup and platform references, and [Independent connections](independent-connections.md) for the existing migration/access blockers.

## Migration backup and account access — October 9, 2026

- Fetched and read both user-supplied Base44 sandbox READMEs. The installed connector still cannot access app `6ac9557772bd04647013b3d2`; it returns no apps and `app_not_found`. No remote Base44 changes or checkpoint claims are made.
- The newer GitHub credential successfully pushed and verified `codex/independent-migration-20261009` after the Workflows permission update. The destination main branch is unchanged. Draft PR creation is blocked because listing pull requests returns HTTP 403 with `pull_requests=read` required; Pull requests read/write is still needed. No PR has been created or app published.
- Fully read and counted the supplied PostgreSQL archive without modifying it: 343 table definitions, 345 data sections, 1,113,287 rows and an unchanged SHA-256. This is an archive-validation pass, not a restore test.
- Reviewed Rogers Lakewood and Dellwood records privately. Rogers Lakewood's Main 27-hole layout contains red alternate tees on holes 1, 3 and 4 and separate alternate-basket data. The old 45-hole layout and incorrect course summary remain separate records. They have not been repaired or deleted.
- Inventoried all 146 objects in private Storage buckets (415,398,851 bytes). One course file (53,439,035 bytes) was preserved using the existing public-read policy and verified against archive metadata and its on-disk hash; 145 files still require authorized export. Nine enabled cron jobs are present, six with old Lovable endpoints. No job was activated or changed.
- Destination Google provider credentials are now configured, but the Auth return URL update returned HTTP 403. The original settings remain. The private destination database-connection file is prepared and still awaits the user's connection string.
- No remote schema/data restore, active database switch, public deployment, live payment or app-store submission was performed. Existing local test/build results remain valid for their recorded source fingerprint and do not establish deployed security.

## Base44 full-stack import and verification — October 9, 2026

This entry supersedes the earlier Base44 access blocker. The authenticated CLI verified Elite access in **Mike's Workspace** (`69f19bca9bb88d5af75fba89`). The newly created app had initially landed in the separate SmartCaddy workspace; moving app `6ac96e8c9295eff8becd8869` into Mike's Workspace restored sandbox access. No upgrade was required. The MCP connector remains scoped to the other workspace; the working CLI was used for the import.

- Preserved the original scaffold checkpoint, then imported and hash-verified 1,947 source files. The Base44 build retains TanStack server functions, APIs and Nitro Worker output. Private credentials, local environment files and database backups were excluded. The managed cloud preview received its required root Vite entry point; generated assets are in `.output/public`.
- Fixed a client/server import boundary in the tracker watchlist and moved the shared tracker label into a browser-safe module. Added the Base44 document bridge, explicit destination-only public configuration, server-only binding allowlist and protection against writing credentials to a temporary Worker filesystem. Added Wrangler for preview emulation.
- All **1,100 tests across 133 files**, sandbox/release-script checks, TypeScript, ordinary production build and Base44 full-stack build passed. The tested source fingerprint is `a222cff12c28a34ae39c08a99c6ae0b5d7d00c18539415e6364a3a68567ee4ad`.
- The actual cloud sandbox installed dependencies and built successfully. **16 cloud HTTP checks passed**: homepage/sign-in/course/admin page shells; unauthorized admin-connection read/write, checkout and billing-portal calls; cross-site mutation rejection; denial of a real private staging-file sentinel through direct and `/@fs` paths; browser configuration using only the dedicated Supabase target; and HTTP 503 for unconfigured Stripe/mobile-purchase webhooks. Sensitive function/API responses carry `private, no-store`.
- Course/admin routes first normalize their query parameters; the HTTP checks followed those same-origin redirects. The authenticated route guard runs in the browser. Browser automation failed to initialize in this session, so these checks do not establish hydration, Google sign-in, role-specific browser workflows or payment completion.
- The destination database connection file is still empty. Application data/Auth restore, the remaining 145 Storage files, Auth return URLs and private provider bindings remain outstanding. Existing source data and the running local app were preserved. No public app, live payment, production database cutover or store submission was performed.
