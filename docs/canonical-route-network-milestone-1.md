# Canonical Route Network - Milestone 1

## Scope

This milestone starts the Course domain migration without adding a parallel Course V2 schema. The current codebase already has the main canonical pieces:

- `course_holes`, `course_tees`, and `course_baskets` for physical course assets.
- `course_tee_sets` plus `hole_tees.route_mode` and `hole_tees.flight_path` for extra tee fairway behavior.
- `hole_baskets.split_point` for alternate basket branches.
- `layout_slots` and `layout_versions` for layout recipes that reference course assets.
- event layout-version pins in the event chain migrations.

The first implementation therefore adds a pure route-network resolver around the existing physical model. It can be adopted by Course Studio, public maps, tee signs, caddy books, and scoring without forcing an immediate database rewrite.

## Added

- `src/lib/course-builder/route-network.ts`
  - Resolves every active tee to every active basket on a physical hole.
  - Reuses shared fairway segments after tee merges.
  - Reuses basket branches after basket split points.
  - Reports missing pairings when a default route cannot be derived safely.
  - Supports explicit tee-to-basket route overrides for safari or independent routes.

- `src/lib/course-builder/route-network.test.ts`
  - Adds a Rogers Lakewood style fixture for Blue/Red tees and A/C baskets.
  - Verifies four playable pairings: Blue to A, Blue to C, Red to A, Red to C.
  - Verifies the merged trunk is a single shared segment used by all four pairings.
  - Verifies the C basket branch is shared by both tee pairings.
  - Verifies missing-route cases are surfaced instead of pretending a straight line is complete.
  - Verifies explicit overrides can complete unusual pairings.

## Why No Schema Migration Yet

No new database migration was added in this milestone. The current schema already contains the physical route inputs needed to prove the domain behavior. Adding route tables before reconciling live Rogers Lakewood records could create exactly the kind of duplicate course truth this phase is meant to eliminate.

The next database step should be additive only after inspecting live data:

1. Reconcile Rogers Lakewood physical asset counts and route geometry from the current canonical tables.
2. Identify any remaining layout-owned or legacy route/fairway geometry.
3. Decide whether persisted route segments are needed, or whether they can be derived from canonical tee/basket/fairway fields and published layout versions.
4. If persistence is needed, add it behind RLS with explicit table grants, named roles, `(select auth.uid())` policy checks, and security-advisor review.

## Migration Plan

1. Wire `buildHoleRouteNetwork` into Course Studio map preview behind the current UI, initially read-only.
2. Replace route completeness counters with route-network completeness:
   - physical course status counts physical holes, tees, baskets, and canonical route pairings;
   - layout readiness counts selected layout slots only.
3. Use Rogers Lakewood as the regression course:
   - compare Course Studio and legacy editor entry points;
   - confirm they resolve the same course ID, physical assets, route geometry, and feature counts;
   - verify layout changes do not change physical course completeness.
4. Deprecate duplicate Course Builder/Edit Course paths after all consumers share the same course-domain read layer.
5. Only then add database persistence for route segments if derived routes are insufficient for event snapshots, signage, or mobile scoring.

## Deployment Note

Base44 can remain a deployment target, but this repository should become the source of truth: code, migrations, fixtures, route behavior, security policies, and tests all live here first. App-store packaging should consume this engineered app rather than becoming another place where product logic is defined.

## Codex Continuation: Baseline Stabilization

- Removed the Zod 3 router adapter; the four affected routes now pass their Zod 4 schemas directly to TanStack Router, preserving defaults and invalid-value fallbacks.
- Regenerated the stale npm lockfile and verified a standard clean install without legacy peer resolution. Applied compatible dependency security updates afterward.
- Fixed section navigation for query/hash URLs, including `/courses?add=1` and `/courses?studio=...`.
- Fixed route identity when the main tee or basket is inactive. Active unplaced assets now remain in required pairing counts. Overrides must contain a finite path connecting the chosen tee and basket.
- Verification: 100 test files, 892 tests passed; TypeScript no-emit check passed. Route-network coverage is now 11 tests.

### Integration Gates

The current `TeeRoutes` renderer supports a tee merging into another tee's entry or independent route. The new resolver currently projects joins onto the main trunk. It also works on unsmoothed geometry while the current renderer snaps to a smoothed line. Replacing the renderer before reconciling those behaviors would risk changing existing fairways. Keep the resolver out of production readiness decisions until these cases have fixtures and matching behavior.

