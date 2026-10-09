import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Gauge,
  Plus,
  ShieldCheck,
  Star,
  Tag,
  Target,
  Trash2,
  Trophy,
} from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { TrendingDiscsCard } from "@/components/discs/trending-discs-card";
import { DiscPicker } from "@/components/discs/disc-picker";
import { BagFlightChart } from "@/components/discs/bag-flight-chart";
import { LevelBenchmarkPanel } from "@/components/bag/level-benchmark-panel";
import { BagErrorState, BagSkeleton } from "@/components/bag/bag-states";
import { ThrowingProfilePanel } from "@/components/bag/throwing-profile-panel";
import { ThrowingProfileSurvey } from "@/components/bag/throwing-profile-survey";
import { FlightPathMap } from "@/components/discs/flight-path-map";
import { SHOT_SHAPES, throwingProfileQueryOptions } from "@/lib/throwing-profile";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { playerQueryOptions } from "@/lib/entities/players";
import { bagDiscRowsQueryOptions, isActiveBagDisc } from "@/lib/entities/bag";
import {
  CATEGORY_LABEL,
  DISC_CATEGORIES,
  STABILITY_LABEL,
  fetchMoldsByIds,
  fetchPlastics,
  flightLine,
  netStability,
  plasticLine,
  specLine,
  type DiscCategoryKey,
  type MoldRow,
  type PlasticRow,
} from "@/lib/disc-catalog";

