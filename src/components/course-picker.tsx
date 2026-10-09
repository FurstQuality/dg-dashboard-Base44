import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, MapPin, ExternalLink, Database, Loader2, MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPlaceholderCourse } from "@/lib/placeholder-course.functions";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { kbSearchCourses } from "@/lib/pdga-kb-lookup.functions";
import { loadPlayerLayoutOrder } from "@/lib/layout-activity";

export type PickedCourse = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  hole_count: number;
  /** Layouts saved in the Course Builder for this course. */
  layout_count?: number;
  /** True when a saved layout carries full builder measurements. */
  layout_verified?: boolean;
};
export type PickedLayout = { id: string; name: string; hole_count: number | null };

type Props = {
  courseId: string | null;
  layoutId: string | null;
  onCourse: (c: PickedCourse | null) => void;
  onLayout: (l: PickedLayout | null) => void;
};

export function CoursePicker({ courseId, layoutId, onCourse, onLayout }: Props) {
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<PickedCourse[]>([]);
  const [layouts, setLayouts] = useState<PickedLayout[]>([]);
  const [loading, setLoading] = useState(false);
  const runKbCourses = useServerFn(kbSearchCourses);
  const kbHits = useQuery({
    queryKey: ["course-picker-kb", q],
    queryFn: () => runKbCourses({ data: { q: q.trim(), limit: 6 } }),
    enabled: q.trim().length >= 2 && courses.length < 3,
    staleTime: 60_000,
  });

  const [layoutCounts, setLayoutCounts] = useState<Record<string, number>>({});
  const [layoutVerified, setLayoutVerified] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const query = supabase
        .from("courses")
        .select("id, name, city, state, latitude, longitude, hole_count")
        .eq("moderation_status", "approved")
        .order("name", { ascending: true })
        .limit(50);
      if (q.trim()) {
        query.or(`name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`);
      }
      const { data } = await query;
      if (cancelled) return;
      const rows = (data as PickedCourse[]) ?? [];
      setCourses(rows);
      setLoading(false);
      if (rows.length) {
        const { data: lays } = await supabase
          .from("course_layouts")
          .select("course_id, hole_count, distance_total")
          .in(
            "course_id",
            rows.map((r) => r.id),
          );
        if (cancelled) return;
        const counts: Record<string, number> = {};
        const verified: Record<string, boolean> = {};
        for (const l of lays ?? []) {
          const row = l as {
            course_id: string;
            hole_count: number | null;
            distance_total: number | null;
          };
          counts[row.course_id] = (counts[row.course_id] ?? 0) + 1;
          if ((row.hole_count ?? 0) > 0 && (row.distance_total ?? 0) > 0)
            verified[row.course_id] = true;
        }
        setLayoutCounts(counts);
        setLayoutVerified(verified);
      } else {
        setLayoutCounts({});
        setLayoutVerified({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => {
    (async () => {
      if (!courseId) return setLayouts([]);
      const { data } = await supabase
        .from("course_layouts")
        .select("id, name, hole_count")
        .eq("course_id", courseId);
      // Most recently played layouts first, so the busy ones are easy to grab.
      const ranked = await loadPlayerLayoutOrder(courseId, (data as PickedLayout[]) ?? []);
      setLayouts(ranked);
    })();
  }, [courseId]);

  const selected = useMemo(
    () => courses.find((c) => c.id === courseId) ?? null,
    [courses, courseId],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Course</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search approved courses…"
            className="pl-9"
          />
        </div>
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground">Searching…</div>
          ) : courses.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No approved courses match.</div>
          ) : (
            courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onCourse({
                    ...c,
                    layout_count: layoutCounts[c.id] ?? 0,
                    layout_verified: !!layoutVerified[c.id],
                  });
                  onLayout(null);
                }}
                className={`flex w-full items-center justify-between border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted ${courseId === c.id ? "bg-primary/10" : ""}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {[c.city, c.state].filter(Boolean).join(", ") || "Location unknown"}
                    <span className="ml-2">{c.hole_count} holes</span>
                  </div>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  {(layoutCounts[c.id] ?? 0) > 0 ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                      {layoutVerified[c.id] ? "Verified · " : ""}
                      {layoutCounts[c.id]} layout{layoutCounts[c.id] === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                      Needs layout
                    </span>
                  )}
                  {courseId === c.id ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] uppercase text-primary-foreground">
                      Selected
                    </span>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Can't find your course?{" "}
          <Link
            to="/courses"
            search={{ add: "1", q: q.trim() } as never}
            target="_blank"
            className="text-primary underline"
          >
            Add it on the course map <ExternalLink className="inline h-3 w-3" />
          </Link>
        </div>

        <PlaceholderCourseAdder
          defaultName={q.trim()}
          onCreated={(c: PickedCourse) => {
            setCourses((prev) => (prev.some((p) => p.id === c.id) ? prev : [c, ...prev]));
            onCourse(c);
            onLayout(null);
          }}
        />

        {q.trim().length >= 2 && (kbHits.data?.length ?? 0) > 0 ? (
          <div className="mt-3 rounded-md border border-dashed border-border/70 p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Database className="h-3 w-3" /> PDGA Knowledge Base matches
            </div>
            <div className="space-y-1">
              {(kbHits.data ?? []).map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{k.name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {[k.city, k.state].filter(Boolean).join(", ") || "—"}
                      {k.hole_count ? ` · ${k.hole_count} holes` : ""}
                    </span>
                  </div>
                  <Link
                    to="/courses"
                    search={{ add: "1", q: k.name } as never}
                    target="_blank"
                    className="shrink-0 text-primary hover:underline"
                  >
                    Add to library
                  </Link>
                  {k.pdga_url ? (
                    <a
                      href={k.pdga_url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-muted-foreground hover:underline"
                    >
                      pdga.com <ExternalLink className="inline h-3 w-3" />
                    </a>
                  ) : null}
                </div>
              ))}
              <div className="mt-1 text-[11px] text-muted-foreground">
                These come straight from the PDGA course directory. Adding one brings its details
                into your library — the builder checks for an existing copy first.
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {selected ? (
        <div className="space-y-1.5">
          <Label>Layout</Label>
          {layouts.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              No named layouts saved for this course yet — we'll score against the default layout.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {layouts.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => onLayout(l)}
                  className={`rounded-md border px-3 py-2 text-left text-sm transition ${layoutId === l.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
                >
                  <div className="font-medium">{l.name}</div>
                  {l.hole_count ? (
                    <div className="text-xs text-muted-foreground">{l.hole_count} holes</div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Adds a name-only "placeholder" course for events at a venue that isn't in the
 * library yet. It carries no holes, layouts, or measurements — scoring and
 * ratings stay unavailable until somebody builds it in the course builder.
 */
function PlaceholderCourseAdder({
  defaultName,
  onCreated,
}: {
  defaultName: string;
  onCreated: (course: PickedCourse) => void;
}) {
  const create = useServerFn(createPlaceholderCourse);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [holes, setHoles] = useState("18");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setName(defaultName);
          setOpen(true);
        }}
      >
        <MapPinOff className="mr-1.5 h-4 w-4" />
        Use a course that isn't in the directory
      </Button>
    );
  }

  async function submit() {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      toast.error("Give the course a name of at least 3 characters.");
      return;
    }
    setBusy(true);
    try {
      const row = await create({
        data: {
          name: trimmed,
          city: city.trim() || undefined,
          state: state.trim() || undefined,
          hole_count: Number(holes) || 18,
        },
      });
      onCreated({
        id: row.id,
        name: row.name,
        city: row.city,
        state: row.state,
        latitude: null,
        longitude: null,
        hole_count: row.hole_count,
        layout_count: 0,
        layout_verified: false,
      });
      toast.success(
        row.reused
          ? `Matched an existing course: ${row.name}`
          : `Added ${row.name} as a placeholder`,
        {
          description: row.reused
            ? "Using the course already in your library instead of a duplicate."
            : "No holes or layouts yet — build it later to unlock scoring and ratings.",
        },
      );
      setOpen(false);
      setCity("");
      setState("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add that course.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
      <p className="text-[12px] text-muted-foreground">
        Placeholder course — name and location only. It won't appear in the public course directory,
        and hole-by-hole scoring stays off until it's built in the course builder.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Course name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Miller Farm temporary layout"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Asheville" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">State</Label>
          <Input value={state} onChange={(e) => setState(e.target.value)} placeholder="NC" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Holes</Label>
          <Input
            type="number"
            min={1}
            max={36}
            value={holes}
            onChange={(e) => setHoles(e.target.value)}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => void submit()} disabled={busy}>
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Add placeholder course
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
