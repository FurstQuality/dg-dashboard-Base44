import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Search, ExternalLink, Wand2, Info, ShieldCheck, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { type GamePlanEvent } from "@/lib/game-plan.functions";
import { useTargetRating } from "@/lib/use-target-rating";
import {
  lookupPastPdgaEventRounds,
  searchPastPdgaEventsByCourse,
  type PdgaEventLookup,
  type PdgaLookupRow,
  type PdgaMatchedCourse,
  type PdgaRejectedEvent,
} from "@/lib/pdga-course-lookup.functions";
import {
  buildCourseModel,
  requiredScore,
  courseConfidence,
  type PastCourseRound,
} from "@/lib/course-target";
import {
  submitCourseRatingProfile,
  getApprovedCourseRatingProfile,
  getLatestCourseRatingSubmission,
} from "@/lib/course-rating-profiles.functions";
import { resolvePdgaDgsLink, type PdgaDgsResolution } from "@/lib/pdga-dgs-link.functions";
import { fetchUdiscCourse, type UdiscCourseLookup } from "@/lib/udisc-course.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";

function lookupRowsToPast(rows: PdgaLookupRow[]): PastCourseRound[] {
  return rows.map((r) => ({
    played_on: r.event_date ?? new Date().toISOString().slice(0, 10),
    score: r.score,
    round_rating: r.round_rating,
    to_par: null,
    ssa: null,
  }));
}

