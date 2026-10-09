# Mobile Optimization Changelog

Living log of the mobile-first optimization pass. Plan lives in `.lovable/plan.md`.

## Phase 0 — Audit + tooling
- Established changelog + plan.
- Documented viewport matrix: 320, 360, 375, 390, 412, 430, 768, 820, 1024 across iOS Safari, Android Chrome, installed PWA, portrait + landscape.

## Phase 1 — App shell + safe areas + collision fixes
- `src/components/app-shell.tsx`
  - Root wrapper switched from `min-h-screen` to `min-h-dvh` so mobile browser chrome doesn't clip the bottom viewport.
  - Global header now reserves `env(safe-area-inset-top)` — no notch overlap on iOS.
  - Ask Ace mobile FAB raised to `calc(safe-area-inset-bottom + 4.25rem)` and shifted to `right-3`, so it clears the redesigned bottom nav and never sits over primary CTAs. Kept as the single dominant mobile FAB.
  - Bottom navigation rebuilt:
    - `grid grid-cols-5` — no horizontal scroll, every hub always visible.
    - Minimum touch target `min-h-11` (44px), 11px labels, `leading-none` for legibility.
    - Active state now shows a top indicator bar in addition to color (WCAG 1.4.1 — information not by color alone).
    - `aria-current="page"` on the active item; unread badges spoken via `aria-label`.
    - `paddingBottom: env(safe-area-inset-bottom)` handles home-indicator devices.
  - Bottom spacer matches new nav height + safe-area so page content never sits under the tab bar.

## Phase 2 — Touch-first interaction primitives
- New `src/components/mobile/` module — one import surface (`@/components/mobile`) for every screen:
  - `MobileSheet` (+ `Trigger`/`Content`/`Header`/`Title`/`Description`/`Footer`/`Close`) — Radix Dialog on desktop, `vaul` bottom drawer on mobile. Drop-in replacement for menus/popovers that carry primary actions.
  - `ActionSheet` — overflow menu with 44px targets, optional description per row, destructive variant, auto-close on select.
  - `SegmentedControl` — accessible tab-like choice (2–4 options) with `role="tablist"`, `aria-selected`, and 44px targets.
  - `FormField` — persistent label + hint + inline error, wires `aria-invalid` / `aria-describedby` / `aria-required` onto the wrapped control. Never a floating placeholder.
  - `SyncStatusChip` — universal saved / waiting / syncing / synced / failed / conflict chip with `role="status"` + `aria-live="polite"` for scoring, drafts, event builder, messaging.
- Global mobile CSS added to `src/styles.css`:
  - `--safe-top/bottom/left/right` tokens + `.pt-safe` / `.pb-safe` / `.pl-safe` / `.pr-safe` helpers.
  - Inputs forced to 16px under 768px to stop iOS Safari auto-zooming on focus.
  - `touch-action: manipulation` on `html` (kills 300ms tap delay) and transparent `-webkit-tap-highlight-color` on interactive elements.
  - Global `prefers-reduced-motion` reduction — animations and smooth-scroll disabled when the OS requests it (WCAG 2.3.3).

## Phase 5 — Mobile overflow sweep (375px audit)
Automated 375px scan across the main hubs. Fixes:
- `src/routes/_authenticated/community.index.tsx` — crew tracker `<li>` got `min-w-0` so grid items can shrink and truncate instead of blowing past the viewport.
- `src/routes/_authenticated/game-plan.tsx` — event list/panel grid uses `minmax(0,1fr)` and both columns get `min-w-0`; long course + layout names no longer widen the page.
- `src/components/game-plan/data-readiness-panel.tsx` — per-round course rows: `min-w-0` on truncating text, `shrink-0` on the readiness meta.
- `src/routes/_authenticated/practice.tsx` — session history table now scrolls horizontally (`overflow-x-auto` + `min-w-[560px]`) instead of being clipped.
- `src/components/community/trackers-hub.tsx` — edit/delete actions are always visible on touch (hover-reveal kept for `md+` only), so they're reachable without a mouse.

Verified: no page-level horizontal scroll at 375px on home, feed, play, community, statlink, events, courses, friends, messages, me, insights, game-plan, leaderboards, compete, notifications, schedule, practice, import, billing, achievements.

## Ongoing / next
- Phase 13: guarded SW registration wrapper still pending.
- Migration follow-up: replace ad-hoc `DropdownMenu` primary actions with `ActionSheet` on a per-route basis.

