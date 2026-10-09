# Pre-beta stress test

Last run: 2026-09-11 (UTC). Owner: DG Dashboard team.

## What was tested

| Area                | Method                                                                                                            | Result                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Type safety         | `bunx tsgo --noEmit`                                                                                              | Pass, no errors                                                           |
| Unit / logic suites | `bunx vitest run`                                                                                                 | Pass, 41 files / 393 tests                                                |
| Full route walk     | Headless browser visit of every generated route (141 pages)                                                       | Pass after fixes below                                                    |
| Critical flows      | Manual browser drive (round start, round setup, tournament wizard, league wizard, tracker, events, billing, DGIM) | 8 / 8 pass                                                                |
| Mobile layout       | 390 / 430 / 768 px viewport checks on nav, settings, imports, events, scoring                                     | No horizontal overflow                                                    |
| Reachability        | Route registry cross-check (`src/lib/smart-routes.ts`)                                                            | 0 dead links, 7 compatibility forwarders, 9 intentionally unlinked routes |
| Access rules        | Director / creator gating plus row-level policy review on tracker, chat, and Lost & Found tables                  | Pass after fixes below                                                    |

## Defects found and fixed

- `/weather` crashed on mount from a duplicated app shell and a realtime subscription cleanup bug.
- `/edit` crashed when the target record no longer existed; now shows a friendly not-found state.
- `/auth` contained a nested form that broke submit on some browsers.
- Play status query returned stale rows during an in-progress round.
- Tournament and league detail pages loaded forever on a missing slug; now show not-found.
- `/tournaments/new` and `/leagues/new` did not open the setup wizard.
- Chat allowed a self-join into conversations the user was not invited to.
- Lost & Found list reads exposed contact phone numbers.
- `/settings/imports` did not fit a phone screen (menu now scrolls in one row, duplicate title removed).

## Known limitations at beta

- UDisc private scorecards have no public API; they import by CSV export only.
- Some external courses have coordinates but no confirmed city/state, and some events have no confirmed tier. These render as "Location unconfirmed" / "Tier unconfirmed" rather than guessing.
- DGD ratings are DG Dashboard estimates and are labelled separately from official PDGA and UDisc round ratings everywhere they appear.

## How to re-run

```bash
bunx tsgo --noEmit     # types
bunx vitest run        # logic suites
```

Route walk and flow checks are browser-driven against the running dev server; repeat them after any navigation, auth, or scoring change.
