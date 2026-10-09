# DG Dashboard | SmartCaddy — Production Readiness

Living record of the production hardening sweep. Update this file whenever a
security posture decision, verification command, or residual risk changes.

## 1. Security posture

### Profile data (`public.profiles`)

Private columns are revoked from the `authenticated` role at the column level,
so one signed-in member cannot read another member's private data even though
profiles are publicly readable:

- `ics_feed_token` — private calendar feed URL. Server-only. Read with
  `supabaseAdmin` in `src/lib/calendar-sync.functions.ts` and the public ICS
  route `src/routes/api/public/calendar.$token.ts`.
- `notification_prefs`, `privacy_prefs` — read for the verified caller only in
  `getMyPrefs` (`src/lib/platform-config.functions.ts`) via `supabaseAdmin`.

Client-side profile reads MUST use `PROFILE_COLUMNS` from
`src/lib/current-user.ts`. **Never `select("*")` on `profiles`** — it expands to
the revoked columns and fails with a permission error.

### SECURITY DEFINER functions

`public.assert_self_or_admin(uuid)` allows the current user, an admin, a super
admin, or a server/internal call. `get_effective_tier` and `has_feature` call it,
so a signed-in user can no longer pass an arbitrary `user_id` and read another
member's entitlements.

Execution grants were revoked from `anon` and from `authenticated` on every
function that is only reached from a trigger or from server code. The 17
remaining "signed-in users can execute SECURITY DEFINER function" linter
warnings are **intentional and required**: they are RLS predicate helpers
(`has_role`, club/conversation/round membership checks) and caller-scoped
RPCs the app calls directly (`consume_feature`, `feature_limit`,
`get_effective_tier`, `get_my_data_health`, `find_duplicate_courses`,
`friend_suggestions`, PDGA knowledge-base search/stats). Each sets
`search_path` and either scopes to `auth.uid()` or exposes only public
reference data. Revoking them would break RLS evaluation and the app.

### Admin authorization

Admin writes are enforced in the database, not the UI. `subscription_tiers`,
`feature_flags`, `tier_features`, `subscriptions`, `entitlement_overrides`, and
`beta_program` all carry `ALL` policies gated on
`has_role(auth.uid(), 'super_admin')`; `beta_feedback` is owner-or-super-admin.
Server functions that perform privileged work (`mock-data`, `course-import`,
`creator-studio`, `disc-library`, `billing`, `pdga-kb`,
`course-rating-profiles`) re-check `has_role` before acting.

### Secrets

`SUPABASE_SERVICE_ROLE_KEY` is referenced only in server-only paths. No
`client.server` module is statically imported from a `.functions.ts` or `.tsx`
file — privileged clients are loaded with `await import(...)` inside handlers so
they cannot leak into a browser bundle.

## 2. Consistency

- Every content route defines `head()` with a unique title in the
  `[Page] · DG Dashboard` form plus description and Open Graph/Twitter tags.
  Redirect stubs and `<Outlet />` layouts intentionally have none.
- Page bodies mount inside `PageShell` (`src/components/shell/page-shell.tsx`)
  or a section shell that wraps it, so max-width, padding, and section spacing
  move in lockstep. The only deliberate exception is the fullscreen scoring
  route `play/$roundId`.

## 3. Verification

```bash
bunx tsgo --noEmit     # types
bunx vitest run        # unit tests (also: bun run test)
bun run lint           # eslint
bun run build          # production build
```

Browser verification uses Playwright against `http://localhost:8080` with the
sandbox Supabase session restored; `/home`, `/settings/privacy`,
`/settings/notifications`, and `/tournaments/new` render with zero console
errors after the profile column-grant change.

Dependency posture: `security--dependency_scan` reports no high or critical
severity vulnerabilities. CSV parsing uses PapaParse and XLSX uses
`read-excel-file`; the vulnerable `xlsx` package is not a dependency.

## 4. Residual risks

- The course directory (`searchCourseDirectory`) and disc catalog both paginate
  server-side with exact counts and `.range(...)`. The unified event library now
  pushes its coarse date window and any search of three or more characters down
  to Postgres (`src/lib/events-library.ts`) and caps every source read
  (tournaments 300, leagues 200, community 500, imported schedules 500). Facet
  counts, grouping, column selection, and page slicing remain in the browser
  over that bounded set; when a source returns exactly its cap the page tells the
  player to narrow instead of showing a silently partial library. True
  offset pagination across the merged sources is still future work.
