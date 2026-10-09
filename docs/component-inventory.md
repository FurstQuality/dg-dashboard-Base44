# ChainLink Component Inventory

Snapshot of the component surface after the design-system consolidation
sweep. Read this before adding a new primitive — if the shape you want
already exists, extend it instead of duplicating.

## Canonical (use these; don't fork)

### Global chrome
- `src/components/app-shell.tsx` — global header + right-cluster utilities
  (Ask Ace · Notifications · Progress · Personalization · Profile). Only
  place primary nav is defined.
- `src/components/route-boundaries.tsx` — error + not-found surfaces for
  every route.

### Page composition (shell primitives)
- `src/components/shell/page-shell.tsx` — max-width, page padding,
  section spacing, optional low-opacity backdrop.
- `src/components/shell/page-header.tsx` — title, description, primary /
  secondary actions, eyebrow, leading slot.
- `src/components/shell/stat-card.tsx` — single-metric tile with tone
  variants (`neutral`, `primary`, `gold`, `green`, `cyan`, `violet`,
  `warning`, `danger`).
- `src/components/shell/content-card.tsx` — general titled card with
  optional header action and footer.
- `src/components/shell/list-card.tsx` — titled card wrapping a compact
  row list, with an empty-slot fallback.
- `src/components/shell/coach-callout.tsx` — mascot + short guidance
  message (Ask Ace, coaching tips, encouragement).
- `src/components/shell/mascot-illustration.tsx` — the ONLY component
  that turns a mascot intent into an image (aside from `CoachCallout`).
- `src/components/shell/loading-skeleton.tsx` — shared skeleton
  treatments matching the content shape they replace.
- `src/components/shell/error-state.tsx` — shared error surface. No raw
  error strings ever surfaced from here.

### Section navigation
- `src/components/hub-tabs.tsx` — sticky pill subnav shared by every hub.
  Renders a `HubTab[]` config.
- `src/components/hub-tab-bar.tsx` — resolves the active hub by pathname
  and renders the right tab set.
- Tab configs (thin `HubTab[]` exports, not implementations — KEEP):
  - `src/components/insights-tabs.tsx`
  - `src/components/me-tabs.tsx`
  - `src/components/play/play-subnav.tsx`
  - `src/components/statlink/statlink-subnav.tsx`
  - `src/components/community/community-subnav.tsx`
  - `src/components/compete-tabs.tsx`
  - `src/components/data-tabs.tsx`
  - `src/components/practice-tabs.tsx`

### shadcn primitives (canonical low-level UI)
`src/components/ui/*` — button, badge, card, tabs, dialog, drawer, table,
tooltip, breadcrumb, context-menu, skeleton, alert, avatar, chart,
input, select, checkbox, sheet, popover, dropdown-menu, calendar,
progress, radio-group, slider, switch, textarea, empty-state, and
so on. Never fork a shadcn primitive; extend via variants.

### Mascot registry
- `src/lib/mascots.ts` — single source of truth for intent → mascot →
  asset. Only `MascotIllustration` and `CoachCallout` consume this.
- `src/components/mascot.tsx` — low-level `<Mascot>` renderer + the full
  9-character asset map used by `MASCOTS_BY_INTENT`.

### Dashboards & widgets
- `src/components/dashboard-grid.tsx` — customizable widget grid used by
  Home / Play / StatLink overviews.
- `src/components/home/*` — feed-side widgets (profile mini card,
  discovery feed, suggested crew, upcoming schedule, feed filter bar).

### Feature-specific surfaces (canonical for their domain)
- Scoring / rounds: `start-round-dialog.tsx`, `scoring-breakdown.tsx`,
  `gps-hole-tracker.tsx`, `offline-scoring-badge.tsx`.
- Course builder & courses: `course-features-map.tsx`,
  `course-flythrough.tsx`, `course-layouts-manager.tsx`,
  `course-picker.tsx`, `course-reviews.tsx`, `hole-media-gallery.tsx`.
- Tournaments / leagues / TD: `tournament-wizard.tsx`,
  `tournament-share-panel.tsx`, `tournament-caddy-guide.tsx`,
  `past-event-results-dialog.tsx`, `league-wizard.tsx`,
  `td-checklist.tsx`, `td-live-scoring.tsx`.
- StatLink: `statlink/*` — intelligence strip, calculation drawer,
  rating lifecycle panel, round database, skill engine, target simulator.
- Community: `community/*` — shell, subnav, contact sync,
  crew invite/list, external chat links, PDGA friend finder.
- Import / data hub: `import/add-data-modal.tsx`,
  `import/review-needed-panel.tsx`.
- Tracker: `tracker/crew-calendar.tsx`.

## Duplicates removed this sweep

- `src/components/empty-state.tsx` — DELETED. Legacy dashed-border card
  with zero call sites. Canonical: `src/components/ui/empty-state.tsx`.

## Kept intentionally (not duplicates)

- `src/components/mascot.tsx` **and** `src/components/page-mascot.tsx` —
  `Mascot` is the low-level renderer; `PageMascot` is a route-aware
  banner that composes it. Both are used and both stay. New callers
  should prefer `MascotIllustration` / `CoachCallout` from
  `src/components/shell/`.
- The six `*-tabs.tsx` files — each exports a `HubTab[]` config, not a
  fresh tab implementation. `HubTabs` is the sole renderer. Merging the
  configs into one file would only obscure their per-hub intent.

## Needs migration (planned, not yet done)

Route bodies that still hand-roll `mx-auto max-w-* px-* space-y-*` and
their own header markup. Each should adopt `PageShell` + `PageHeader`
in a follow-up batch:

- `home.tsx`, `feed.tsx`
- `play.index.tsx`, `play.rounds.tsx`, `play.courses.tsx`,
  `play.practice.tsx`, `play.schedule.tsx`, `play.compete.*`,
  `play.manage.tsx`
- `community.index.tsx`, `community.friends.tsx`,
  `community.trackers.tsx`, `community.clubs.tsx`,
  `community.events.index.tsx`, `community.messages.tsx`
- `statlink.index.tsx`, `statlink.rounds.tsx`, `ratings-lab.tsx`,
  `statlink.scoring.tsx`, `statlink.courses.tsx`, `statlink.coach.tsx`,
  `statlink.compare.tsx`
- `me.tsx`, `me.index.tsx`, `me.bag.tsx`,
  `settings.imports.tsx`, `data-hub.tsx`, `notifications.tsx`

Chart color values in `ratings-lab.tsx`, `compare.tsx`, and the tracker
routes still reference raw hex — swap to `var(--chart-*)` tokens as part
of the same migration.

## Anti-AI cleanup still open

- 42 `text-white` / `bg-black` occurrences in feature code — replace
  with `text-foreground` / `bg-background` (Google logo SVG on
  `auth.tsx` keeps its brand hex).
- Dashed empty-state borders inside feature components — all empty
  surfaces should render through `EmptyState` from
  `src/components/ui/empty-state.tsx`.

Cross-reference `docs/design-system-sweep.md` for the migration log.
