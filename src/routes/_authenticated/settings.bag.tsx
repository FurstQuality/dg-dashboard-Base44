import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Backpack, CheckCircle2, Gauge, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/current-user";
import { bagDiscRowsQueryOptions, isActiveBagDisc } from "@/lib/entities/bag";
import { fetchMoldsByIds, netStability, type MoldRow } from "@/lib/disc-catalog";
import {
  profileCompleteness,
  throwingProfileQueryOptions,
  type ThrowingProfile,
} from "@/lib/throwing-profile";
import { ThrowingProfilePanel } from "@/components/bag/throwing-profile-panel";
import { ThrowingProfileSurvey } from "@/components/bag/throwing-profile-survey";
import { BagErrorState, BagSkeleton } from "@/components/bag/bag-states";

export const Route = createFileRoute("/_authenticated/settings/bag")({
  component: BagSettingsPage,
  head: () => ({
    meta: [
      { title: "Throw profile & bag · Settings · DG Dashboard" },
      {
        name: "description",
        content:
          "Finish your throwing profile — power, measured numbers, shot shapes, disc preferences — and check your bag's coverage from one settings page.",
      },
      { property: "og:title", content: "Throw profile & bag · Settings · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Complete your throwing profile and build out your bag so every recommendation runs at your power.",
      },
    ],
  }),
});

const SPEED_BANDS = [
  { key: "putt" as const, label: "Putt & approach", min: 1, max: 4 },
  { key: "mid" as const, label: "Midrange", min: 4.5, max: 6 },
  { key: "fairway" as const, label: "Fairway", min: 6.5, max: 9 },
  { key: "distance" as const, label: "Distance", min: 9.5, max: 15 },
];

function BagSettingsPage() {
  const { user } = useSession();
  const profileQ = useQuery(throwingProfileQueryOptions(user?.id));
  const bagQ = useQuery(bagDiscRowsQueryOptions(user?.id));
  const [editing, setEditing] = useState(false);

  const profile = (profileQ.data ?? null) as ThrowingProfile | null;
  const discs = useMemo(() => (bagQ.data ?? []) as any[], [bagQ.data]);
  const active = useMemo(() => discs.filter((d) => isActiveBagDisc(d)), [discs]);
  const moldIds = useMemo(
    () => [...new Set(active.map((d) => d.mold_id as string))].sort(),
    [active],
  );
  const moldsQ = useQuery({
    queryKey: ["settings-bag-molds", moldIds] as const,
    queryFn: () => fetchMoldsByIds(moldIds),
    enabled: moldIds.length > 0,
    staleTime: 10 * 60_000,
  });

  const bagSummary = useMemo(() => {
    const molds = new Map<string, MoldRow>();
    for (const m of moldsQ.data ?? []) molds.set(m.id, m);
    const bands = { putt: 0, mid: 0, fairway: 0, distance: 0 };
    let understable = 0;
    let neutral = 0;
    let overstable = 0;
    let maxSpeed: number | null = null;
    for (const d of active) {
      const m = molds.get(d.mold_id as string);
      if (!m) continue;
      if (m.speed !== null && m.speed !== undefined) {
        const speed = Number(m.speed);
        maxSpeed = maxSpeed === null ? speed : Math.max(maxSpeed, speed);
        const band = SPEED_BANDS.find((b) => speed >= b.min && speed <= b.max);
        if (band) bands[band.key] += 1;
      }
      const net = netStability(m);
      if (net === null) continue;
      if (net <= -0.5) understable += 1;
      else if (net < 2) neutral += 1;
      else overstable += 1;
    }
    return { count: active.length, bands, understable, neutral, overstable, maxSpeed };
  }, [active, moldsQ.data]);

  const completeness = profileCompleteness(profile);
  const loading = (profileQ.isPending || bagQ.isPending) && !!user?.id;

  if (!user?.id) {
    return (
      <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Sign in to build your throwing profile and bag.
      </p>
    );
  }
  if (loading) return <BagSkeleton />;
  if (profileQ.isError || bagQ.isError) {
    return (
      <BagErrorState
        onRetry={() => {
          void profileQ.refetch();
          void bagQ.refetch();
        }}
      />
    );
  }

  const showSurvey = editing || !profile || completeness.pct < 100;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Gauge className="h-4 w-4" /> Throwing profile
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {completeness.pct === 100
                ? "Your profile is complete — every flight map, bag finding, and practice suggestion runs at your numbers."
                : "Fill in the rest so flight maps, bag findings, and practice suggestions match how you actually throw."}
            </p>
          </div>
          <Badge variant={completeness.pct === 100 ? "default" : "outline"} className="shrink-0">
            {completeness.pct === 100 ? (
              <>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
              </>
            ) : (
              `${completeness.pct}% complete`
            )}
          </Badge>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(completeness.pct, 2)}%` }}
          />
        </div>

        {completeness.missing.length ? (
          <div className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Still to answer
            </div>
            <ul className="mt-1 grid gap-1 text-sm sm:grid-cols-2">
              {completeness.missing.map((m) => (
                <li key={m} className="text-muted-foreground">
                  · {m}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {showSurvey ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <ThrowingProfileSurvey
            userId={user.id}
            profile={profile}
            onDone={() => setEditing(false)}
          />
        </section>
      ) : null}

      {profile ? (
        <ThrowingProfilePanel
          profile={profile}
          bag={bagSummary}
          onEdit={() => setEditing((v) => !v)}
        />
      ) : null}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Backpack className="h-4 w-4" /> Your bag
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {bagSummary.count
                ? `${bagSummary.count} disc${bagSummary.count === 1 ? "" : "s"} in play. Add plastic, weight, and the shots you throw with each one.`
                : "Nothing in the bag yet. Add your discs so coverage and recommendations mean something."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/me/bag">
                <Plus className="mr-1 h-4 w-4" /> Add discs
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/me/bag">
                Open bag builder <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {SPEED_BANDS.map((b) => (
            <div key={b.key} className="rounded-lg border border-border p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {b.label}
              </div>
              <div className="mt-0.5 text-sm font-semibold">
                {bagSummary.bands[b.key]
                  ? `${bagSummary.bands[b.key]} disc${bagSummary.bands[b.key] === 1 ? "" : "s"}`
                  : "None yet"}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Understable
            </div>
            <div className="mt-0.5 text-sm font-semibold">{bagSummary.understable}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Neutral</div>
            <div className="mt-0.5 text-sm font-semibold">{bagSummary.neutral}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Overstable
            </div>
            <div className="mt-0.5 text-sm font-semibold">{bagSummary.overstable}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
