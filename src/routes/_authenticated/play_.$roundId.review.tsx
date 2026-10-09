import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Crosshair, Flag, Footprints, Play } from "lucide-react";
import { mToFt, mToMi, type TrackPoint } from "@/lib/round-walk";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { formatToPar, relativeToPar, RATING_LABEL } from "@/lib/score-display";
import { summarizeThrows, type ThrowRow } from "@/lib/throw-stats";

export const Route = createFileRoute("/_authenticated/play_/$roundId/review")({
  component: RoundReview,
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This round" />,
  head: () => ({
    meta: [
      { title: "Round review · DG Dashboard" },
      { name: "description", content: "Your finished round hole by hole: score, rating and shot stats." },
      { property: "og:title", content: "Round review · DG Dashboard" },
      { property: "og:description", content: "Hole-by-hole review of a finished disc golf round." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type HoleRow = { number: number; par: number | null; distance_ft: number | null };

async function loadReview(roundId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const { data: round, error } = await supabase
    .from("rounds")
    .select("id, course_id, layout_id, status, started_at, ended_at")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw new Error("We couldn't load this round.");
  if (!round) return null;
  const [{ data: course }, { data: holes }, { data: players }, { data: scores }, { data: ratings }] =
    await Promise.all([
      supabase.from("courses").select("name").eq("id", round.course_id).maybeSingle(),
      supabase.from("holes").select("number, par, distance_ft").eq("layout_id", round.layout_id).order("number"),
      supabase.from("round_players").select("id, user_id").eq("round_id", roundId),
      supabase.from("round_scores").select("round_player_id, hole_number, strokes").eq("round_id", roundId),
      supabase.from("round_ratings").select("round_player_id, round_rating").eq("round_id", roundId),
    ]);
  const me = (players ?? []).find((p) => p.user_id === uid) ?? (players ?? [])[0];
  const myScores = (scores ?? []).filter((s) => s.round_player_id === me?.id);
  const { data: throws } = me
    ? await supabase
        .from("round_throws")
        .select("hole_number, throw_number, throw_type, distance_zone, lie_area, start_zone, made, holed_out")
        .eq("round_id", roundId)
        .eq("round_player_id", me.id)
    : { data: [] };
  const { data: track } = uid
    ? await supabase.from("round_tracks").select("points, distance_m, steps, calories, elevation_gain_m, elevation_loss_m").eq("round_id", roundId).eq("user_id", uid).maybeSingle()
    : { data: null };
  return {
    track,
    round,
    courseName: course?.name ?? "Course",
    holes: (holes ?? []) as HoleRow[],
    scores: myScores,
    rating: (ratings ?? []).find((r) => r.round_player_id === me?.id)?.round_rating ?? null,
    throws: (throws ?? []).map((t) => ({ ...(t as unknown as ThrowRow), hole_key: String(t.hole_number) })),
  };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function RoundReview() {
  const { roundId } = Route.useParams();
  const q = useQuery({ queryKey: ["round-review", roundId], queryFn: () => loadReview(roundId) });

  if (q.isLoading) {
    return (
      <PageShell>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageShell>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <PageShell>
        <PageHeader title="Round not found" description="This round may have been deleted, or it isn't shared with you." />
      </PageShell>
    );
  }

  const byHole = new Map(d.scores.map((s) => [s.hole_number, s.strokes as number | null]));
  const played = d.holes.filter((h) => byHole.get(h.number) != null);
  const total = played.reduce((a, h) => a + (byHole.get(h.number) ?? 0), 0);
  // Par only counts when every played hole has a known par — never guessed.
  const parKnown = played.length > 0 && played.every((h) => h.par != null);
  const parTotal = parKnown ? played.reduce((a, h) => a + (h.par ?? 0), 0) : null;
  const toPar = relativeToPar(played.length ? total : null, parTotal);

  const dist = { birdie: 0, par: 0, bogey: 0, double: 0 };
  for (const h of played) {
    const rel = relativeToPar(byHole.get(h.number), h.par);
    if (rel == null) continue;
    if (rel < 0) dist.birdie++;
    else if (rel === 0) dist.par++;
    else if (rel === 1) dist.bogey++;
    else dist.double++;
  }
  const s = summarizeThrows(d.throws);
  const inProgress = d.round.status === "in_progress";

  return (
    <PageShell section="play">
      <PageHeader
        title="Round review"
        description={`${d.courseName}${d.round.ended_at ? ` · ${new Date(d.round.ended_at).toLocaleDateString()}` : ""}`}
        primaryAction={
          <Button asChild>
            <Link to="/stats">
              <BarChart3 className="mr-1.5 h-4 w-4" /> Open Statboard
            </Link>
          </Button>
        }
        secondaryAction={
          inProgress ? (
            <Button asChild variant="outline">
              <Link to="/play/$roundId" params={{ roundId }}>
                <Play className="mr-1.5 h-4 w-4" /> Back to scorecard
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Score</div>
          <div className="mt-1 text-3xl font-semibold">{played.length ? formatToPar(toPar) : "—"}</div>
          <div className="text-sm text-muted-foreground">
            {played.length ? `${total} throws · ${parTotal != null ? `Par ${parTotal}` : "Par unknown"}` : "No scores yet"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">{RATING_LABEL.DGD}</div>
          <div className="mt-1 text-3xl font-semibold">{d.rating != null ? Math.round(d.rating) : "—"}</div>
          <div className="text-sm text-muted-foreground">
            {d.rating != null ? "Counts toward your DGD Rating" : "Casual round — no rating recorded"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Holes played</div>
          <div className="mt-1 text-3xl font-semibold">{played.length} / {d.holes.length}</div>
          <div className="text-sm text-muted-foreground">
            {dist.birdie} birdie{dist.birdie === 1 ? "" : "s"} or better · {dist.par} par{dist.par === 1 ? "" : "s"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Over par</div>
          <div className="mt-1 text-3xl font-semibold">{dist.bogey + dist.double}</div>
          <div className="text-sm text-muted-foreground">{dist.bogey} bogeys · {dist.double} double or worse</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Flag className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Hole by hole</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Hole</th>
                <th className="px-4 py-2 font-medium">Par</th>
                <th className="px-4 py-2 font-medium">Distance</th>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">To par</th>
              </tr>
            </thead>
            <tbody>
              {d.holes.map((h) => {
                const st = byHole.get(h.number);
                const rel = relativeToPar(st, h.par);
                return (
                  <tr key={h.number} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{h.number}</td>
                    <td className="px-4 py-2">{h.par ?? "—"}</td>
                    <td className="px-4 py-2">{h.distance_ft ? `${h.distance_ft} ft` : "—"}</td>
                    <td className="px-4 py-2">{st ?? "—"}</td>
                    <td
                      className={
                        "px-4 py-2 font-semibold " +
                        (rel == null ? "text-muted-foreground" : rel < 0 ? "text-success" : rel > 0 ? "text-destructive" : "")
                      }
                    >
                      {st == null ? "—" : formatToPar(rel)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {d.track ? <WalkCard track={d.track} /> : null}

      <Card className="p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Crosshair className="h-4 w-4 text-primary" /> Shot stats this round
        </h2>
        {s.holesTracked ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Tee to C1", pct(s.tee.c1, s.teeShots), `${s.tee.c1} / ${s.teeShots}`],
              ["Fairway", pct(s.tee.fairway, s.teeShots), `${s.tee.fairway} / ${s.teeShots}`],
              ["Upshot to C1", pct(s.approachInC1, s.approaches), `${s.approachInC1} / ${s.approaches}`],
              ["C1 putting", pct(s.putts.c1.made, s.putts.c1.att), `${s.putts.c1.made} / ${s.putts.c1.att}`],
              ["C2 putting", pct(s.putts.c2.made, s.putts.c2.att), `${s.putts.c2.made} / ${s.putts.c2.att}`],
              ["OB throws", String(s.obThrows), `on ${s.holesTracked} tracked holes`],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-xl font-semibold">{value}</div>
                <div className="text-sm text-muted-foreground">{detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            You didn't record throws this round. Tap Record throw on the scorecard next time to see your driving and putting here.
          </p>
        )}
      </Card>
    </PageShell>
  );
}

function WalkCard({ track }: { track: { points: unknown; distance_m: number; steps: number; calories: number; elevation_gain_m: number; elevation_loss_m: number } }) {
  const pts = (Array.isArray(track.points) ? track.points : []) as TrackPoint[];
  const W = 600, H = 260, pad = 12;
  let path = "";
  if (pts.length > 1) {
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    const spanX = Math.max((maxLng - minLng) * kx, 1e-6), spanY = Math.max(maxLat - minLat, 1e-6);
    const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    path = pts.map((p, i) => `${i ? "L" : "M"}${(pad + (p[1] - minLng) * kx * scale).toFixed(1)},${(H - pad - (p[0] - minLat) * scale).toFixed(1)}`).join(" ");
  }
  const tiles: [string, string][] = [
    ["Distance walked", `${mToMi(Number(track.distance_m)).toFixed(2)} mi`],
    ["Steps", `${track.steps.toLocaleString()} (estimate)`],
    ["Calories", `${track.calories} (estimate)`],
    ["Climbed / descended", `${Math.round(mToFt(Number(track.elevation_gain_m)))} ft / ${Math.round(mToFt(Number(track.elevation_loss_m)))} ft`],
  ];
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Footprints className="h-4 w-4 text-primary" /> Your walk</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([l, v]) => (
          <div key={l} className="rounded-lg border border-border p-3">
            <div className="text-sm text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      {path ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full rounded-lg border border-border bg-muted/30" role="img" aria-label="Path you walked this round">
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Not enough GPS points to draw your path yet.</p>
      )}
    </Card>
  );
}
