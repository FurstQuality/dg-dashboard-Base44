import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crosshair } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { scrambleTally, summarizeThrows, type ThrowRow } from "@/lib/throw-stats";

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

type Row = ThrowRow & { hole_key: string; round_id: string; hole_number: number; disc_id: string | null };
type Split = "all" | "course" | "hole" | "disc";

/** Shot statistics from throws recorded with Record throw on the scorecard. */
export function ThrowStatsCard() {
  const [split, setSplit] = useState<Split>("all");
  const [courseFilter, setCourseFilter] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["throw-stats", "me", "v2"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data: rp } = await supabase.from("round_players").select("id").eq("user_id", auth.user.id).limit(1000);
      const ids = (rp ?? []).map((r) => r.id).slice(0, 300);
      if (!ids.length) return { rows: [] as Row[], rounds: new Map(), pars: new Map(), strokes: new Map(), discs: new Map() };
      const { data } = await supabase.from("round_throws")
        .select("round_id,hole_number,round_player_id,throw_number,throw_type,distance_zone,lie_area,start_zone,made,holed_out,disc_id")
        .in("round_player_id", ids).limit(10000);
      const rows = (data ?? []).map((r) => ({ ...(r as unknown as Row), hole_key: `${r.round_id}:${r.round_player_id}:${r.hole_number}` }));
      const roundIds = [...new Set(rows.map((r) => r.round_id))].slice(0, 300);
      const discIds = [...new Set(rows.map((r) => r.disc_id).filter(Boolean))] as string[];
      const [{ data: rds }, { data: sc }, { data: dz }] = await Promise.all([
        roundIds.length ? supabase.from("rounds").select("id,course_id,layout_id,courses(name)").in("id", roundIds) : Promise.resolve({ data: [] }),
        supabase.from("round_scores").select("round_player_id,round_id,hole_number,strokes").in("round_player_id", ids).limit(10000),
        discIds.length ? supabase.from("user_discs").select("id,nickname,plastic_name,disc_molds(name)").in("id", discIds) : Promise.resolve({ data: [] }),
      ]);
      const rounds = new Map<string, { course_id: string | null; course: string; layout_id: string | null }>();
      for (const r of (rds ?? []) as any[]) rounds.set(r.id, { course_id: r.course_id, course: r.courses?.name ?? "Course", layout_id: r.layout_id });
      const layoutIds = [...new Set([...rounds.values()].map((r) => r.layout_id).filter(Boolean))] as string[];
      const { data: hs } = layoutIds.length
        ? await supabase.from("holes").select("layout_id,number,par").in("layout_id", layoutIds)
        : { data: [] as any[] };
      const pars = new Map<string, number | null>();
      for (const h of (hs ?? []) as any[]) pars.set(`${h.layout_id}:${h.number}`, h.par ?? null);
      const strokes = new Map<string, number>();
      for (const s of (sc ?? []) as any[]) strokes.set(`${s.round_id}:${s.round_player_id}:${s.hole_number}`, s.strokes);
      const discs = new Map<string, string>();
      for (const d of (dz ?? []) as any[]) discs.set(d.id, d.nickname || d.disc_molds?.name || d.plastic_name || "Disc");
      return { rows, rounds, pars, strokes, discs };
    },
  });

  const d = q.data;
  const courses = useMemo(() => {
    if (!d) return [] as [string, string][];
    const m = new Map<string, string>();
    for (const r of d.rows) { const rd = d.rounds.get(r.round_id); if (rd?.course_id) m.set(rd.course_id, rd.course); }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [d]);

  if (!d) return null;
  const scrambleOf = (rows: Row[]) => {
    const byHole = new Map<string, Row[]>();
    for (const r of rows) byHole.set(r.hole_key, [...(byHole.get(r.hole_key) ?? []), r]);
    return scrambleTally([...byHole.entries()].map(([k, throws]) => {
      const r = throws[0];
      const layout = d.rounds.get(r.round_id)?.layout_id;
      return { throws, strokes: d.strokes.get(k) ?? null, par: layout ? d.pars.get(`${layout}:${r.hole_number}`) ?? null : null };
    }));
  };

  const s = summarizeThrows(d.rows);
  if (!s.holesTracked) {
    return (
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-semibold"><Crosshair className="h-4 w-4 text-primary" /> Shot stats</h3>
        <p className="mt-1 text-sm text-muted-foreground">Tap Record throw on the scorecard during your next round — your driving, approach and putting numbers build up here.</p>
      </Card>
    );
  }
  const scr = scrambleOf(d.rows);
  const tiles: { group: string; label: string; value: string; detail: string }[] = [
    { group: "Driving", label: "Tee to C1", value: pct(s.tee.c1, s.teeShots), detail: `${s.tee.c1} / ${s.teeShots}` },
    { group: "Driving", label: "Tee to C2", value: pct(s.tee.c2, s.teeShots), detail: `${s.tee.c2} / ${s.teeShots}` },
    { group: "Driving", label: "Parked", value: pct(s.tee.parked, s.teeShots), detail: `${s.tee.parked} / ${s.teeShots}` },
    { group: "Driving", label: "Fairway", value: pct(s.tee.fairway, s.teeShots), detail: `${s.tee.fairway} / ${s.teeShots}` },
    { group: "Approach", label: "Upshot to C1", value: pct(s.approachInC1, s.approaches), detail: `${s.approachInC1} / ${s.approaches}` },
    { group: "Recovery", label: "Scramble", value: pct(scr.saves, scr.chances), detail: `${scr.saves} / ${scr.chances} saved par` },
    { group: "Putting", label: "C1 putting", value: pct(s.putts.c1.made, s.putts.c1.att), detail: `${s.putts.c1.made} / ${s.putts.c1.att}` },
    { group: "Putting", label: "C2 putting", value: pct(s.putts.c2.made, s.putts.c2.att), detail: `${s.putts.c2.made} / ${s.putts.c2.att}` },
    { group: "Putting", label: "Tap-ins", value: pct(s.putts.tapin.made, s.putts.tapin.att), detail: `${s.putts.tapin.made} / ${s.putts.tapin.att}` },
    { group: "Penalties", label: "OB off the tee", value: pct(s.tee.ob, s.teeShots), detail: `${s.obThrows} OB throws total` },
  ];

  // Split rows into groups.
  let groups: { key: string; label: string; rows: Row[] }[] = [];
  if (split !== "all") {
    const m = new Map<string, { label: string; rows: Row[] }>();
    for (const r of d.rows) {
      const rd = d.rounds.get(r.round_id);
      let key: string | null = null; let label = "";
      if (split === "course") { key = rd?.course_id ?? null; label = rd?.course ?? ""; }
      else if (split === "hole") {
        const c = courseFilter ?? courses[0]?.[0];
        if (rd?.course_id !== c) continue;
        key = String(r.hole_number); label = `Hole ${r.hole_number}`;
      } else { key = r.disc_id; label = r.disc_id ? d.discs.get(r.disc_id) ?? "Disc" : ""; }
      if (!key) continue;
      const g = m.get(key) ?? { label, rows: [] };
      g.rows.push(r); m.set(key, g);
    }
    groups = [...m.entries()].map(([key, g]) => ({ key, ...g }));
    groups.sort((a, b) => split === "hole" ? Number(a.key) - Number(b.key) : b.rows.length - a.rows.length);
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Crosshair className="h-4 w-4 text-primary" /> Shot stats</h3>
        <span className="text-sm text-muted-foreground">{s.holesTracked} holes tracked</span>
      </div>
      {s.holesTracked < 18 ? <p className="mt-1 text-sm text-muted-foreground">Early numbers — they settle as you track more holes.</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Break down by">
          {([["all", "All"], ["course", "By course"], ["hole", "By hole"], ["disc", "By disc"]] as [Split, string][]).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={split === k} onClick={() => setSplit(k)}
              className={"min-h-9 shrink-0 rounded-full border px-3 text-sm font-medium " +
                (split === k ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>{l}</button>
          ))}
        </div>
        {split === "hole" && courses.length ? (
          <select aria-label="Course" className="min-h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={courseFilter ?? courses[0][0]} onChange={(e) => setCourseFilter(e.target.value)}>
            {courses.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        ) : null}
      </div>

      {split === "all" ? (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border border-border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t.group}</p>
              <p className="text-sm font-medium">{t.label}</p>
              <p className="font-display text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-sm text-muted-foreground tabular-nums">{t.detail}</p>
            </div>
          ))}
        </div>
      ) : groups.length ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1.5 pr-2 font-medium">{split === "course" ? "Course" : split === "hole" ? "Hole" : "Disc"}</th>
                <th className="py-1.5 pr-2 font-medium">Holes</th>
                <th className="py-1.5 pr-2 font-medium">Tee to C1</th>
                <th className="py-1.5 pr-2 font-medium">Fairway</th>
                <th className="py-1.5 pr-2 font-medium">{split === "disc" ? "Upshot to C1" : "C1 putting"}</th>
                <th className="py-1.5 font-medium">{split === "disc" ? "OB throws" : "Scramble"}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const gs = summarizeThrows(g.rows);
                const gscr = scrambleOf(g.rows);
                return (
                  <tr key={g.key} className="border-t border-border tabular-nums">
                    <td className="max-w-[200px] truncate py-1.5 pr-2 font-medium">{g.label}</td>
                    <td className="py-1.5 pr-2">{gs.holesTracked}</td>
                    <td className="py-1.5 pr-2">{pct(gs.tee.c1, gs.teeShots)} <span className="text-muted-foreground">({gs.tee.c1}/{gs.teeShots})</span></td>
                    <td className="py-1.5 pr-2">{pct(gs.tee.fairway, gs.teeShots)}</td>
                    <td className="py-1.5 pr-2">{split === "disc"
                      ? <>{pct(gs.approachInC1, gs.approaches)} <span className="text-muted-foreground">({gs.approachInC1}/{gs.approaches})</span></>
                      : <>{pct(gs.putts.c1.made, gs.putts.c1.att)} <span className="text-muted-foreground">({gs.putts.c1.made}/{gs.putts.c1.att})</span></>}</td>
                    <td className="py-1.5">{split === "disc" ? gs.obThrows : `${pct(gscr.saves, gscr.chances)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          {split === "disc" ? "Pick a disc under More in Record throw and your numbers for each disc show up here." : "Nothing to break down yet — track a few more holes."}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">Scramble: holes where a throw ended in the rough, OB or a hazard and you still made par or better.</p>
    </Card>
  );
}
