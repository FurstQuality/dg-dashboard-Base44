# Property, map overlays and retailer imports

The **Property** button is always available in the map editor. A course with no property line opens this setup first. Draw the polygon, finish it, adjust its points, then lock it before placing tees/baskets or capturing an overview. Boundary lock and overview changes participate in undo and save. Boundaries save as course-wide base features (`layout_id = null`), and overview framing uses that boundary. Legacy duplicate boundaries are retained in storage; the editor deterministically uses the shared boundary first, then stable ID ordering as a fallback, rather than deleting geometry.

**Map tools → Place map over aerial** accepts PNG/JPG/WebP screenshots. Drag the image and its three anchor handles; size and rotation buttons offer fine adjustment. Lock the image before marking or detecting locations. Original pixels and georeferencing remain in IndexedDB on this device. Background cleanup can remove white paper or isolate light annotations; it is a visual filter, not semantic image segmentation. The original image is used for detection and source archiving. Imported review items use the existing map editor's UUIDs, fairway generation, undo and save flow. Existing positions are never overwritten; a candidate within three feet of an existing matching-kind position on the same hole is skipped. All selected points must be inside the property and assigned to an existing hole. Automatic results start unselected for review.

Server-only configuration:

- `GEMINI_API_KEY` enables automatic image detection. Optional `GEMINI_VISION_MODEL` defaults to `gemini-2.5-flash`. Configure through the server environment; no key belongs in VITE variables. The admin connector catalog reports its presence.
- `SUPABASE_SERVICE_ROLE_KEY` is required for import source snapshots and geometry observations. The original overlay, alignment and reviewed candidates are archived through `data-intel/snapshots.server.ts`; observation writes go through `course-geometry/harvest.server.ts`. Imports fail before changing the map if provenance cannot be recorded.
- Course editor access is verified by the server before image analysis or observation creation. Course writes still use the user's existing save/RLS path.

The directory's **Disc shops** layer imports globally available OpenStreetMap shops explicitly tagged for disc golf. It preserves raw responses in source_snapshots and field provenance, caches results for 24 hours, links each pin to its source, and lets users search or select a store to move the map. It does not infer disc inventory from a generic sporting-goods shop. Public source coverage is incomplete; "all stores that sell discs" cannot be guaranteed by this feed. No stores are represented as courses.

Sources: [OSM sports shops](https://wiki.openstreetmap.org/wiki/Tag:shop%3Dsports), [Gemini image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).

## Verification / outstanding setup (October 9, 2026)

Isolated local browser tests cover image drag/resize/rotation/cleanup/lock, candidate review/import without replacing existing pins, image recovery after refresh, first-step property drawing/locking, course-wide persistence and another layout reusing the boundary. Search/filter and shop-search framing checks pass. Existing save-failure and hole-count safety checks pass. No live course data was changed.

Live retailer import was attempted but blocked because the local server lacks SUPABASE_SERVICE_ROLE_KEY. GEMINI_API_KEY is also absent. Configure those secrets before live source archiving and real image detection can be verified. UI imports were tested with fake provider/database responses and do not constitute a live-data import.
