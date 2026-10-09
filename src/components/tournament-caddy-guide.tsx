import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, MapPin, Ruler } from "lucide-react";

type Round = {
  id: string;
  round_number: number;
  course_id: string | null;
  layout_id: string | null;
  starts_at: string | null;
};
type Course = { id: string; name: string; city: string | null; state: string | null };
type Layout = {
  id: string;
  name: string;
  hole_count: number;
  par_total: number | null;
  distance_total: number | null;
};
type Hole = {
  id: string;
  layout_id: string;
  number: number;
  nickname: string | null;
  par: number;
  distance_ft: number | null;
  notes: string | null;
  caddy_notes: string | null;
};

export function TournamentCaddyGuide({
  tournamentName,
  rounds,
}: {
  tournamentName: string;
  rounds: Round[];
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [holes, setHoles] = useState<Hole[]>([]);
  const [obNotes, setObNotes] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const cacheKey = `dgd-caddy-guide:${rounds.map((r) => r.id).sort().join(",")}`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const applyCache = () => {
        try {
          const raw = localStorage.getItem(cacheKey);
          if (!raw) return false;
          const c = JSON.parse(raw);
          setCourses(c.courses ?? []);
          setLayouts(c.layouts ?? []);
          setHoles(c.holes ?? []);
          setObNotes(new Map(c.obNotes ?? []));
          setSavedAt(c.savedAt ?? null);
          setFromCache(true);
          return true;
        } catch {
          return false;
        }
      };
      if (typeof navigator !== "undefined" && !navigator.onLine && applyCache()) {
        setLoading(false);
        return;
      }
      try {
      const courseIds = [...new Set(rounds.map((r) => r.course_id).filter(Boolean))] as string[];
      const layoutIds = [...new Set(rounds.map((r) => r.layout_id).filter(Boolean))] as string[];
      if (!courseIds.length || !layoutIds.length) {
        setLoading(false);
        return;
      }
      const [{ data: cs }, { data: ls }, { data: hs }, { data: features }] = await Promise.all([
        supabase.from("courses").select("id, name, city, state").in("id", courseIds),
        supabase
          .from("course_layouts")
          .select("id, name, hole_count, par_total, distance_total")
          .in("id", layoutIds),
        supabase
          .from("holes")
          .select("id, layout_id, number, nickname, par, distance_ft, notes, caddy_notes")
          .in("layout_id", layoutIds)
          .order("number"),
        supabase
          .from("course_features")
          .select("hole_id, kind, notes, scope")
          .in("layout_id", layoutIds)
          .in("kind", ["ob_line", "ob_area", "water", "drop_zone", "mando"]),
      ]);
      if (!cs || !ls || !hs) throw new Error("offline");
      setCourses((cs as Course[]) ?? []);
      setLayouts((ls as Layout[]) ?? []);
      setHoles((hs as Hole[]) ?? []);
      const noteMap = new Map<string, string[]>();
      for (const f of (features as any[]) ?? []) {
        if (!f.hole_id) continue;
        const arr = noteMap.get(f.hole_id) ?? [];
        const label = `${String(f.kind).replace(/_/g, " ").toUpperCase()}${f.notes ? ` — ${f.notes}` : ""}`;
        arr.push(label);
        noteMap.set(f.hole_id, arr);
      }
      setObNotes(noteMap);
      setFromCache(false);
      // Keep a copy on this device so the guide still opens with no signal on the course.
      try {
        const stamp = new Date().toISOString();
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ courses: cs ?? [], layouts: ls ?? [], holes: hs ?? [], obNotes: [...noteMap], savedAt: stamp }),
        );
        setSavedAt(stamp);
      } catch {}
      } catch {
        applyCache();
      }
      setLoading(false);
    })();
  }, [rounds, cacheKey]);

  const grouped = useMemo(() => {
    return rounds.map((r) => {
      const layout = layouts.find((l) => l.id === r.layout_id);
      const course = courses.find((c) => c.id === r.course_id);
      const roundHoles = holes.filter((h) => h.layout_id === r.layout_id);
      return { round: r, course, layout, holes: roundHoles };
    });
  }, [rounds, courses, layouts, holes]);

  if (loading)
    return <div className="text-sm text-muted-foreground">Building your caddy guide…</div>;
  if (rounds.length === 0)
    return (
      <div className="text-sm text-muted-foreground">
        Add rounds first — the caddy guide is built from each round's layout.
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div className="text-sm text-muted-foreground">
          Printable one-page-per-round guide with distances, pars, and hole notes.
          {savedAt ? (
            <div className="mt-0.5 text-xs">
              {fromCache ? "Offline copy" : "Saved on this device for offline use"} ·{" "}
              {new Date(savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
          ) : null}
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="mr-1 h-4 w-4" />
          Print / Save PDF
        </Button>
      </div>

      <div id="caddy-guide" className="space-y-6 print:space-y-0">
        {grouped.map(({ round, course, layout, holes: hs }) => (
          <section
            key={round.id}
            className="rounded-xl border border-border bg-card p-4 print:break-after-page print:border-0 print:bg-white print:text-black"
          >
            <header className="mb-3 border-b border-border pb-3 print:border-black/20">
              <div className="text-xs uppercase tracking-widest text-muted-foreground print:text-black/60">
                Round {round.round_number}
              </div>
              <h2 className="font-display text-xl font-bold">{tournamentName}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground print:text-black/70">
                {course ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {course.name}
                    {course.city ? `, ${course.city}` : ""}
                    {course.state ? `, ${course.state}` : ""}
                  </span>
                ) : null}
                {layout ? (
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5" />
                    {layout.name} · {layout.hole_count} holes · par {layout.par_total ?? "—"}
                    {layout.distance_total ? ` · ${layout.distance_total.toLocaleString()} ft` : ""}
                  </span>
                ) : null}
                {round.starts_at ? <span>{new Date(round.starts_at).toLocaleString()}</span> : null}
              </div>
            </header>

            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground print:text-black/60">
                <tr className="border-b border-border">
                  <th className="py-1 text-left">Hole</th>
                  <th className="py-1 text-right">Par</th>
                  <th className="py-1 text-right">Dist</th>
                  <th className="py-1 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {hs.map((h) => {
                  const notes = [h.notes, h.caddy_notes, ...(obNotes.get(h.id) ?? [])]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <tr key={h.id} className="border-b border-border/50 align-top">
                      <td className="py-1.5 font-semibold">{h.nickname || h.number}</td>
                      <td className="py-1.5 text-right">{h.par}</td>
                      <td className="py-1.5 text-right">
                        {h.distance_ft ? `${h.distance_ft}′` : "—"}
                      </td>
                      <td className="py-1.5 text-xs">
                        {notes || (
                          <span className="text-muted-foreground/60 print:text-black/40">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          #caddy-guide section { page-break-after: always; }
        }
      `}</style>
    </div>
  );
}