- `/events` with no filters defaults to upcoming events in the player's home
  state, and falls back once to the national view when that state has nothing
  scheduled, so the default view is never empty when events exist.
- Admin queues are bounded via `ADMIN_LIMITS` in `src/lib/admin-queries.ts`
  (course rating review 200 oldest-first, creator applications 200, field
  registry 500). A backlog beyond those bounds needs explicit pagination.
- PDGA / UDisc / DGCR ingestion depends on third-party HTML and JSON shapes.
  Parsers fail soft (fields stay null and the UI shows "Course TBD" style
  fallbacks) rather than writing guessed data, but they need re-checking when an
  upstream site changes.
- End-to-end Playwright coverage is route smoke plus interaction checks:
  `e2e/smoke_critical_flows.py` (24/24 signed-in routes) and
  `e2e/critical_interactions.py` (8/8 flows: round start entry, course ->
  scoring dialog, tournament and league wizards, tracker crew tabs, event
  library, pricing tiers, DGIM shell), plus `e2e/mutation_flows.py` (2/2 flows:
  StatLink goal create -> verify -> delete, tracker watchlist track -> verify ->
  untrack). The first two are read-only; the mutation script only exercises
  owner-scoped writes it can reverse in the same run, so it leaves no residue.
  Irreversible paths (round submission, tournament creation, registrations)
  remain covered by unit tests only, by design.

## Bundle hygiene (continued sweep)

- Shared course-feature contracts (`DbFeature`, `featureAppliesToHole`,
  `featureIsCourseWide`, `CourseFeatureType`) now live in `src/lib/course-features.ts`,
  which imports no mapping libraries. Tee-sign and course-detail pages import from
  there, so Leaflet/react-leaflet no longer enter non-map bundles.
- `CourseDirectoryMap` is lazy-loaded behind `Suspense` on `/courses`, matching the
  existing lazy pattern used by the course builder and course detail map.
- Verification: `bunx tsgo --noEmit`, `bunx vitest run` (17 tests), `bun run build`,
  plus Playwright load checks of `/courses` and `/courses/explorer` with zero
  console errors.
- Notification badge polling (`src/lib/use-unread-notifications.ts`) now tolerates
  request aborts during navigation instead of logging an unhandled fetch error.
- Responsive sweep: `/home`, `/play`, `/community`, `/statlink`, `/courses`,
  `/events`, `/messages`, `/bag`, `/schedule` verified at 375px and 1280px with no
  horizontal overflow.
- Database performance review: `courses`, `disc_molds`, `tracker_event_rounds`, and
  `tracker_live_scores` carry indexes matching their hot filters (name trigram,
  city/state, match key, event/round, member). Remaining unindexed foreign keys are
  on tables under a few hundred rows, where a sequential scan is cheaper than an
  index; revisit if those tables grow.
- Supabase linter after these changes: 17 issues, all the documented intentional
  SECURITY DEFINER baseline above. No new findings.
- Regression tests now cover pool-aware round/course resolution, combined
  venue + layout labels, and tee-row de-duplication
  (`src/lib/__tests__/tracker-rounds.test.ts`) — the tracker logic behind the
  Ledgestone pool-split course misreports. Suite: 29 tests across 4 files.

## Metadata + route hygiene (continued sweep)

- Audited every route file for `head()` metadata. All 40 files without it were
  verified: 37 are legacy redirect stubs (`/feed`, `/insights`, `/statlink/*`,
  `/play/*`, `/tournaments`, `/leagues`, `/tracker`, `/data-hub`, `/import`, …)
  or pathless layouts, which intentionally carry no metadata. The only real
  content route missing it, `/settings/platform`, now has title, description,
  and Open Graph tags on the `[Page] · DG Dashboard` convention.
- `data-hub.tsx` and `import.tsx` were redirect stubs still carrying ~1,300
  lines of page code that other routes imported across the route boundary
  (breaking code splitting). The panels moved to
  `src/components/imports/data-hub-panel.tsx` and
  `src/components/imports/import-rounds-panel.tsx`; `/settings/imports` and
  `/stats` import from there, and the route files are now pure redirects.
- Fixed a conditional `useMemo` in `src/components/td-live-scoring.tsx`
  (`react-hooks/rules-of-hooks`) — hole-completion memoization now runs before
  the empty-state early return, so hook order is stable across renders.
