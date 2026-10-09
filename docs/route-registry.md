# ChainLink Route Registry

Living inventory of every route. Legacy routes stay live until their row reads
**migrated + redirected + verified**. Deletion of legacy files is a separate
final commit per section (Phase 9).

Status values: `canonical` · `legacy-live` · `redirect` · `verified` · `deprecated`

## Feed

| Route                | Parent | Component            | Duplicate of | Redirect to | Permission | Status     |
| -------------------- | ------ | -------------------- | ------------ | ----------- | ---------- | ---------- |
| `/feed`              | root   | (redirect shim)      | `/home`      | `/home`     | auth       | redirect   |
| `/home`              | root   | `home.tsx`           | —            | —           | auth       | legacy-live |

## Play

| Route                             | Parent   | Component                    | Redirect to           | Status     |
| --------------------------------- | -------- | ---------------------------- | --------------------- | ---------- |
| `/play`                           | root     | `play.index.tsx`             | —                     | canonical  |
| `/play/$roundId`                  | /play    | `play.$roundId.tsx`          | — (fullscreen scorer) | canonical  |
| `/play/rounds`                    | /play    | redirect                     | `/rounds`             | redirect   |
| `/play/courses`                   | /play    | redirect                     | `/courses`            | redirect   |
| `/play/practice`                  | /play    | redirect                     | `/practice`           | redirect   |
| `/play/schedule`                  | /play    | redirect                     | `/schedule`           | redirect   |
| `/play/compete`                   | /play    | redirect                     | `/compete`            | redirect   |
| `/play/compete/tournaments`       | /play    | redirect                     | `/tournaments`        | redirect   |
| `/play/compete/leagues`           | /play    | redirect                     | `/leagues`            | redirect   |
| `/play/compete/leaderboards`      | /play    | redirect                     | `/leaderboards`       | redirect   |
| `/play/manage`                    | /play    | redirect                     | `/td`                 | redirect   |
| `/rounds`                         | root     | `rounds.tsx`                 | —                     | legacy-live |
| `/courses`                        | root     | `courses.index.tsx`          | —                     | legacy-live |
| `/courses/new`                    | root     | `courses.new.tsx`            | —                     | legacy-live |
| `/courses/$courseId`              | root     | `courses.$courseId.index`    | —                     | legacy-live |
| `/practice`                       | root     | `practice.tsx`               | —                     | legacy-live |
| `/schedule`                       | root     | `schedule.tsx`               | —                     | legacy-live |
| `/compete`                        | root     | `compete.tsx`                | —                     | legacy-live |
| `/tournaments`                    | root     | `tournaments.index.tsx`      | —                     | legacy-live |
| `/leagues`                        | root     | `leagues.index.tsx`          | —                     | legacy-live |
| `/leaderboards`                   | root     | `leaderboards.tsx`           | —                     | legacy-live |
| `/td`                             | root     | `td.tsx`                     | —                     | legacy-live |

## Community

| Route                          | Component                   | Redirect to      | Status      |
| ------------------------------ | --------------------------- | ---------------- | ----------- |
| `/community`                   | `community.index.tsx`       | —                | canonical   |
| `/community/$eventId`          | `community.$eventId.tsx`    | —                | canonical   |
| `/community/events`            | `community.events.index`    | —                | canonical   |
| `/community/new`               | `community.new.tsx`         | —                | canonical   |
| `/community/friends`           | redirect                    | `/friends`       | redirect    |
| `/community/trackers`          | redirect                    | `/tracker`       | redirect    |
| `/community/clubs`             | redirect                    | `/clubs`         | redirect    |
| `/community/messages`          | redirect                    | `/messages`      | redirect    |
| `/friends`                     | `friends.tsx`               | —                | legacy-live |
| `/tracker`                     | `tracker.index.tsx`         | —                | legacy-live |
| `/tracker/$groupId`            | `tracker.$groupId.index`    | —                | legacy-live |
| `/clubs`                       | `clubs.index.tsx`           | —                | legacy-live |
| `/clubs/$slug`                 | `clubs.$slug.tsx`           | —                | legacy-live |
| `/messages`                    | `messages.tsx`              | —                | legacy-live |

## StatLink

| Route                     | Component            | Redirect to      | Status      |
| ------------------------- | -------------------- | ---------------- | ----------- |
| `/statlink`               | redirect             | `/stats`         | redirect    |
| `/statlink/rounds`        | redirect             | `/rounds`        | redirect    |
| `/statlink/ratings`       | redirect             | `/ratings-lab`   | redirect    |
| `/statlink/scoring`       | redirect             | `/stats`         | redirect    |
| `/statlink/courses`       | redirect             | `/course-book`   | redirect    |
| `/statlink/coach`         | redirect             | `/game-plan`     | redirect    |
| `/statlink/compare`       | redirect             | `/compare`       | redirect    |
| `/stats`                  | `stats.tsx`          | —                | legacy-live |
| `/ratings-lab`            | `ratings-lab.tsx`    | —                | legacy-live |
| `/course-book`            | `course-book.index`  | —                | legacy-live |
| `/game-plan`              | `game-plan.tsx`      | —                | legacy-live |
| `/compare`                | `compare.tsx`        | —                | legacy-live |
| `/insights`               | redirect             | `/stats`         | redirect    |
| `/season-planner`         | redirect             | `/game-plan`     | redirect    |
| `/action-items`           | redirect             | `/game-plan`     | redirect    |

## Settings & Data

| Route                              | Component               | Redirect to    | Status      |
| ---------------------------------- | ----------------------- | -------------- | ----------- |
| `/settings/connections`            | redirect                | `/data-hub`    | redirect    |
| `/settings/data-health`            | redirect                | `/data-hub`    | redirect    |
| `/settings/personalization`        | redirect                | `/me`          | redirect    |
| `/settings/imports`                | `settings.imports.tsx`  | —              | legacy-live |
| `/data-hub`                        | `data-hub.tsx`          | —              | legacy-live |
| `/import`                          | `import.tsx`            | —              | legacy-live |

## Me / Profile

| Route            | Component        | Status      |
| ---------------- | ---------------- | ----------- |
| `/me`            | `me.tsx`         | canonical   |
| `/me/bag`        | `me.bag.tsx`     | canonical   |
| `/notifications` | `notifications`  | canonical   |
| `/achievements`  | `achievements`   | canonical   |
| `/challenges`    | `challenges`     | canonical   |

## Admin

| Route              | Component                     | Permission | Status    |
| ------------------ | ----------------------------- | ---------- | --------- |
| `/admin/moderation`| `admin.moderation.tsx`        | admin      | canonical |

## Phase 3 completion checklist

- [x] Canonical routes wired as redirect shims (`/feed`, `/play/*`,
      `/community/*`, `/statlink/*`, `/settings/*`).
- [ ] Inbound-link audit: replace hard-coded legacy links across the app
      with canonical paths (`<Link to="/statlink/ratings">`, etc.).
- [ ] Phase 9: after full migration + verification, move page components
      to canonical filenames and delete the redirect shims.
