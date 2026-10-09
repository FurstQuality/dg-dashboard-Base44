# Design System Sweep — Consolidation Log

This log tracks the ChainLink design-system consolidation. Every change
below is additive or a like-for-like replacement; no page has been
rebuilt from scratch, no backend behavior touched.

## Foundations landed (this batch)

### Token layer (`src/styles.css`)

Additive — existing tokens are untouched. New tokens available as CSS
variables and (through `@theme inline`) as Tailwind utilities:

- Surface: `bg-canvas`, `bg-surface`, `bg-surface-raised`,
  `bg-surface-interactive`, `border-border-subtle`, `border-border-strong`.
- Accent: `text-brand-cyan`, `text-brand-teal`, `text-competitive-gold`,
  `text-community-green`, `text-coaching-violet` (plus `bg-*` /
  `border-*` variants).
- Status: `bg-success`, `bg-warning`, `bg-danger`, `bg-info` with
  `-foreground` pairs.
- Radii: `rounded-control` (10px), `rounded-input` (12px),
  `rounded-card` (16px), `rounded-pill`.
- Spacing scale documented as `--space-1..-9` on the
  4/8/12/16/20/24/32/40/48 rhythm for inline / JS use.
- Motion: `--motion-fast`, `--motion-base`, `--motion-slow`,
  `--ease-standard`, `--ease-emphasized`.
- Chart palette: `--chart-primary`, `-secondary`, `-tertiary`, `-accent`,
  `-neutral`, `-grid`, `-axis`, `-danger`. Existing `--chart-1..-5`
  aliases are preserved for callers that already use them.

### Shell primitives (`src/components/shell/`)

New folder, all additive. Existing routes still work; new work should
compose from here first:

- `PageShell` — canonical page frame (max-width, padding, spacing,
  optional backdrop).
- `PageHeader` — title / description / primary + secondary action /
  eyebrow / leading slot. Long titles wrap to two lines before truncating.
- `StatCard` — single-metric tile with 8 tone variants.
- `ContentCard` — titled general card with header action + footer.
- `ListCard` — titled card wrapping a compact row list with empty slot.
- `MascotIllustration` — the only component that turns a mascot intent
  into an image (aside from `CoachCallout`). Includes a `watermark`
  mode for section backgrounds.
- `CoachCallout` — mascot + short guidance card. Every callout must
  carry a real message; never decorative.
- `LoadingSkeleton` — shared skeleton with `card | list | stat-grid |
  table | text` variants matching the content shape.
- `ErrorState` — shared error surface with plain-language copy. Raw
  error strings never leak to the UI.

### Mascot registry (`src/lib/mascots.ts`)

Intent-based registry: `coach → Ace`, `scout → Scout`,
`athletic → Hyzer`, `social → Mulley Glow`, `official → Safe Mode Sam`,
`celebratory → Scramble Fox`. Feature code should ask for an intent, not
name a mascot by filename. Existing `MASCOTS` map (all 9 approved
characters) stays available for the theme studio and mascot picker.

## Components collapsed

- Deleted `src/components/empty-state.tsx` — legacy dashed empty state
  with zero call sites. Canonical: `src/components/ui/empty-state.tsx`.

## Kept intentionally

- The six `*-tabs.tsx` files export `HubTab[]` configs, not tab
  implementations. `HubTabs` is the sole renderer. Merging them into
  one file would obscure per-hub intent — no change.
- `Mascot` (low-level renderer) and `PageMascot` (route-aware banner
  that composes it) both stay. New callers use `MascotIllustration` /
  `CoachCallout` instead.

## Not yet migrated (planned follow-ups)

These items are on the plan but haven't landed. Doing them all in one
turn would create too large a diff to review safely — each hub gets
its own batch:

1. **Play hub route migrations** — `play.index.tsx`,
   `play.rounds.tsx`, `play.courses.tsx`, `play.practice.tsx`,
   `play.schedule.tsx`, `play.compete.*`, `play.manage.tsx` migrate to
   `PageShell` + `PageHeader`.
2. **Community hub route migrations** — `community.index.tsx`,
   `.friends.tsx`, `.trackers.tsx`, `.clubs.tsx`,
   `.events.index.tsx`, `.messages.tsx`.
3. **StatLink hub route migrations** — `statlink.index.tsx`,
   `.rounds.tsx`, `ratings-lab.tsx`, `.scoring.tsx`, `.courses.tsx`,
   `.coach.tsx`, `.compare.tsx`. Also swap chart hex codes to
   `var(--chart-*)` tokens in `ratings-lab.tsx` and `compare.tsx`.
4. **Profile & settings surfaces** — `me.tsx`, `me.index.tsx`,
   `me.bag.tsx`, `settings.imports.tsx`, `data-hub.tsx`,
   `notifications.tsx`.
5. **Feed / home surfaces** — `home.tsx`, `feed.tsx`. These are the
   most sensitive layouts (three-column feed); handle last, after the
   primitives have absorbed the shapes each column actually needs.
6. **Anti-AI cleanup pass** — replace the ~42 raw `text-white` /
   `bg-black` occurrences with token utilities (except the Google logo
   SVG on `auth.tsx`, which keeps its brand hex).
7. **Copy sweep** — audit for banned strings (`No data available`,
   `Operation successful`, `Entity created`, etc.) and replace with
   the disc-golf-aware voice.
8. **Responsive audit** — Playwright screenshots of the 12
   highest-traffic routes at 375 / 430 / 768 / 1024 / 1280 / 1440 /
   1920. Fix header overlap, tab wrap, chart clipping, and desktop
   dead space discovered along the way.

## Areas requiring backend follow-up

None from this batch. All work was styling, primitives, and dead-code
cleanup — no schema changes, no server function changes, no route ID
changes.

## Exceptions kept

- The Google logo SVG in `src/routes/auth.tsx` uses Google's brand
  hex values (#4285F4, #34A853, #FBBC05, #EA4335). That is correct
  brand usage and must not be tokenized.
- `me.bag.tsx` stores per-disc color via a color input; those values
  are user data, not theme choices, and stay raw hex.
- Recharts stroke/fill hex codes will migrate to `var(--chart-*)`
  tokens in the StatLink hub batch (item 3 above), not this batch.
