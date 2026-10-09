import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  decideCourseMatch,
  mergeCoursePair,
  listCourseMatches,
  refreshCourseMatches,
  type CourseMatchCandidate,
  type MatchCourse,
} from "@/lib/course-matches.functions";

const SOURCE_LABEL: Record<string, string> = {
  pdga: "PDGA",
  udisc: "UDisc",
  dgs: "Disc Golf Scene",
  osm: "OpenStreetMap",
  dgcr: "DG Course Review",
};

const CONF_LABEL = { high: "Likely the same", medium: "Possibly the same", low: "Probably separate" } as const;

function CourseCell({ c }: { c: MatchCourse }) {
  const listed = Array.from(new Set([c.source, ...c.sources].filter(Boolean) as string[]));
  return (
    <div className="min-w-48 flex-1">
      <Link to="/courses/$courseId" params={{ courseId: c.id }} className="font-medium text-foreground hover:underline">
        {c.name}
      </Link>
      <div className="text-sm text-muted-foreground">
        {[c.city, c.state].filter(Boolean).join(", ") || "Town not listed"}
        {c.hole_count ? ` · ${c.hole_count} holes` : ""}
      </div>
      <div className="text-sm text-muted-foreground">
        Listed on {listed.length ? listed.map((s) => SOURCE_LABEL[s] ?? s).join(", ") : "no outside site"}
      </div>
    </div>
  );
}

function Row({ m, onDone }: { m: CourseMatchCandidate; onDone: () => void }) {
  const decide = useServerFn(decideCourseMatch);
  const merge = useServerFn(mergeCoursePair);
  const [busy, setBusy] = useState(false);
  const keep = async (c: MatchCourse) => {
    setBusy(true);
    try {
      await merge({ data: { id: m.id, keepId: c.id } });
      toast.success(`Joined into ${c.name}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't join those courses.");
    } finally {
      setBusy(false);
    }
  };
  const act = async (status: "same" | "different") => {
    setBusy(true);
    try {
      await decide({ data: { id: m.id, status } });
      toast.success(status === "same" ? "Marked as the same course" : "Kept as separate courses");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that decision.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="border-b border-border py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={m.confidence === "high" ? "default" : "secondary"}>{CONF_LABEL[m.confidence]}</Badge>
        <span className="text-sm text-muted-foreground">{m.reasons.join(" · ")}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-4">
        {[m.a, m.b].map((c) => (
          <div key={c.id} className="flex min-w-48 flex-1 flex-col gap-2">
            <CourseCell c={c} />
            <Button size="sm" className="self-start" disabled={busy} onClick={() => keep(c)}>
              Same course · keep this one
            </Button>
          </div>
        ))}
        <div className="flex items-start gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act("different")}>Different courses</Button>
        </div>
      </div>
    </li>
  );
}

/** Pairs of courses that may be one venue listed twice. Nothing is merged automatically. */
export function CourseMatchesQueue() {
  const list = useServerFn(listCourseMatches);
  const refresh = useServerFn(refreshCourseMatches);
  const qc = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["course-matches", offset],
    queryFn: () => list({ data: { offset } }),
  });
  const reload = () => qc.invalidateQueries({ queryKey: ["course-matches"] });
  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Copy className="h-5 w-5 text-primary" aria-hidden />
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Possible duplicate courses{data ? ` (${data.total})` : ""}</h2>
          <p className="text-sm text-muted-foreground">
            Courses with similar names close together. Keeping one hides the other and moves its outside listings over; its rounds stay safe. Names like North/South or Red/Blue usually mean two real courses in one park.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              const r = await refresh();
              toast.success(`Checked the library · ${r.updated} pairs updated`);
              reload();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Couldn't check right now.");
            } finally {
              setRefreshing(false);
            }
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Check again
        </Button>
      </div>
      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Looking for look-alikes…</p>
      ) : data && data.rows.length ? (
        <ul className="mt-3">
          {data.rows.map((m) => <Row key={m.id} m={m} onDone={reload} />)}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No look-alike courses waiting for a decision.</p>
      )}
      {data && data.total > 25 ? (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - 25))}>Previous</Button>
          <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}</span>
          <Button size="sm" variant="secondary" disabled={offset + 25 >= data.total} onClick={() => setOffset((o) => o + 25)}>Next</Button>
        </div>
      ) : null}
    </section>
  );
}