const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/me/bag")({
  component: BagPage,
  head: () => ({
    meta: [
      { title: "My Bag · Disc collection & flight coverage · DG Dashboard" },
      {
        name: "description",
        content:
          "Build your bag from every PDGA-approved disc, see flight numbers and official specs, and find the gaps in your shot coverage.",
      },
      {
        property: "og:title",
        content: "My Bag · Disc collection & flight coverage · DG Dashboard",
      },
      {
        property: "og:description",
        content:
          "Search 2,700+ molds, track plastic and weight, and map your bag's flight coverage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type UserDisc = {
  id: string;
  user_id: string;
  mold_id: string;
  plastic_id: string | null;
  plastic_name: string | null;
  weight_g: number | null;
  color: string;
  nickname: string | null;
  purpose: string | null;
  distance_ft: number | null;
  condition: "new" | "beat_in" | "worn" | "retired";
  retired_at: string | null;
  is_favorite: boolean;
  slot_order: number;
  throw_styles: string[] | null;
  shot_shapes: string[] | null;
};

const CONDITIONS: UserDisc["condition"][] = ["new", "beat_in", "worn", "retired"];
const CONDITION_LABEL: Record<UserDisc["condition"], string> = {
  new: "New",
  beat_in: "Beat in",
  worn: "Worn",
  retired: "Retired",
};

const SPEED_BANDS = [
  { key: "putt", label: "Putt & approach", min: 1, max: 4 },
  { key: "mid", label: "Midrange", min: 4.5, max: 6 },
  { key: "fairway", label: "Fairway", min: 6.5, max: 9 },
  { key: "distance", label: "Distance", min: 9.5, max: 15 },
];

function BagPage() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const profileQ = useQuery(playerQueryOptions(user?.id));
  const bagQ = useQuery(bagDiscRowsQueryOptions(user?.id));
  const throwProfileQ = useQuery(throwingProfileQueryOptions(user?.id));
  const [extraMolds, setExtraMolds] = useState<Map<string, MoldRow>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [showSurvey, setShowSurvey] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  const discs = useMemo(() => (bagQ.data ?? []) as UserDisc[], [bagQ.data]);
  const moldIds = useMemo(() => [...new Set(discs.map((d) => d.mold_id))].sort(), [discs]);
  const moldsQ = useQuery({
    queryKey: ["bag-molds", moldIds] as const,
    queryFn: () => fetchMoldsByIds(moldIds),
    enabled: moldIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const molds = useMemo(() => {
    const map = new Map<string, MoldRow>();
    for (const m of moldsQ.data ?? []) map.set(m.id, m);
    for (const [id, m] of extraMolds) map.set(id, m);
    return map;
  }, [moldsQ.data, extraMolds]);

  const loading = bagQ.isPending && !!user?.id;
  const failed = bagQ.isError;

  const setDiscs = useCallback(
    (update: (list: UserDisc[]) => UserDisc[]) => {
      if (!user?.id) return;
      queryClient.setQueryData(
        bagDiscRowsQueryOptions(user.id).queryKey,
        (prev: UserDisc[] | undefined) => update((prev ?? []) as UserDisc[]),
      );
    },
    [queryClient, user?.id],
  );

  const active = useMemo(() => discs.filter((d) => isActiveBagDisc(d)), [discs]);
  const retired = useMemo(() => discs.filter((d) => !isActiveBagDisc(d)), [discs]);
  const visible = showRetired ? discs : active;

  const analysis = useMemo(() => {
    const byCat = new Map<DiscCategoryKey, number>();
    for (const c of DISC_CATEGORIES) byCat.set(c, 0);
    const bands = new Map(SPEED_BANDS.map((b) => [b.key, 0]));
    let understable = 0;
    let neutral = 0;
    let overstable = 0;
    let speedSum = 0;
    let speedCount = 0;
    let missingFlight = 0;
    const brands = new Set<string>();
    const plastics = new Set<string>();
    const weights: number[] = [];

    for (const d of active) {
      const m = molds.get(d.mold_id);
      if (!m) continue;
      byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1);
      brands.add(m.brand);
      if (d.plastic_name) plastics.add(`${m.brand} ${d.plastic_name}`);
      if (d.weight_g) weights.push(d.weight_g);
      if (m.speed !== null) {
        speedSum += Number(m.speed);
        speedCount += 1;
        const band = SPEED_BANDS.find((b) => Number(m.speed) >= b.min && Number(m.speed) <= b.max);
        if (band) bands.set(band.key, (bands.get(band.key) ?? 0) + 1);
      }
      const net = netStability(m);
      if (net === null) {
        missingFlight += 1;
      } else if (net <= -0.5) understable += 1;
      else if (net < 2) neutral += 1;
      else overstable += 1;
    }

    const gaps: string[] = [];
    for (const b of SPEED_BANDS) {
      if ((bands.get(b.key) ?? 0) === 0)
        gaps.push(`No ${b.label.toLowerCase()} disc in the bag yet.`);
    }
    if ((byCat.get("putter") ?? 0) < 2)
      gaps.push("Carry a second putter so your putting feel stays identical.");
    if (!understable) gaps.push("Nothing understable — turnovers and rollers are off the table.");
    if (!overstable) gaps.push("Nothing overstable — headwind and forced flex shots will hurt.");
    if (!neutral && active.length)
      gaps.push("No neutral disc — you have no true straight line to fall back on.");
    if (missingFlight)
      gaps.push(
        `${missingFlight} disc${missingFlight === 1 ? "" : "s"} have no published flight numbers, so they sit outside the flight map.`,
      );
    if (active.length > 22)
      gaps.push("Over 22 discs in play — trim to your trusted shots before a tournament round.");

    const avgSpeed = speedCount ? Math.round((speedSum / speedCount) * 10) / 10 : null;
    const weightRange = weights.length
      ? `${Math.min(...weights)}–${Math.max(...weights)} g`
      : "Not recorded";

    return {
      byCat,
      bands,
      gaps,
      brands: brands.size,
      plastics: plastics.size,
      understable,
      neutral,
      overstable,
      avgSpeed,
      weightRange,
    };
  }, [active, molds]);

  /** Bag shape the throwing-profile advice reads. */
  const bagSummary = useMemo(() => {
    const speeds = active
      .map((d) => molds.get(d.mold_id)?.speed)
      .filter((s): s is number => s !== null && s !== undefined)
      .map(Number);
    return {
      count: active.length,
      bands: {
        putt: analysis.bands.get("putt") ?? 0,
        mid: analysis.bands.get("mid") ?? 0,
        fairway: analysis.bands.get("fairway") ?? 0,
        distance: analysis.bands.get("distance") ?? 0,
      },
      understable: analysis.understable,
      neutral: analysis.neutral,
      overstable: analysis.overstable,
      maxSpeed: speeds.length ? Math.max(...speeds) : null,
    };
  }, [active, molds, analysis]);

  const chartDiscs = useMemo(
    () =>
      active
        .map((d) => {
          const mold = molds.get(d.mold_id);
          return mold ? { id: d.id, label: d.nickname || mold.name, color: d.color, mold } : null;
        })
        .filter((v): v is { id: string; label: string; color: string; mold: MoldRow } =>
          Boolean(v),
        ),
    [active, molds],
  );

  async function addDisc(payload: {
    mold: MoldRow;
    plastic_name: string | null;
    weight_g: number | null;
    color: string;
    nickname: string | null;
    purpose: string | null;
    distance_ft: number | null;
  }) {
    if (!user) return;
    const { mold, ...rest } = payload;
    const { data, error } = await sb
      .from("user_discs")
      .insert({ user_id: user.id, mold_id: mold.id, slot_order: discs.length, ...rest })
      .select("*")
      .single();
    if (error) return toast.error(error.message);
    setDiscs((list) => [...list, data as UserDisc]);
    setExtraMolds((m: Map<string, MoldRow>) => new Map(m).set(mold.id, mold));
    toast.success(`${mold.name} is in the bag.`);
    setShowAdd(false);
  }

  async function patch(disc: UserDisc, changes: Partial<UserDisc>) {
    const { error } = await sb.from("user_discs").update(changes).eq("id", disc.id);
    if (error) return toast.error(error.message);
    setDiscs((list) => list.map((d) => (d.id === disc.id ? { ...d, ...changes } : d)));
  }

  async function removeDisc(disc: UserDisc) {
    const mold = molds.get(disc.mold_id);
    if (!confirm(`Remove ${mold?.name ?? "this disc"} from your bag?`)) return;
    const { error } = await sb.from("user_discs").delete().eq("id", disc.id);
    if (error) return toast.error(error.message);
    setDiscs((list) => list.filter((d) => d.id !== disc.id));
    toast.success("Removed from your bag.");
  }

  return (
    <PageShell section="profile">
      <PageHeader
        eyebrow="Me"
        title="My bag"
        description={`${active.length} discs in the bag across ${analysis.brands} brand${analysis.brands === 1 ? "" : "s"}. Every mold is pulled from the PDGA approved list with real flight numbers and specs.`}
        primaryAction={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add disc
          </Button>
        }
        secondaryAction={
          <Button variant="outline" onClick={() => setShowSurvey(true)}>
            <Gauge className="mr-1 h-4 w-4" />
            {throwProfileQ.data ? "Throwing profile" : "Build throwing profile"}
          </Button>
        }
      />

      <Dialog open={showSurvey} onOpenChange={setShowSurvey}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your throwing profile</DialogTitle>
          </DialogHeader>
          {user?.id ? (
            <ThrowingProfileSurvey
              userId={user.id}
              profile={throwProfileQ.data ?? null}
              onDone={() => setShowSurvey(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a disc to your bag</DialogTitle>
          </DialogHeader>
          <AddDiscFlow onSubmit={addDisc} />
        </DialogContent>
      </Dialog>

      {!loading && !failed && active.length ? (
        <section className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Discs carried
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{active.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Average speed
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">
              {analysis.avgSpeed ?? "—"}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Stability spread
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {analysis.understable} US · {analysis.neutral} neutral · {analysis.overstable} OS
            </div>
          </div>
          <div
            className={`rounded-xl border p-3 ${analysis.gaps.length ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5"}`}
          >
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Coverage gaps
            </div>
            <div className="mt-0.5 text-sm font-semibold">
              {analysis.gaps.length
                ? `${analysis.gaps.length} to fill — see Bag coverage below`
                : "Tournament ready"}
            </div>
          </div>
        </section>
      ) : null}

      <Tabs defaultValue="bag" className="mt-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="bag">In the bag</TabsTrigger>
          <TabsTrigger value="profile">Throwing profile</TabsTrigger>
          <TabsTrigger value="flight">Flight map</TabsTrigger>
          <TabsTrigger value="library">Disc library</TabsTrigger>
          <TabsTrigger value="level">At your level</TabsTrigger>
          <TabsTrigger value="market">What's selling</TabsTrigger>
        </TabsList>

        <TabsContent value="bag" className="space-y-5 pt-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4" /> Bag coverage
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SPEED_BANDS.map((b) => {
                const n = analysis.bands.get(b.key) ?? 0;
                return (
                  <div
                    key={b.key}
                    className={`rounded-md border p-2 text-center ${n === 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border"}`}
                  >
                    <div className="text-xs text-muted-foreground">{b.label}</div>
                    <div className="text-lg font-bold">{n}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
              {DISC_CATEGORIES.map((c) => (
                <div key={c} className="rounded-md border border-border p-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{CATEGORY_LABEL[c]}</div>
                  <div className="text-base font-semibold">{analysis.byCat.get(c) ?? 0}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                {
                  label: "Stability spread",
                  value: `${analysis.understable} US · ${analysis.neutral} neutral · ${analysis.overstable} OS`,
                },
                { label: "Average speed", value: analysis.avgSpeed ?? "—" },
                { label: "Weight range", value: analysis.weightRange },
                {
                  label: "Brands · plastics",
                  value: `${analysis.brands} · ${analysis.plastics}`,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-md border border-border p-2">
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                  <div className="text-sm font-semibold">{s.value}</div>
                </div>
              ))}
            </div>

            {analysis.gaps.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {analysis.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-emerald-500">
                Every speed range and both stability ends are covered — this bag is tournament
                ready.
              </p>
            )}
          </section>

          {retired.length ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showRetired}
                onChange={(e) => setShowRetired(e.target.checked)}
              />
              Show {retired.length} retired disc{retired.length === 1 ? "" : "s"}
            </label>
          ) : null}

          {loading ? (
            <BagSkeleton />
          ) : failed ? (
            <BagErrorState onRetry={() => void bagQ.refetch()} retrying={bagQ.isFetching} />
          ) : !visible.length ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Your bag is empty. Add your first disc to unlock the Bag Builder trophy.
              </p>
              <Button className="mt-3" size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="mr-1 h-4 w-4" /> Add your first disc
              </Button>
            </div>
          ) : (
            DISC_CATEGORIES.map((cat) => {
              const list = visible.filter((d) => molds.get(d.mold_id)?.category === cat);
              if (!list.length) return null;
              return (
                <section key={cat}>
                  <h2 className="mb-2 text-sm font-semibold">{CATEGORY_LABEL[cat]}</h2>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((d) => (
                      <DiscCard
                        key={d.id}
                        disc={d}
                        mold={molds.get(d.mold_id) ?? null}
                        onPatch={patch}
                        onRemove={removeDisc}
                      />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="profile" className="pt-4">
          {user?.id ? (
            <ThrowingProfilePanel
              profile={throwProfileQ.data ?? null}
              bag={bagSummary}
              onEdit={() => setShowSurvey(true)}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="flight" className="space-y-4 pt-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Target className="h-4 w-4" /> Flight lines at your power
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Every disc thrown at your own arm speed, on the release shape you pick.
              {throwProfileQ.data
                ? ""
                : " Take the throwing profile survey and these lines switch from a moderate-power estimate to yours."}
            </p>
            <FlightPathMap discs={chartDiscs} profile={throwProfileQ.data ?? null} />
            {throwProfileQ.data ? null : (
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => setShowSurvey(true)}
              >
                Take the survey
              </Button>
            )}
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-1 text-sm font-semibold">Coverage map</div>
            <p className="mb-3 text-xs text-muted-foreground">
              Each dot is a disc by speed and stability. Empty space is a shot you can't currently
              throw.
            </p>
            <BagFlightChart discs={chartDiscs} />
          </section>
        </TabsContent>

        <TabsContent value="library" className="pt-4">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-1 text-sm font-semibold">Disc library</h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Every PDGA-approved mold with official weight, diameter and rim specs, plus published
              flight numbers where the manufacturer lists them.
            </p>
            <DiscPicker />
          </section>
        </TabsContent>

        <TabsContent value="level" className="pt-4">
          <LevelBenchmarkPanel pdgaRating={profileQ.data?.pdga_rating ?? null} />
        </TabsContent>

        <TabsContent value="market" className="space-y-4 pt-4">
          <TrendingDiscsCard />
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Sell or trade from your bag</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Any disc in your bag can go straight to the marketplace with its mold, plastic, weight
              and colour already filled in.
            </p>
            {active.length ? (
              <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {active.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ background: d.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {molds.get(d.mold_id)?.name ?? d.nickname ?? "Disc"}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/marketplace" search={{ view: "sell", disc: d.id }}>
                        List it
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Add discs to your bag and they'll be listable from here.
              </p>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function DiscCard({
  disc,
  mold,
  onPatch,
  onRemove,
}: {
  disc: UserDisc;
  mold: MoldRow | null;
  onPatch: (d: UserDisc, changes: Partial<UserDisc>) => void;
  onRemove: (d: UserDisc) => void;
}) {
  const flight = mold ? flightLine(mold) : null;
  const specs = mold ? specLine(mold) : "";
  return (
    <article className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-black/30 shadow-inner"
          style={{ background: disc.color }}
        >
          <span className="text-[10px] font-bold text-white/90 drop-shadow">
            {flight ? flight.replace(/ /g, "") : mold?.name.slice(0, 4)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold">{mold?.name ?? "Unknown mold"}</span>
            {mold?.pdga_approved ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {mold?.brand}
            {disc.plastic_name ? ` · ${disc.plastic_name}` : ""}
            {disc.weight_g ? ` · ${disc.weight_g}g` : ""}
            {disc.distance_ft ? ` · ${disc.distance_ft} ft` : ""}
          </div>
          {disc.nickname ? (
            <div className="text-xs italic text-muted-foreground">"{disc.nickname}"</div>
          ) : null}
          {disc.purpose ? (
            <div className="text-xs text-muted-foreground">{disc.purpose}</div>
          ) : null}
          {specs ? <div className="text-[11px] text-muted-foreground">{specs}</div> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {mold?.stability ? (
              <Badge variant="outline" className="text-[10px]">
                {STABILITY_LABEL[mold.stability] ?? mold.stability}
              </Badge>
            ) : null}
            <select
              value={disc.condition}
              onChange={(e) =>
                onPatch(disc, { condition: e.target.value as UserDisc["condition"] })
              }
              className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px]"
              aria-label="Disc condition"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={() => onPatch(disc, { is_favorite: !disc.is_favorite })}
            className="text-muted-foreground hover:text-amber-400"
            aria-label={disc.is_favorite ? "Remove from favorites" : "Mark as a favorite"}
            title={disc.is_favorite ? "Remove from favorites" : "Mark as a favorite"}
          >
            <Star
              className={`h-4 w-4 ${disc.is_favorite ? "fill-amber-400 text-amber-400" : ""}`}
            />
          </button>
          <button
            onClick={() => onRemove(disc)}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Remove this disc from your bag"
            title="Remove from bag"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 border-t border-border pt-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          How you throw it
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {SHOT_SHAPES.slice(0, 8).map((shape) => {
            const list = disc.shot_shapes ?? [];
            const on = list.includes(shape.key);
            return (
              <button
                key={shape.key}
                type="button"
                title={shape.hint}
                onClick={() =>
                  onPatch(disc, {
                    shot_shapes: on ? list.filter((s) => s !== shape.key) : [...list, shape.key],
                  })
                }
                className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                  on
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {shape.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-end">
          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
            <Link to="/marketplace" search={{ view: "sell", disc: disc.id }}>
              <Tag className="mr-1 h-3.5 w-3.5" /> Sell or trade
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function AddDiscFlow({
  onSubmit,
}: {
  onSubmit: (payload: {
    mold: MoldRow;
    plastic_name: string | null;
    weight_g: number | null;
    color: string;
    nickname: string | null;
    purpose: string | null;
    distance_ft: number | null;
  }) => void;
}) {
  const [mold, setMold] = useState<MoldRow | null>(null);
  const [plastic, setPlastic] = useState("");
  const [weight, setWeight] = useState("175");
  const [color, setColor] = useState("#e11d48");
  const [nickname, setNickname] = useState("");
  const [purpose, setPurpose] = useState("");
  const [distance, setDistance] = useState("");
  const [plastics, setPlastics] = useState<PlasticRow[]>([]);

  useEffect(() => {
    if (!mold) return;
    let cancelled = false;
    fetchPlastics(mold.manufacturer_id)
      .then((rows) => !cancelled && setPlastics(rows))
      .catch(() => !cancelled && setPlastics([]));
    return () => {
      cancelled = true;
    };
  }, [mold]);

  if (!mold) return <DiscPicker onSelect={setMold} compact />;

  const flight = flightLine(mold);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          mold,
          plastic_name: plastic.trim() || null,
          weight_g: weight ? Number(weight) : null,
          color,
          nickname: nickname.trim() || null,
          purpose: purpose.trim() || null,
          distance_ft: distance ? Number(distance) : null,
        });
      }}
    >
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMold(null)}
          aria-label="Pick a different mold"
          title="Pick a different mold"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {mold.image_url ? (
          <img
            src={mold.image_url}
            alt={`${mold.brand} ${mold.name}`}
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : null}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {mold.brand} {mold.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {flight ? `${flight} · ` : ""}
            {CATEGORY_LABEL[mold.category]}
            {specLine(mold) ? ` · ${specLine(mold)}` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="plastic">Plastic</Label>
          {plastics.length ? (
            <select
              id="plastic"
              value={plastics.some((p) => p.name === plastic) ? plastic : "__other"}
              onChange={(e) => setPlastic(e.target.value === "__other" ? "" : e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="__other">Other / not listed</option>
              {plastics.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                  {plasticLine(p) ? ` — ${plasticLine(p)}` : ""}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="plastic"
              value={plastic}
              onChange={(e) => setPlastic(e.target.value)}
              placeholder="e.g. Star, ESP"
            />
          )}
          {plastics.length && !plastics.some((p) => p.name === plastic) ? (
            <Input
              value={plastic}
              onChange={(e) => setPlastic(e.target.value)}
              placeholder="Type the plastic name"
            />
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="weight">Weight (g)</Label>
          <Input
            id="weight"
            type="number"
            min={120}
            max={200}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="color">Disc color</Label>
          <Input id="color" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="distance">Your typical distance (ft)</Label>
          <Input
            id="distance"
            type="number"
            min={20}
            max={800}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="nickname">Nickname</Label>
          <Input
            id="nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. Big Bertha"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="purpose">What you throw it for</Label>
          <Input
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g. Headwind hyzer"
          />
        </div>
      </div>
      <Button type="submit" className="w-full">
        Add to bag
      </Button>
    </form>
  );
}