- Lint status: `bun run lint` reports zero `react-hooks/rules-of-hooks`
  violations. The remaining count is dominated by repo-wide `prettier/prettier`
  formatting differences that predate this sweep; reformatting ~19k lines would
  produce an unreviewable diff with no runtime effect, so it was deliberately
  not done. Substantive remaining rules are advisory
  (`no-explicit-any`, `exhaustive-deps`, `react-refresh/only-export-components`).
- Verification: `bunx tsgo --noEmit`, `bunx vitest run` (29 tests, 4 files),
  `bun run build`, and Playwright loads of `/settings/imports`, `/stats`, and
  `/settings/platform` with an authenticated session — zero console errors.

## Phase 4–5 continuation (2026-08-30)

- **Realtime hygiene**: all 8 realtime subscription sites use unique channel names and tear down with `removeChannel`. `use-progress.tsx` and `use-community-badges.ts` now use the shared `channelNonce()` helper instead of inline `Math.random()`.
- **Pagination audit**: the high-row surfaces are already server-paginated — `searchCourseDirectory` (exact count + `range`), `searchMolds` (limit/offset + count), map pins batched at 1,000/request, disc trends and DGCR caches explicitly limited. No unbounded fetch of `courses`, `disc_molds`, or `dgcr_courses` remains in client paths.
- **Scheduling bug fixed**: `parseTeeTime` in `src/lib/tournament-knowledge.ts` rejected the canonical `HH:MM:SS` tee-time format the app stores, so travel-gap and same-day conflict checks silently fell back to an assumed 9:00 AM start. It now accepts optional seconds and single-letter AM/PM, so conflicts are evaluated against real posted tee times.
- **Tests**: added `src/lib/__tests__/tournament-knowledge.test.ts` (8 tests) covering posted vs assumed starts, league/flex windows, and conflict severity. Suite is 37 tests across 5 files, all passing.

## Phase 2 + 5 continuation (2026-08-30)

- **Dead-end sweep (Phase 2.1)**: scanned every `<Button>` in `src/` (1,400
  occurrences) for a missing handler, then filtered by surrounding context for
  `Link` / `*Trigger` / form wrappers. Every remaining hit was a false positive
  (multi-line props, shadcn primitives, react-email templates, or a button
  passed as a dialog `trigger`). No player-facing control is unwired. The only
  intentionally unimplemented surface is `api/public/iap-webhook`, which returns
  `501` and records `IAP verification not implemented yet` rather than silently
  accepting a purchase.
- **Rating correctness fix**: the PDGA outlier rule was implemented two
  different ways. `rating-projection.ts` used the documented PDGA rule (a round
  is dropped only when it is BOTH >100 points and >2.5σ below the mean, so the
  cutoff is `mean - max(100, 2.5σ)`), while `rating.ts`,
  `stats/rating-engine.ts`, and `stats/rating-engines.ts` used the stricter
  `mean - min(100, 2.5σ)` and dropped legitimate rounds for players with a wide
  score spread. All four now use the PDGA rule, so DGD Rating, the player
  profile estimator, and Statboard agree on the same number.
- **Tests**: added `src/lib/__tests__/rating-projection.test.ts` (14 tests —
  eligibility filtering, 365-day vs 24-month window selection, outlier
  retention, recency double-weighting, breakdown/rating agreement, doubles
  exclusion, blended fallback) and `src/lib/__tests__/import-detect.test.ts`
  (9 tests — PDGA numbers, player/event URLs, UDisc / Disc Golf Scene /
  Facebook hosts, scheme-less hosts, free text, CSV vs unsupported uploads).
- **Verification**: `bunx vitest run` → 60 tests across 7 files passing;
  `bunx tsgo --noEmit` clean; `bun run build` succeeds.

## Phase 1.3 — admin authorization audit (2026-08-30)

Every admin surface was checked for server-side (not UI-only) enforcement:

- Server-function paths already re-check the role in the handler via
  `has_role(...)`: disc library refresh, mock data seeding, billing overrides,
  course rating profiles, PDGA knowledge base, entity field editor and revert
  queue, creator applications, and platform config save.
- Admin screens that write directly through the browser client
  (`/admin/beta`, `/admin/features`, `/admin/tiers`, `/admin/moderation`) are
  enforced by RLS: `beta_program`, `feature_flags`, `subscription_tiers`, and
  `tier_features` all restrict every write to
  `has_role(auth.uid(), 'super_admin')`; `beta_feedback` is owner-or-super-admin.
  The UI role check is defence in depth only.
