/**
 * Scheduled pass that fills map coordinates on stored directory events.
 *
 * Runs on its own timer (called by the database scheduler, never a browser) so
 * a long location pass never shares a request with the event sweeps and get cut
 * short by the scheduler's request timeout.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isAuthorizedSyncCaller } from "@/lib/live/sync-auth.server";

async function run(request: Request): Promise<Response> {
  if (!(await isAuthorizedSyncCaller(request))) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Cheapest first: copy detail we already store for the same PDGA event
  // before spending any geocoder lookups on it.
  const { backfillDirectoryFromPdgaEvents } =
    await import("@/lib/event-directory-pdga-fill.server");
  const fromPdga = await backfillDirectoryFromPdgaEvents(1000);

  const { backfillMissingDirectoryCoords } = await import("@/lib/event-directory-geo.server");
  const placed = await backfillMissingDirectoryCoords(600);
  // The reverse pass is the mirror image: listings that arrived as a map pin
  // with no readable town get one, so their location reads honestly.
  const { backfillDirectoryPlaces, backfillCoursePlaces, correctMislabeledCountries } =
    await import("@/lib/event-directory-reverse-geo.server");
  const named = await backfillDirectoryPlaces(400);
  const courses = await backfillCoursePlaces(300);
  // Overseas listings inherit the feed's US default; the map pin is the honest
  // part, so anything plainly outside the US gets its real country back.
  const countries = await correctMislabeledCountries(150);
  // Town-centre course pins move to the spot their UDisc listing gives.
  const { upgradeApproximatePins } = await import("@/lib/course-pin-upgrade.server");
  const pins = await upgradeApproximatePins(60);
  // Re-read linked course listings (snapshot + field history + listing par).
  const { syncCourseListings } = await import("@/lib/course-sources/listing-sync.server");
  const listings = await syncCourseListings(40);
  const { backfillSceneCourseLinks } = await import("@/lib/course-sources/scene-links.server");
  const sceneLinks = await backfillSceneCourseLinks(25);
  const { processCourseRepairQueue } = await import("@/lib/course-sources/job-queue.server");
  const repairQueue = await processCourseRepairQueue(10);
  const { harvestGeometryCells } = await import("@/lib/course-geometry/harvest.server");
  const geometry = await harvestGeometryCells(2).catch(() => []);
  // Advance the Course Atlas update (if one is running) — no separate timer needed.
  const { advanceAtlasRun } = await import("@/lib/course-atlas/orchestrator.server");
  const atlas = await advanceAtlasRun().catch(() => ({ advanced: false }));
  return new Response(
    JSON.stringify({
      ranAt: new Date().toISOString(),
      fromPdga,
      placed,
      named,
      courses,
      countries,
      pins,
      listings,
      sceneLinks,
      repairQueue,
      geometry,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

export const Route = createFileRoute("/api/public/sync/geo-backfill")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
      GET: ({ request }) => run(request),
    },
  },
});