export function PastEventResultsDialog({
  event,
  triggerLabel = "Course Ratings Analyzer",
  size = "sm",
  variant = "outline",
}: {
  event: GamePlanEvent;
  triggerLabel?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [sharedTarget] = useTargetRating(950);
  const targetRating = sharedTarget ?? 950;
  const [courseNameOverride, setCourseNameOverride] = useState("");
  const [activeCourse, setActiveCourse] = useState(0);

  // URL rows per course. Each row is a single "Leaders" URL.
  const [urlsByCourse, setUrlsByCourse] = useState<Record<number, string[]>>(() => {
    const init: Record<number, string[]> = {};
    event.courses.forEach((_c, i) => (init[i] = [""]));
    return init;
  });
  const [lookupByCourse, setLookupByCourse] = useState<
    Record<
      number,
      {
        events: PdgaEventLookup[];
        rows: PdgaLookupRow[];
        matchedCourse?: PdgaMatchedCourse | null;
        rejected?: PdgaRejectedEvent[];
      }
    >
  >({});

  // Resolve the Disc Golf Scene event + course page tied to this PDGA event.
  // DGS carries the richest venue metadata (holes, par, length, layouts) so
  // it doubles as verification that the analyzer is looking at the right
  // course before ingesting any tournament data.
  const resolveDgs = useServerFn(resolvePdgaDgsLink);
  const dgsQuery = useQuery<PdgaDgsResolution | null>({
    queryKey: ["pdga-dgs-link", event.pdga_event_ref, event.title],
    enabled: open && Boolean(event.pdga_event_ref),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!event.pdga_event_ref) return null;
      try {
        return await resolveDgs({ data: { eventRef: event.pdga_event_ref } });
      } catch {
        return null;
      }
    },
  });
  const dgs = dgsQuery.data ?? null;

  // Optional: drop-in UDisc course URL. UDisc has richer per-layout data
  // (par, length, difficulty) than PDGA or DGS combined, so pasting it here
  // gives the analyzer maximum context for course rating verification.
  const [udiscUrl, setUdiscUrl] = useState("");
  const [udiscResult, setUdiscResult] = useState<UdiscCourseLookup | null>(null);
  const fetchUdisc = useServerFn(fetchUdiscCourse);
  const udiscMut = useMutation({
    mutationFn: async (url: string) => fetchUdisc({ data: { url } }),
    onSuccess: (res) => {
      setUdiscResult(res);
      if (res.error) toast.error(res.error);
      else if (res.course) toast.success(`Loaded ${res.course.name} from UDisc`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "UDisc fetch failed"),
  });

  const lookup = useServerFn(lookupPastPdgaEventRounds);
  const lookupMut = useMutation({
    mutationFn: lookup,
    onSuccess: (res, vars) => {
      const idx = (vars as { __courseIdx?: number }).__courseIdx ?? activeCourse;
      setLookupByCourse((prev) => {
        const existing = prev[idx] ?? { events: [], rows: [] };
        // Merge, de-dupe by event_ref
        const map = new Map(existing.events.map((e) => [e.event_ref, e] as const));
        for (const e of res.events) map.set(e.event_ref, e);
        return {
          ...prev,
          [idx]: {
            events: Array.from(map.values()),
            rows: [...existing.rows, ...res.rows],
          },
        };
      });
      const total = res.rows.length;
      if (!total) toast.warning("No rated rounds found on those PDGA pages.");
      else toast.success(`Pulled ${total} rated rounds from ${res.events.length} PDGA event(s).`);
    },
    onError: (e: Error) => toast.error(e.message ?? "PDGA lookup failed."),
  });

  const autoSearch = useServerFn(searchPastPdgaEventsByCourse);
  const autoMut = useMutation({
    mutationFn: autoSearch,
    onSuccess: (res, vars) => {
      const idx = (vars as { __courseIdx?: number }).__courseIdx ?? activeCourse;
      if (res.error) {
        toast.error(res.error);
      }
      setLookupByCourse((prev) => {
        const existing = prev[idx] ?? { events: [], rows: [] };
        const map = new Map(existing.events.map((e) => [e.event_ref, e] as const));
        for (const e of res.events) map.set(e.event_ref, e);
        return {
          ...prev,
          [idx]: {
            events: Array.from(map.values()),
            rows: [...existing.rows, ...res.rows],
            matchedCourse: res.matchedCourse ?? existing.matchedCourse ?? null,
            rejected: [...(existing.rejected ?? []), ...(res.rejected ?? [])],
          },
        };
      });
      if (!res.matchedCourse) {
        // error already toasted above if present
      } else if (!res.events.length) {
        toast.warning(
          `Matched "${res.matchedCourse.name}" on PDGA, but no verified events had rated rounds available.`,
        );
      } else {
        toast.success(
          `Verified ${res.events.length} event${res.events.length === 1 ? "" : "s"} at ${res.matchedCourse.name}.`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message ?? "PDGA search failed."),
  });

  // Derive a real course name. Priority:
  //  1. A per-round course_name already attached to the event.
  //  2. The Disc Golf Scene course name (authoritative venue name).
  //  3. Parse the event title — strip series/event prefix ("Ledgestone Flex - Wildlife Prairie Park").
  //  4. Fall back to location only if nothing else is known.
  const parseCourseFromTitle = (title: string | null | undefined): string | null => {
    if (!title) return null;
    // Split on common separators used between event and venue names.
    const parts = title.split(/\s+(?:[-–—@]|at|@|presented by)\s+/i);
    const tail = parts[parts.length - 1]?.trim();
    if (!tail || tail.length < 3) return null;
    // Reject obvious non-venue tails (year, tier codes).
    if (/^(20\d{2}|C[- ]?tier|B[- ]?tier|A[- ]?tier|Major|XM|XA|XB|XC)$/i.test(tail)) return null;
    return tail;
  };
  const fallbackCourseName =
    event.courses.find((c) => c.course_name)?.course_name ??
    dgs?.dgs_course?.name ??
    dgs?.dgs_course_name ??
    parseCourseFromTitle(event.title) ??
    event.location ??
    "This event";

  const courses = event.courses.length
    ? event.courses.map((c) => ({ ...c, course_name: c.course_name ?? fallbackCourseName }))
    : [
        {
          round_number: 1,
          course_id: null,
          course_name: fallbackCourseName,
          layout_id: null,
          layout_name: null,
          starts_at: null,
          hole_count: null,
          par_total: null,
          scratch_rating: null,
          stroke_value: null,
        },
      ];

  const active = courses[activeCourse] ?? courses[0];
  const urls = urlsByCourse[activeCourse] ?? [""];
  const lookupResult = lookupByCourse[activeCourse];
  const lookupPast = useMemo(
    () => (lookupResult?.rows ? lookupRowsToPast(lookupResult.rows) : []),
    [lookupResult],
  );

  const model = useMemo(() => {
    return buildCourseModel(lookupPast, {
      scratch_rating: active.scratch_rating,
      stroke_value: active.stroke_value,
      par_total: active.par_total,
    });
  }, [lookupPast, active]);

  // --- Course rating profile submission ---
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const getApproved = useServerFn(getApprovedCourseRatingProfile);
  const approvedQuery = useQuery({
    queryKey: [
      "course-rating-profile",
      "approved",
      active.course_id ?? active.course_name ?? "unknown",
    ],
    queryFn: () =>
      getApproved({
        data: {
          course_id: active.course_id ?? null,
          course_name: active.course_id ? null : (active.course_name ?? null),
        },
      }),
    enabled: open && Boolean(active.course_id || active.course_name),
  });
  const approvedProfile = approvedQuery.data;

  // Load the user's most recent submission for this course so previously
  // ingested PDGA data is visible when the dialog reopens (rated rounds,
  // per-round summaries, matched course, current review status).
  const getLatest = useServerFn(getLatestCourseRatingSubmission);
  const latestQuery = useQuery({
    queryKey: [
      "course-rating-profile",
      "latest-mine",
      active.course_id ?? active.course_name ?? "unknown",
    ],
    enabled: open,
    queryFn: () =>
      getLatest({
        data: {
          course_id: active.course_id ?? null,
          course_name: active.course_id ? null : (active.course_name ?? null),
        },
      }),
  });
  const latestProfile = latestQuery.data;

  // Hydrate the analyzer state with the saved rated rounds / summaries so
  // the "Prior results" the user submitted last session actually show up.
  useEffect(() => {
    if (!open) return;
    if (!latestProfile) return;
    if (lookupByCourse[activeCourse]?.rows?.length) return;
    const rated = (latestProfile.rated_rounds ?? []) as Array<{
      played_on: string | null;
      score: number | null;
      round_rating: number | null;
    }>;
    const summariesRaw = (latestProfile.round_summaries ?? []) as Array<{
      round: number;
      ssa: number | null;
      stroke_value: number | null;
      winning_score: number | null;
      winning_rating: number | null;
      n: number;
    }>;
    const eventRefs = (latestProfile.event_refs ?? []) as string[];
    const primaryRef = eventRefs[0] ?? `saved-${latestProfile.id}`;
    const rows: PdgaLookupRow[] = rated
      .filter((r) => r.score != null && r.round_rating != null)
      .map((r) => ({
        event_ref: primaryRef,
        event_name: latestProfile.pdga_course_name ?? latestProfile.course_name ?? null,
        event_date: r.played_on ?? null,
        round: 1,
        division: null,
        score: r.score as number,
        round_rating: r.round_rating as number,
      }));
    const events: PdgaEventLookup[] = [
      {
        event_ref: primaryRef,
        event_name:
          eventRefs.length > 1
            ? `${eventRefs.length} saved PDGA events`
            : `Saved analysis · ${latestProfile.course_name}`,
        event_date: latestProfile.created_at ? String(latestProfile.created_at).slice(0, 10) : null,
        rows_count: rows.length,
        summaries: summariesRaw.map((s) => ({
          event_ref: primaryRef,
          event_name: null,
          event_date: null,
          round: s.round,
          ssa: s.ssa,
          stroke_value: s.stroke_value,
          n: s.n,
          winning_score: s.winning_score,
          winning_rating: s.winning_rating,
          median_score: null,
          median_rating: null,
        })),
      },
    ];
    setLookupByCourse((prev) => ({
      ...prev,
      [activeCourse]: {
        events,
        rows,
        matchedCourse: (latestProfile.matched_course ?? null) as PdgaMatchedCourse | null,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, latestProfile, activeCourse]);

  const submitFn = useServerFn(submitCourseRatingProfile);
  const submitMut = useMutation({
    mutationFn: submitFn,
    onSuccess: (res) => {
      if ((res as { status?: string })?.status === "approved") {
        toast.success("Course rating profile approved and now live across the app.");
      } else {
        toast.success("Submitted for super admin review. Thanks for contributing!");
      }
      queryClient.invalidateQueries({ queryKey: ["course-rating-profile"] });
      setNotes("");
    },
    onError: (e: Error) => toast.error(e.message ?? "Submission failed."),
  });

  const submitProfile = () => {
    if (!(model.n > 0)) {
      toast.error("Analyze at least one PDGA event first.");
      return;
    }
    submitMut.mutate({
      data: {
        course_id: active.course_id ?? null,
        course_name: active.course_name ?? "Unknown course",
        pdga_course_ref: lookupResult?.matchedCourse?.slug ?? null,
        pdga_course_name: lookupResult?.matchedCourse?.name ?? null,
        pdga_course_url: lookupResult?.matchedCourse?.url ?? null,
        ssa: Math.round(model.ssa * 10) / 10,
        stroke_value: Math.round(model.stroke_value * 10) / 10,
        par_total: active.par_total ?? null,
        sample_size: model.n,
        event_refs: (lookupResult?.events ?? []).map((e) => e.event_ref),
        round_summaries: (lookupResult?.events ?? []).flatMap((e) =>
          e.summaries.map((s) => ({
            round: s.round,
            ssa: s.ssa ?? null,
            stroke_value: s.stroke_value ?? null,
            winning_score: s.winning_score ?? null,
            winning_rating: s.winning_rating ?? null,
            n: s.n,
          })),
        ),
        rated_rounds: (lookupResult?.rows ?? []).map((r) => ({
          played_on: r.event_date ?? null,
          score: r.score ?? null,
          round_rating: r.round_rating ?? null,
        })),
        matched_course: lookupResult?.matchedCourse ?? null,
        notes: notes.trim() || null,
      },
    } as never);
  };

  const setUrl = (i: number, v: string) =>
    setUrlsByCourse((prev) => {
      const arr = [...(prev[activeCourse] ?? [])];
      arr[i] = v;
      return { ...prev, [activeCourse]: arr };
    });
  const addUrl = () =>
    setUrlsByCourse((prev) => ({
      ...prev,
      [activeCourse]: [...(prev[activeCourse] ?? []), ""],
    }));
  const removeUrl = (i: number) =>
    setUrlsByCourse((prev) => {
      const arr = [...(prev[activeCourse] ?? [])];
      arr.splice(i, 1);
      return { ...prev, [activeCourse]: arr.length ? arr : [""] };
    });

  const validateLeadersUrl = (raw: string): { ok: boolean; reason?: string } => {
    const t = raw.trim();
    if (!t) return { ok: false, reason: "empty" };
    // Warn if the URL is scoped to a specific division rather than Leaders.
    if (/\/live\/event\/\d+\/[A-Z]{2,4}\d*(?:\b|\/|\?|$)/i.test(t))
      return {
        ok: false,
        reason:
          "This URL is for a specific division. Switch to the Leaders tab and copy that URL instead.",
      };
    return { ok: true };
  };

  const runAnalyze = () => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleaned.length) {
      toast.error("Paste at least one PDGA Leaders URL.");
      return;
    }
    for (const u of cleaned) {
      const v = validateLeadersUrl(u);
      if (!v.ok && v.reason && v.reason !== "empty") {
        toast.error(v.reason);
        return;
      }
    }
    lookupMut.mutate({ data: { eventRefs: cleaned }, __courseIdx: activeCourse } as never);
  };

  const runAutoSearch = () => {
    const name = (courseNameOverride.trim() || active.course_name || "").trim();
    if (!name) {
      toast.error("Enter a course name to search for.");
      return;
    }
    autoMut.mutate({
      data: { courseName: name, limit: 5 },
      __courseIdx: activeCourse,
    } as never);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          <Search className="h-3.5 w-3.5 mr-1" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Course Ratings Analyzer</DialogTitle>
          <DialogDescription>
            Paste one or more PDGA <strong>Leaders</strong> URLs from past events at this course.
            We'll fit an SSA and stroke value from every rated round in the field and tell you
            exactly what score is worth your target rating.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-sm">
              <Info className="h-4 w-4 text-primary" />
              How to grab the right URL
            </div>
            <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
              <li>
                Go to{" "}
                <a
                  href={`https://www.pdga.com/tour?tour_event_search%5Bquery%5D=${encodeURIComponent(active.course_name ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  pdga.com/tour
                </a>{" "}
                and search the course name.
              </li>
              <li>Open a past rated event held at the same course.</li>
              <li>
                Click <strong>View Hole Scores</strong>.
              </li>
              <li>
                On the top tab bar select <strong>Leaders</strong> (do <em>not</em> pick a specific
                division like MPO or MA1 — Leaders shows every division).
              </li>
              <li>
                Click the arrow icon to the right of the event title and choose{" "}
                <strong>Copy</strong> to copy the URL.
              </li>
              <li>
                Paste the URL below. Repeat for round 2, and for as many events as you can — more
                data = more accuracy.
              </li>
            </ol>
          </div>

          {/* Prior submission status — shows the user where their previously
              ingested PDGA data went (approved / pending review). */}
          {latestProfile ? (
            <div
              className={
                "rounded-md border p-3 text-xs " +
                (latestProfile.status === "approved"
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : latestProfile.status === "pending"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-destructive/40 bg-destructive/5")
              }
            >
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">
                  {latestProfile.status === "approved"
                    ? "Your prior submission is live"
                    : latestProfile.status === "pending"
                      ? "Your prior submission is awaiting review"
                      : "Your prior submission was rejected"}
                </div>
                <Badge variant="outline" className="uppercase text-[10px]">
                  {latestProfile.status}
                </Badge>
              </div>
              <div className="mt-1 text-muted-foreground">
                Ingested{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {latestProfile.sample_size}
                </span>{" "}
                rated rounds across{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {(latestProfile.event_refs ?? []).length}
                </span>{" "}
                PDGA event{(latestProfile.event_refs ?? []).length === 1 ? "" : "s"} · SSA{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {Number(latestProfile.ssa).toFixed(1)}
                </span>{" "}
                · stroke value{" "}
                <span className="tabular-nums font-medium text-foreground">
                  {Number(latestProfile.stroke_value).toFixed(1)}
                </span>
                . Full breakdown is loaded below.
              </div>
              {latestProfile.status === "rejected" && latestProfile.rejection_reason ? (
                <div className="mt-1 text-destructive">
                  Reason: {latestProfile.rejection_reason}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Course name override + auto-find */}

          <div className="rounded-md border p-3 flex flex-wrap items-end gap-3">
            <div className="space-y-1 flex-1 min-w-[16rem]">
              <Label htmlFor="ppr-course-name" className="text-xs">
                Course name <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="ppr-course-name"
                type="text"
                placeholder={active.course_name ?? "e.g. Wildlife Park at Northwood"}
                value={courseNameOverride}
                onChange={(e) => setCourseNameOverride(e.target.value)}
              />
              <div className="text-[11px] text-muted-foreground">
                Try alternate names PDGA may list this course under to help auto-find events. Leave
                blank to use <strong>{active.course_name ?? "the event course"}</strong>.
              </div>
            </div>
            <div className="flex-1 min-w-[14rem] text-xs text-muted-foreground">
              Target rating comes from your <strong>Crush Your Goals</strong> target (currently{" "}
              <strong>{targetRating}</strong>). Update it there to change the projection everywhere.
              <div className="mt-1">
                Formula: <code>required_score = SSA + (1000 − target) / stroke_value</code>.
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={runAutoSearch}
              disabled={autoMut.isPending || !(courseNameOverride.trim() || active.course_name)}
              title="Auto-search pdga.com for past rated events at this course"
            >
              <Wand2 className="h-3.5 w-3.5 mr-1" />
              {autoMut.isPending ? "Searching PDGA…" : "Auto-find past events"}
            </Button>
          </div>

          {courses.length > 1 ? (
            <Tabs value={String(activeCourse)} onValueChange={(v) => setActiveCourse(Number(v))}>
              <TabsList className="flex-wrap h-auto">
                {courses.map((c, i) => (
                  <TabsTrigger key={i} value={String(i)}>
                    R{c.round_number ?? i + 1} · {c.course_name ?? "Course"}
                  </TabsTrigger>
                ))}
              </TabsList>
              {courses.map((_c, i) => (
                <TabsContent key={i} value={String(i)} />
              ))}
            </Tabs>
          ) : null}

          {/* URL rows */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">
                Past PDGA events at{" "}
                {(() => {
                  const label = active.course_name ?? "this course";
                  const href =
                    lookupResult?.matchedCourse?.url ??
                    `https://www.pdga.com/course-directory/search?combine=${encodeURIComponent(
                      (courseNameOverride.trim() || active.course_name || "").trim(),
                    )}`;
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
                      title="Open this course on PDGA"
                    >
                      {label}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  );
                })()}
              </div>
              <Badge variant="outline" className="text-[10px]">
                {model.source === "layout"
                  ? "layout SSA"
                  : model.source === "fit"
                    ? `fit · ${model.n} rounds`
                    : "awaiting data"}
              </Badge>
            </div>

            {lookupResult?.matchedCourse ? (
              <div className="rounded-md border bg-primary/5 p-2 text-[11px] flex items-center justify-between gap-2">
                <div>
                  <span className="text-muted-foreground">Matched on PDGA:</span>{" "}
                  <span className="font-medium">{lookupResult.matchedCourse.name}</span>
                </div>
                <a
                  href={lookupResult.matchedCourse.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  Course page
                </a>
              </div>
            ) : null}

            {dgs && (dgs.dgs_event_url || dgs.dgs_course_url) ? (
              <div className="rounded-md border bg-muted/40 p-2 text-[11px] space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Disc Golf Scene registration</span>
                  {dgs.dgs_event_url ? (
                    <a
                      href={dgs.dgs_event_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {dgs.dgs_event_title ?? dgs.dgs_event_slug ?? "Open event"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Not linked</span>
                  )}
                </div>
                {dgs.dgs_course_url ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">DGS course</span>
                    <a
                      href={dgs.dgs_course_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      {dgs.dgs_course_name ?? dgs.dgs_course_slug ?? "Course page"}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                ) : null}
                {dgs.dgs_course ? (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {dgs.dgs_course.holes != null && (
                      <Badge variant="outline" className="text-[10px]">
                        {dgs.dgs_course.holes} holes
                      </Badge>
                    )}
                    {dgs.dgs_course.par != null && (
                      <Badge variant="outline" className="text-[10px]">
                        Par {dgs.dgs_course.par}
                      </Badge>
                    )}
                    {dgs.dgs_course.length_ft != null && (
                      <Badge variant="outline" className="text-[10px]">
                        {dgs.dgs_course.length_ft.toLocaleString()} ft
                      </Badge>
                    )}
                    {dgs.dgs_course.city && (
                      <Badge variant="outline" className="text-[10px]">
                        {dgs.dgs_course.city}
                        {dgs.dgs_course.state ? `, ${dgs.dgs_course.state}` : ""}
                      </Badge>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* UDisc drop-in — richest per-layout data for verification */}
            <div className="rounded-md border bg-muted/20 p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] text-muted-foreground">
                  UDisc course URL (optional — pulls layouts, par, and length)
                </Label>
                {udiscResult?.course ? (
                  <a
                    href={udiscResult.course.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] underline text-muted-foreground inline-flex items-center gap-1"
                  >
                    Open on UDisc <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Input
                  value={udiscUrl}
                  onChange={(e) => setUdiscUrl(e.target.value)}
                  placeholder="https://udisc.com/courses/maple-hill-lCej"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => udiscMut.mutate(udiscUrl.trim())}
                  disabled={!udiscUrl.trim() || udiscMut.isPending}
                >
                  {udiscMut.isPending ? "Loading…" : "Load UDisc"}
                </Button>
              </div>
              {udiscResult?.course ? (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {udiscResult.course.name}
                    </Badge>
                    {udiscResult.course.city ? (
                      <Badge variant="outline" className="text-[10px]">
                        {udiscResult.course.city}
                        {udiscResult.course.state ? `, ${udiscResult.course.state}` : ""}
                      </Badge>
                    ) : null}
                    {udiscResult.course.holes != null ? (
                      <Badge variant="outline" className="text-[10px]">
                        {udiscResult.course.holes} holes
                      </Badge>
                    ) : null}
                    {udiscResult.course.estimated_length_mi != null ? (
                      <Badge variant="outline" className="text-[10px]">
                        {udiscResult.course.estimated_length_mi} mi
                      </Badge>
                    ) : null}
                    {udiscResult.course.elevation ? (
                      <Badge variant="outline" className="text-[10px]">
                        {udiscResult.course.elevation}
                      </Badge>
                    ) : null}
                    {udiscResult.course.established_year ? (
                      <Badge variant="outline" className="text-[10px]">
                        Est. {udiscResult.course.established_year}
                      </Badge>
                    ) : null}
                  </div>
                  {udiscResult.course.layouts.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="text-muted-foreground">
                          <tr className="text-left">
                            <th className="py-0.5 pr-2 font-medium">Layout</th>
                            <th className="py-0.5 pr-2 font-medium">Holes</th>
                            <th className="py-0.5 pr-2 font-medium">Par</th>
                            <th className="py-0.5 pr-2 font-medium">Length</th>
                            <th className="py-0.5 pr-2 font-medium">Difficulty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {udiscResult.course.layouts.map((l, i) => (
                            <tr key={i} className="border-t border-border/40">
                              <td className="py-0.5 pr-2">{l.name}</td>
                              <td className="py-0.5 pr-2">{l.holes ?? "—"}</td>
                              <td className="py-0.5 pr-2">{l.par ?? "—"}</td>
                              <td className="py-0.5 pr-2">
                                {l.length_ft != null ? `${l.length_ft.toLocaleString()} ft` : "—"}
                              </td>
                              <td className="py-0.5 pr-2">{l.difficulty ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : udiscResult?.error ? (
                <p className="text-[11px] text-destructive">{udiscResult.error}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Paste a UDisc course page URL to pull layout par and length data.
                </p>
              )}
            </div>

            <div className="space-y-2">
              {urls.map((u, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-1">
                    {i === 0 ? (
                      <Label className="text-[10px] text-muted-foreground">
                        PDGA Leaders URL #{i + 1}
                      </Label>
                    ) : null}
                    <Input
                      value={u}
                      onChange={(e) => setUrl(i, e.target.value)}
                      placeholder="https://www.pdga.com/live/event/98804/leaders?round=1"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUrl(i)}
                    aria-label="Remove URL"
                    className={i === 0 ? "mt-5" : ""}
                    disabled={urls.length === 1 && !urls[0]}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={addUrl}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add another URL
                </Button>
                <Button
                  size="sm"
                  onClick={runAnalyze}
                  disabled={lookupMut.isPending}
                  className="ml-auto"
                >
                  {lookupMut.isPending ? "Analyzing…" : "Analyze URLs"}
                </Button>
              </div>
            </div>

            {/* Results */}
            {lookupResult?.events?.length ? (
              <div className="space-y-2">
                {lookupResult.events.map((ev) => (
                  <div
                    key={ev.event_ref}
                    className="rounded-md border bg-muted/30 p-2 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">
                        <a
                          href={`/events/pdga/${ev.event_ref}`}
                          className="hover:text-primary hover:underline underline-offset-2"
                        >
                          {ev.event_name ?? `Event ${ev.event_ref}`}
                        </a>
                        {ev.event_date ? (
                          <span className="text-muted-foreground"> · {ev.event_date}</span>
                        ) : null}
                      </div>
                      <a
                        href={`https://www.pdga.com/tour/event/${ev.event_ref}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        PDGA
                      </a>
                    </div>
                    {ev.error ? (
                      <div className="text-destructive">{ev.error}</div>
                    ) : ev.summaries.length ? (
                      <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-x-3 gap-y-0.5 items-center">
                        <div className="text-[10px] uppercase text-muted-foreground">Round</div>
                        <div className="text-[10px] uppercase text-muted-foreground">SSA</div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Stroke value
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Winning score
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">Players</div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Score for {targetRating}
                        </div>
                        {ev.summaries.map((s) => {
                          const reqPerEvent =
                            s.ssa != null && s.stroke_value != null && s.stroke_value > 0
                              ? Math.round(s.ssa + (1000 - targetRating) / s.stroke_value)
                              : null;
                          return (
                            <div key={s.round} className="contents">
                              <div className="tabular-nums">R{s.round}</div>
                              <div className="tabular-nums">{s.ssa ?? "—"}</div>
                              <div className="tabular-nums">{s.stroke_value ?? "—"}</div>
                              <div className="tabular-nums">
                                {s.winning_score ?? "—"}
                                {s.winning_rating != null ? (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({s.winning_rating})
                                  </span>
                                ) : null}
                              </div>
                              <div className="tabular-nums">{s.n}</div>
                              <div className="tabular-nums font-medium text-primary">
                                {reqPerEvent ?? "—"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">
                        No rated rounds on file for this event yet.
                      </div>
                    )}
                  </div>
                ))}

                {/* Combined verdict */}
                {model.n > 0 ? (
                  <CombinedVerdict
                    model={model}
                    targetRating={targetRating}
                    par={active.par_total ?? Math.round(model.ssa)}
                  />
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No PDGA data pulled yet. Paste one or more Leaders URLs above, or hit{" "}
                <strong>Auto-find past events</strong>.
              </p>
            )}

            {lookupResult?.rejected?.length ? (
              <div className="rounded-md border border-dashed p-2 text-[11px] space-y-1">
                <div className="font-medium text-muted-foreground">
                  Skipped {lookupResult.rejected.length} unverified event
                  {lookupResult.rejected.length === 1 ? "" : "s"}
                </div>
                <ul className="space-y-0.5">
                  {lookupResult.rejected.map((r) => (
                    <li key={r.event_ref} className="text-muted-foreground">
                      <a
                        href={`https://www.pdga.com/tour/event/${r.event_ref}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2"
                      >
                        {r.event_name ?? `Event ${r.event_ref}`}
                      </a>{" "}
                      — {r.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Submit as verified course ratings profile */}
            {model.n > 0 ? (
              <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-3">
                {approvedProfile ? (
                  <div className="flex items-start gap-2">
                    <Lock className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div className="text-xs">
                      <div className="font-semibold text-primary">Course rating profile locked</div>
                      <div className="text-muted-foreground mt-0.5">
                        This course already has an approved PDGA rating profile:{" "}
                        <span className="font-medium text-foreground tabular-nums">
                          SSA {Number(approvedProfile.ssa).toFixed(1)} · stroke value{" "}
                          {Number(approvedProfile.stroke_value).toFixed(1)}
                        </span>{" "}
                        · {approvedProfile.sample_size} rated rounds. Contact a super admin if it
                        needs updating.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div className="text-xs space-y-1">
                        <div className="font-semibold text-sm">
                          Submit as verified course rating profile
                        </div>
                        <div className="text-muted-foreground">
                          Review the fitted values below, then submit for super admin approval. Once
                          approved, this becomes the official PDGA rating profile for{" "}
                          {active.course_name ?? "this course"} across the entire app.
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-background/60 rounded-md p-2 border">
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">SSA</div>
                        <div className="font-semibold tabular-nums">
                          {(Math.round(model.ssa * 10) / 10).toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Stroke value
                        </div>
                        <div className="font-semibold tabular-nums">
                          {(Math.round(model.stroke_value * 10) / 10).toFixed(1)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          Rated rounds
                        </div>
                        <div className="font-semibold tabular-nums">{model.n}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-muted-foreground">Events</div>
                        <div className="font-semibold tabular-nums">
                          {lookupResult?.events?.length ?? 0}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="profile-notes" className="text-[11px]">
                        Notes for reviewer (optional)
                      </Label>
                      <Textarea
                        id="profile-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Long tees, standard layout used in 2024 A-tier."
                        rows={2}
                        className="text-xs"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground">
                        {active.course_id
                          ? "Will lock as this course's official profile once approved."
                          : "No internal course link — submission will still be reviewed."}
                      </div>
                      <Button size="sm" onClick={submitProfile} disabled={submitMut.isPending}>
                        <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                        {submitMut.isPending ? "Submitting…" : "Submit Course Ratings"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CombinedVerdict({
  model,
  targetRating,
  par,
}: {
  model: ReturnType<typeof buildCourseModel>;
  targetRating: number;
  par: number;
}) {
  const reqScore = requiredScore(model, targetRating);
  const toPar = reqScore - par;
  const conf = courseConfidence(model, targetRating);
  return (
    <div className="rounded-md border bg-primary/5 p-3 space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        Combined projection across all analyzed events
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Fitted SSA" value={String(Math.round(model.ssa * 10) / 10)} />
        <Stat label="Stroke value" value={String(Math.round(model.stroke_value * 10) / 10)} />
        <Stat label={`Score for ${targetRating}`} value={String(reqScore)} accent />
        <Stat label="To par" value={(toPar > 0 ? "+" : "") + toPar} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {conf.message} Based on {model.n} rated round{model.n === 1 ? "" : "s"} at this course.
      </p>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>
        {value}
      </div>
    </div>
  );
}