The Rogers-style fixture is synthetic, not a verified export of Rogers Lakewood Park. Live course assets, layout references, and geometry still require reconciliation. No database writes, migrations, live RLS tests, or database security-advisor checks were performed in this continuation.

### Remaining Build and Security Work

- Production build fails in `@lovable.dev/mcp-js` during config resolution: the plugin compares Vite's forward-slash root with a Windows-native path. Existing MCP endpoint files are present; preserve their behavior while resolving the plugin dependency.
- Production dependency audit after compatible fixes reports three entries: two high entries in the Lovable MCP/SDK dependency chain, and one low esbuild entry. The full audit also reports moderate development-tool advisories in the Drizzle/esbuild chain. Audit results are dependency findings, not proof of application exploitability.
- No browser or authenticated workflow verification was completed because the build/startup plugin remains blocked.
- Hosting and native app-store packaging remain unverified; the deployment note above is an architectural intention, not confirmation of Base44 support.

### Next Controlled Milestones

Local-preview update: removing the build-time MCP generator resolved the Windows build failure while retaining committed runtime endpoints. The optional auth-email webhook now initializes only on request, so missing email credentials do not prevent app startup. A configured webhook still delegates verification to the SDK. The production build and 894 tests pass; browser verification reached the sign-in and signed-in Play screens at port 5180. Supplied public Supabase settings are in ignored local configuration. Lovable asset URLs still show missing images and the Play league listing failed; neither authenticated course editing nor database security has been verified yet.

1. Resolve local build portability while preserving MCP endpoints; verify a browser preview and supported dependency versions.
2. Match existing tee-to-tee joins and smoothing in the route resolver, then add a read-only Course Studio consumer with parity tests.
3. Reconcile live Rogers Lakewood assets and all legacy course/editor reads before consolidating the shared course data layer or changing persistence.
4. Audit immutable layout publication, event version pins/overlays, canonical scoring rounds, and permission enforcement in that order. Add database tests for each boundary before changing it.

### Local migration verification — October 8, 2026

- Local Vite development now loads server environment variables without exposing them through browser defines or replacing host-provided values. The directory reads 12,466 real course entries and 12,465 mapped courses. A map failure displays a retry action and falls back to the library search instead of presenting an empty map result as an empty directory.
- Google sign-in calls Supabase OAuth directly and retains the public callback and remembered destination. Provider rejection now produces an accurate failure message and clears callback parameters. The real authorization endpoint still reports `Unsupported provider: missing OAuth secret`; full Google sign-in remains blocked on provider configuration.
- Materialized all 19 approved mascot originals under `src/assets/mascots/`, verified against their recorded size and image signature, and changed the shared registry to Vite asset imports. Original `.asset.json` provenance remains untouched. All 19 images decode in the local browser without Lovable's asset proxy.
- Directory filter normalization retains the `studio` course ID. A real course Studio deep link survives direct navigation and refresh, and Back to courses returns to the directory. Protected routes preserve their original destination when redirecting to sign-in.
- The feature-registry generator runs on Windows with explicit UTF-8 reads/writes and portable paths. Regenerated the inventory from source: 235 routes. Registry `LIVE` status describes route presence, not verified production readiness.
- Pinned the MCP SDK to 1.32.1 under the existing Lovable MCP package using matching npm/pnpm overrides. Production dependency audit now reports zero high/critical findings and one low esbuild finding. MCP discovery still returns its Supabase issuer, and unauthenticated tool-list requests still return 401.
- Verification: 102 test files / 901 tests passed; TypeScript no-emit and production build passed. Browser checks passed for directory cards, populated clusters, search, simulated map failure/retry, Studio reload/back navigation, and desktop (1440px) / phone (390px) image rendering without horizontal overflow.
- Browser rendering checks used an isolated, test-only route guard with no authenticated session and real public reads. Production guards were not disabled. These checks do not certify authenticated saves, event operations, scoring writes, or deployment. No database writes, migrations, commits, or pushes were performed.
- The league calendar's underlying date-window query responded successfully through the anonymous Data API with no rows for October 8. A signed-in league-feed regression check is still required; an empty anonymous result does not establish signed-in availability.
