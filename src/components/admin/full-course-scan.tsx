import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Square, ScanSearch, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  backfillLibraryLayouts,
  promoteLibraryLayouts,
  runFullCourseScanPass,
} from "@/lib/course-buildout.functions";
import { runHarvestNow } from "@/lib/course-geometry/harvest.functions";
import { enqueueSeedBatch, processSeedBatch } from "@/lib/pdga-kb.functions";

type Totals = {
  passes: number;
  coursesRead: number;
  coursesAdded: number;
  listingsRead: number;
  parFilled: number;
  layoutsImported: number;
  holesAdded: number;
  pinsUpgraded: number;
  sceneLinks: number;
  repairsDone: number;
  holesMapped: number;
  mapRegions: number;
  pdgaPages: number;
  failed: number;
};

const EMPTY: Totals = {
  passes: 0, coursesRead: 0, coursesAdded: 0, listingsRead: 0, parFilled: 0,
  layoutsImported: 0, holesAdded: 0, pinsUpgraded: 0, sceneLinks: 0, repairsDone: 0, holesMapped: 0, mapRegions: 0, pdgaPages: 0, failed: 0,
};

/**
 * The one-button Course Atlas: keeps running small passes of every course job
 * until every job comes back with nothing left to do, or the admin stops it.
 */
export function FullCourseScan() {
  const qc = useQueryClient();
  const passFn = useServerFn(runFullCourseScanPass);
  const promoteFn = useServerFn(promoteLibraryLayouts);
  const fixFn = useServerFn(backfillLibraryLayouts);
  const harvestFn = useServerFn(runHarvestNow);
  const queuePdgaFn = useServerFn(enqueueSeedBatch);
  const pdgaFn = useServerFn(processSeedBatch);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [step, setStep] = useState("");
  const [t, setT] = useState<Totals>(EMPTY);
  const stop = useRef(false);

  const run = async () => {
    stop.current = false;
    setRunning(true);
    setDone(false);
    setT(EMPTY);
    let idleRuns = 0;
    // Line up PDGA course and player pages once; super admins only (others skip quietly).
    await queuePdgaFn({ data: { count: 50 } }).catch(() => null);
    try {
      while (!stop.current) {
        setStep("Finding courses, reading listings, fixing pins");
        const p = await passFn();
        if (stop.current) break;
        setStep("Importing layouts");
        const promo = await promoteFn({ data: { limit: 40 } }).catch(() => null);
        const fix = await fixFn({ data: { limit: 100 } }).catch(() => null);
        const layouts = (promo?.layoutsCreated ?? 0) + (promo?.layoutsUpdated ?? 0) + (fix?.layoutsCreated ?? 0);
        const holes = (promo?.holesCreated ?? 0) + (fix?.holesCreated ?? 0);
        if (stop.current) break;
        setStep("Reading tee pads and baskets from the map");
        const geo = await harvestFn().catch(() => null);
        setStep("Reading PDGA course and player pages");
        const pdga = await pdgaFn({ data: { batch: 5, skipEvents: true } }).catch(() => null);
        const pdgaPages = pdga?.processed ?? 0;
        setT((prev) => ({
          passes: prev.passes + 1,
          coursesRead: prev.coursesRead + p.coursesRead,
          coursesAdded: prev.coursesAdded + p.coursesAdded,
          listingsRead: prev.listingsRead + p.listingsRead,
          parFilled: prev.parFilled + p.parFilled,
          layoutsImported: prev.layoutsImported + layouts + p.layoutsFromListings,
          holesAdded: prev.holesAdded + holes,
          pinsUpgraded: prev.pinsUpgraded + p.pinsUpgraded,
          sceneLinks: prev.sceneLinks + p.sceneLinks,
          repairsDone: prev.repairsDone + p.repairsDone,
          holesMapped: prev.holesMapped + p.holesMapped + (geo?.filled ?? 0),
          mapRegions: prev.mapRegions + (geo?.cells ?? 0),
          pdgaPages: prev.pdgaPages + pdgaPages,
          failed: prev.failed + p.failed + (geo?.failed ?? 0),
        }));
        const nothing = p.idle && layouts === 0 && holes === 0 && (promo?.remaining ?? 0) === 0 && pdgaPages === 0;
        idleRuns = nothing ? idleRuns + 1 : 0;
        if (idleRuns >= 2) {
          setDone(true);
          break;
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The scan stopped — try again");
    } finally {
      setRunning(false);
      setStep("");
      qc.invalidateQueries();
    }
  };

  const stats: Array<[string, number]> = [
    ["Courses checked", t.coursesRead],
    ["New courses", t.coursesAdded],
    ["Listings read", t.listingsRead],
    ["Par filled", t.parFilled],
    ["Layouts imported", t.layoutsImported],
    ["Holes added", t.holesAdded],
    ["Pins made exact", t.pinsUpgraded],
    ["Scene links", t.sceneLinks],
    ["Repairs finished", t.repairsDone],
    ["Tee/basket spots mapped", t.holesMapped],
    ["Map regions read", t.mapRegions],
    ["PDGA pages read", t.pdgaPages],
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ScanSearch className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">Build out every course</h2>
            <p className="text-sm text-muted-foreground">
              Scans every course, imports its real layouts and par, makes pins exact where a listing
              has the spot, reads tee pads and baskets from the map, reads PDGA course and player pages, and retries anything that failed. Runs until there's nothing left to do.
            </p>
          </div>
        </div>
        {running ? (
          <Button variant="outline" className="gap-2" onClick={() => (stop.current = true)}>
            <Square className="h-4 w-4" />
            Stop scan
          </Button>
        ) : (
          <Button className="gap-2" onClick={run}>
            <Play className="h-4 w-4" />
            {t.passes ? "Scan again" : "Start full scan"}
          </Button>
        )}
      </div>

      {(running || t.passes > 0) && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">
            {running ? (
              <>Pass {t.passes + 1} · {step}…</>
            ) : done ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" />
                All caught up after {t.passes} passes. Nothing else is available to import right now.
              </span>
            ) : (
              <>Stopped after {t.passes} passes. Start again any time — it picks up where it left off.</>
            )}
          </p>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map(([label, n]) => (
              <div key={label} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{n.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          {t.failed > 0 && (
            <p className="text-sm text-muted-foreground">
              {t.failed.toLocaleString()} reads didn't go through — they're queued to retry automatically.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