- **Privilege gap found and fixed**: the `courses` update policy allowed
  `auth.uid() = created_by`, so a submitter could set their own course's
  `moderation_status` to `approved` and bypass moderation entirely (or reassign
  `created_by`). Added the `enforce_course_moderation_guard` BEFORE UPDATE
  trigger: for a non-super-admin caller it restores the previous
  `moderation_status` and `created_by`, leaving normal content edits intact.
  Server credentials (no JWT) and super admins are unaffected.
- Linter after the migration: still exactly the 17 documented, intentional
  signed-in `SECURITY DEFINER` warnings — the new guard function is revoked from
  `PUBLIC`, `anon`, and `authenticated` and is only reachable as a trigger.

### Consolidation (same day)

The earlier `enforce_course_moderation_guard` trigger duplicated the existing
`enforce_course_moderation` trigger on `public.courses`. The two were merged
into `enforce_course_moderation`, which now also pins `created_by` on update
and explicitly treats credentials without an end-user JWT (service role /
maintenance jobs such as bulk course imports and approvals) as privileged, so
those pipelines keep working. `EXECUTE` is revoked from `PUBLIC`, `anon`, and
`authenticated`; the function is reachable only as a trigger. Linter after the
change: unchanged at the 17 documented, intentional signed-in
`SECURITY DEFINER` warnings — no new finding introduced.

## Phase 5.2 — end-to-end smoke suite (2026-08-30)

Added `e2e/smoke_critical_flows.py`, a repeatable Playwright smoke run over the
authenticated app. It restores the signed-in preview session, then for each
critical surface asserts the document status is < 400, that no error boundary
rendered, and that expected real content is present; console errors are
reported per route. Run with `python3 e2e/smoke_critical_flows.py`
(`SMOKE_BASE_URL` overrides the target).

Surfaces covered: home feed, Play hub, rounds, tournament wizard, league
wizard, crew tracker, event library, StatLink, Statboard, course builder,
course directory, pricing/tiers, messages, settings.

Findings from the first run, now fixed in the suite itself: the earlier
manual walkthrough had been checking `/dashboard` and `/rounds/new`, neither of
which exists — both silently returned the 404 page. The suite now asserts HTTP
status so a missing route cannot pass again. No application route returned a
404 or an error boundary; all 14 surfaces pass. The only console noise left is
the already-documented `getUser` fetch aborted by rapid navigation, plus one
React "state update before mount" warning that appears only when a page is
navigated away from mid-load and does not reproduce on a direct visit.

## Phase 1.5, 3, 4.2 closeout (2026-08-30)

### Dependency scan (Phase 1.5)
`dependency_scan` reports **no high or critical severity advisories**. The
project uses PapaParse for CSV and `read-excel-file` for XLSX; the vulnerable
`xlsx` package is not a dependency.

### Route metadata (Phase 3.2) — complete
Audited all 126 files under `src/routes/_authenticated/`. Every content route
defines `head()` with a route-specific title/description/og pair. The 37 files
without `head()` are `throw redirect` shims (legacy URL preservation) plus two
pathless layout routes (`community.tsx`, `statlink.tsx`) that only render
`<Outlet />` — metadata belongs to their leaves, not to them.

Proof: `for f in src/routes/_authenticated/*.tsx; do rg -q 'head:' "$f" || echo "$f"; done`
then classify each hit with `rg -q 'throw redirect'`.

### PageShell coverage (Phase 3.1) — complete
88 non-redirect routes. Every one mounts inside the canonical shell, directly or
through a section layout:
- `settings.*` and `studio.*` leaves render inside `settings.tsx` / `studio.tsx`,
  which wrap `<Outlet />` in `PageShell`.
- Community routes (`community.*`, `clubs.*`) use `CommunityShell`, which wraps
  `PageShell section="community"`.
- `courses.*` routes are `lazy()` shims around page components that use
  `PageShell` themselves.
- Deliberate exceptions: `play.$roundId` (fullscreen Round Companion — no page
  chrome by design) and `home.tsx` (three-column feed that owns its own grid).

