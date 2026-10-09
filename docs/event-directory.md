# Live event directory

`/events` browses live listings instead of only imported ones.

## Pipeline

1. `src/lib/event-directory-parse.ts` — pure parsers (unit tested in
   `event-directory-parse.test.ts`): Disc Golf Scene tournament + league lists,
   UDisc nearby-events cards, date/tier/season phrases, and the cross-source
   match key.
2. `src/lib/event-directory.server.ts` — sweeps each source with bounded
   concurrency, normalizes rows, scrubs characters Postgres rejects, links
   Scene/UDisc rows to a PDGA event ref when name + date + city agree, and
   upserts into `public.event_directory` while logging every sweep to
   `public.event_directory_syncs`.
   - PDGA: `scrapePdgaTourEvents` (pdga.com/tour/search).
   - Disc Golf Scene: national `/tournaments` + `/leagues`, plus per-state pages
     for the player's state filter.
   - UDisc: `udisc.com/events?latitude=..&longitude=..`; UDisc has no national
     listing, so `UDISC_GEO_ANCHORS` sweeps major metros.
3. `src/lib/event-directory.functions.ts` — `listDirectoryEvents` (filtered read
   plus a light auto-sweep when the mirror is older than
   `DIRECTORY_STALE_MINUTES`, skipped if any sweep finished in the last 10
   minutes) and `refreshDirectoryEvents` (deep crawl behind the Refresh button).

## Access

`event_directory` and `event_directory_syncs` are shared reference data: signed-in
players read them, only the service role writes them. Writes happen exclusively
inside server functions, never from the browser.

## Duplicates

Directory rows are deduped per source on `(source, source_event_id)`. In the UI,
a PDGA listing wins over the same event mirrored on Scene/UDisc, and live rows
supersede rows a player previously imported into `scheduled_events`.

## Residual risks

- All three sources are scraped HTML; a markup change degrades a source rather
  than breaking the page (its sweep logs `ok = false` and the events page names
  the source that didn't answer).
- UDisc coverage is anchor-based, so remote areas can be sparse.
- Scene league seasons only expose month-level ranges, stored as first/last day
  of the season months.
