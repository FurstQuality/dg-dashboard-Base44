import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listCourseMapPins } from "@/lib/course-directory.functions";
import { repairCourseData } from "@/lib/course-repair.functions";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Coverage = {
  canonical: number;
  directory_ready: number;
  pin_ready: number;
  pin_exact: number;
  pin_approximate: number;
  missing_location: number;
  pending_review: number;
  rejected: number;
  ghosts: number;
  joined: number;
};

type Diagnostic = {
  approved: boolean;
  moderation_status: string | null;
  not_ghost: boolean;
  not_joined: boolean;
  has_location: boolean;
  location_quality: string | null;
  should_be_on_map: boolean;
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

/**
 * Directory map guarantee: every approved, located, non-duplicate course must
 * come back from the same query the Courses map uses. Any gap is a bug.
 */
export function DirectoryMapCoverage() {
  const pins = useServerFn(listCourseMapPins);
  const coverage = useQuery({
    queryKey: ["admin", "directory-map-coverage"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("directory_map_coverage");
      if (error) throw error;
      return data as unknown as Coverage;
    },
  });
  const queryable = useQuery({
    queryKey: ["admin", "directory-map-queryable"],
    staleTime: 60_000,
    queryFn: async () => (await pins({ data: {} })).length,
  });

  const c = coverage.data;
  const gap = c && queryable.data != null ? c.pin_ready - queryable.data : null;

  const rows: [string, number | undefined, string][] = c
    ? [
        ["Canonical courses", c.canonical, "one record per real course, after joins and ghosts"],
        ["Directory ready", c.directory_ready, "approved for the public directory"],
        ["Directory pin ready", c.pin_ready, `${fmt(c.pin_exact)} exact · ${fmt(c.pin_approximate)} approximate`],
        ["Missing location", c.missing_location, "approved but no map spot yet"],
        ["Waiting for review", c.pending_review, "new courses not public yet"],
        ["Hidden", c.ghosts + c.joined + c.rejected, `${fmt(c.ghosts)} not courses · ${fmt(c.joined)} joined · ${fmt(c.rejected)} rejected`],
      ]
    : [];

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Directory map coverage</h2>
        {gap == null ? (
          <span className="text-sm text-muted-foreground">Checking the map…</span>
        ) : gap === 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="h-4 w-4" /> Every pin-ready course is on the map ({fmt(queryable.data)})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Map coverage error: {fmt(Math.abs(gap))} courses
            {gap > 0 ? " missing from" : " extra on"} the map
          </span>
        )}
      </div>
      {coverage.isError && <p className="text-sm text-muted-foreground">Coverage couldn't load. Try refreshing.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value, hint]) => (
          <div key={label} className="min-w-0 rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-xl font-semibold tabular-nums">{fmt(value)}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        ))}
      </div>
      <WhyNotOnMap />
    </section>
  );
}

function WhyNotOnMap() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ id: string; name: string; d: Diagnostic | null }[] | null>(null);
  const repair = useServerFn(repairCourseData);
  const [repairing, setRepairing] = useState<string | null>(null);
  async function runRepair(id: string) {
    setRepairing(id);
    try {
      const r = await repair({ data: { courseId: id } });
      toast.success(
        `${r.pin}. ${r.listingsRead} listing${r.listingsRead === 1 ? "" : "s"} re-read` +
          (r.parFilled ? ` · ${r.parFilled} pars filled` : "") +
          (r.draftLayouts ? ` · ${r.draftLayouts} draft layouts` : "") +
          (r.listingsFailed ? ` · ${r.listingsFailed} couldn't be read, retry queued` : ""),
      );
      void check();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Repair didn't finish. Try again.");
    } finally {
      setRepairing(null);
    }
  }
  const [busy, setBusy] = useState(false);

  async function check() {
    const term = q.trim().replace(/[%,()]/g, " ");
    if (!term) return;
    setBusy(true);
    const { data } = await supabase.from("courses").select("id, name").ilike("name", `%${term}%`).limit(5);
    const out = await Promise.all(
      (data ?? []).map(async (c) => {
        const { data: d } = await supabase.rpc("course_directory_diagnostic", { _course_id: c.id });
        return { id: c.id as string, name: c.name as string, d: d as unknown as Diagnostic | null };
      }),
    );
    setResult(out);
    setBusy(false);
  }

  const line = (ok: boolean, text: string) => (
    <li className={ok ? "text-foreground" : "text-destructive"}>{ok ? "✓" : "✗"} {text}</li>
  );

  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">Why isn't a course on the map?</summary>
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void check();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Course name" className="max-w-xs" />
        <Button type="submit" size="sm" disabled={busy}>
          <Search className="mr-1 h-4 w-4" /> Check
        </Button>
      </form>
      {result && result.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No course by that name.</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {result?.map(({ id, name, d }) => (
          <div key={id} className="rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{name}</div>
              <Button size="sm" variant="outline" disabled={repairing === id} onClick={() => void runRepair(id)}>
                {repairing === id ? "Repairing…" : "Repair course data"}
              </Button>
            </div>
            {d ? (
              <ul className="mt-1 space-y-0.5">
                {line(d.approved, d.approved ? "Approved for the directory" : `Not public (${d.moderation_status ?? "unknown"})`)}
                {line(d.not_ghost, d.not_ghost ? "A real course" : "Hidden as not a course")}
                {line(d.not_joined, d.not_joined ? "Its own record" : "Joined into another course")}
                {line(d.has_location, d.has_location ? `Has a map spot (${d.location_quality ?? "unknown"})` : "No map spot yet")}
                <li className="pt-1 font-medium">{d.should_be_on_map ? "Should be on the map" : "Not on the map for the reason above"}</li>
              </ul>
            ) : (
              <p className="text-muted-foreground">Couldn't check this course.</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