### Token + icon compliance (Phase 3.4)
`lucide-react` is the only icon library in `src/` (no `react-icons`,
`@heroicons`, `@tabler/icons`). Remaining `text-white` / `text-black` /
`bg-black` occurrences (64) were reviewed individually and are all legitimate:
contrast text painted on a user-chosen crew swatch colour, `print:` variants in
the caddy guide, video letterboxing in the flythrough player, and overlay text
on the share-card image. The one decorative emoji in
`tournament-share-panel.tsx` was replaced with a `MapPin` icon; the emoji that
remains is inside generated share **caption text**, not UI chrome.

### Chart bundle split (Phase 4.2)
Recharts core was being hoisted into the shared vendor chunk because five route
chunks import it, so every page paid for it. `vite.config.ts` now assigns
`recharts` and `victory-vendor` to a dedicated `charts` chunk.

| Chunk | Before | After |
| --- | --- | --- |
| shared vendor `index-*.js` | 876 KB | 504 KB |
| `charts-*.js` (on demand) | — | 403 KB |

Analytics surfaces (Statboard, Compare, Rating Studio, Studio analytics, round
importer) fetch the chart chunk on navigation; every other page no longer loads
it. Leaflet, the course directory map, the course builder, tee signs, and the
home feed widgets were already `lazy()`-loaded. There is no Three.js dependency
— the flythrough player is video-based.

Proof: `bun run build` then `ls -S dist/client/assets/*.js | head`.
Typecheck (`bunx tsgo --noEmit`) and 60 Vitest tests across 7 files pass.

### Lint triage (Phase 5.3)
`bunx eslint .` reports 19,712 errors, of which **19,438 are
`prettier/prettier`** whitespace diffs across the whole repository. Repo-wide
reformatting is deliberately out of scope for this sweep: it would rewrite
almost every file and bury real review signal. The non-formatting findings were
triaged individually:

| Rule | Before | After | Action |
| --- | --- | --- | --- |
| `prefer-const` | 13 | 3 | Auto-fixed 10; the 3 left are `let` bindings declared before a closure assigns them (`auth-flow.ts`) or live in auto-generated `previewAuthStorage.ts`. |
| `no-empty` | 3 | 0 | Documented each intentional swallow (localStorage quota, decorative confetti). |
| `@next/next/no-img-element`, `jsx-a11y/alt-text`, `react/no-danger` | 7 | 0 | Dead `eslint-disable` directives naming rules this config never loads; removed. |
| `no-useless-escape` | 43 | 43 | All are escaped `-` / `/` / `"` inside regex character classes in the PDGA and UDisc parsers. Behaviour-neutral but edit-risky, so left as-is by choice. |
| `@typescript-eslint/no-explicit-any` | 228 | 228 | Pre-existing; concentrated at untyped third-party scrape/HTML boundaries. Tracked, not blocking. |

Warnings (119) are `react-refresh/only-export-components` and
`react-hooks/exhaustive-deps`; both were reviewed as non-blocking.

Proof: `bunx eslint . -f json`, `bunx tsgo --noEmit`, `bunx vitest run`
(60 tests / 7 files), `bun run build` — all re-run after these changes.

## Phase 5.2 — End-to-end smoke coverage (2026-08-30)

`e2e/smoke_critical_flows.py` is the signed-in Playwright smoke run. It restores
the preview Supabase session, walks each critical surface, asserts the real page
shell rendered (not an error boundary or a 404), and records console errors.

Coverage expanded from 14 to 24 surfaces, adding the sections built after the
original sweep: Event Director (`/director`, `/director/registrations`), DGIM
(`/dgim`), Friends Arena (`/arena`), Friends, Community, Clubs, Schedule,
StatLink Goals (`/stats?tab=goals`), notification settings (quiet hours) and the
Beta hub.

Result: 24/24 routes render, zero blocking console errors, exit code 0. The
Goals entry was corrected — goals are a StatLink tab, not a standalone `/goals`
route, which the previous run reported as a 404.

### Profile column protection (Phase 1.2) — verified closed
`has_column_privilege` confirms `notification_prefs`, `privacy_prefs`, and
`ics_feed_token` are readable by neither `anon` nor `authenticated`; `location`
and `home_state` are authenticated-only; `pdga_number` stays public (it is
public PDGA data used by public player pages). Own-profile preferences are read
server-side only.

Proof: `python3 e2e/smoke_critical_flows.py` (exit 0), `bunx tsgo --noEmit`,
`bunx vitest run` (205 tests / 24 files).
