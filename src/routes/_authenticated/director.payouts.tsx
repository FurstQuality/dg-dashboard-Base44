import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Plus, Printer, X } from "lucide-react";
import { PageHeader, ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Segmented } from "@/components/event-setup/controls";
import {
  SYSTEM_MIN_PLAYER_PAYOUT_CENTS,
  DEFAULT_PAYOUT_CURVE,
  PAYOUT_CURVES,
  type PayoutCurve,
  computePayoutSchedule,
  requestedPlaces,
} from "@/lib/payout-engine";
import { money, REMAINDER_OPTIONS, remainderLabel, type RemainderDestination } from "@/lib/event-fees";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listCurveSets } from "@/lib/payouts.functions";
import { checkPayoutCompliance, PDGA_RULESET, PAYOUT_GUIDANCE_LABEL, type SanctionTier } from "@/lib/payout-compliance";

export const Route = createFileRoute("/_authenticated/director/payouts")({
  head: () => ({
    meta: [
      { title: "Payout calculator · DG Dashboard" },
      {
        name: "description",
        content:
          "Estimate payouts for any league night or tournament — singles, doubles or teams, with a minimum you choose (from $1) and cash-friendly rounding that never lowers what a player is owed.",
      },
      { property: "og:title", content: "Payout calculator — DG Dashboard" },
      {
        property: "og:description",
        content: "Payout table by place, per team and per player, for any field size.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutCalculatorPage,
});

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const num = (v: string, min = 0) => Math.max(min, Number(v) || 0);

function PayoutCalculatorPage() {
  const [poolMode, setPoolMode] = useState<"entry" | "pool">("entry");
  const [players, setPlayers] = useState(24);
  const [entryFee, setEntryFee] = useState(10);
  const [deductions, setDeductions] = useState<{ id: number; label: string; amount: number }[]>([
    { id: 1, label: "Ace fund", amount: 1 },
    { id: 2, label: "Greens fees", amount: 0 },
    { id: 3, label: "Club fees", amount: 1 },
    { id: 4, label: "CTP pot", amount: 0 },
  ]);
  const deductTotal = deductions.reduce((s, d) => s + d.amount, 0);
  const perPlayer = Math.max(0, entryFee - deductTotal);
  const updateDeduction = (id: number, patch: Partial<{ label: string; amount: number }>) =>
    setDeductions((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const [poolTotal, setPoolTotal] = useState(120);
  const [team, setTeam] = useState(1);
  const [depthMode, setDepthMode] = useState<"top_percent" | "top_count">("top_percent");
  const [depth, setDepth] = useState(40);
  const [minPlayer, setMinPlayer] = useState(5);
  const [rounding, setRounding] = useState(5);
  const [curveKey, setCurveKey] = useState<string>(DEFAULT_PAYOUT_CURVE);
  const [remainderDest, setRemainderDest] = useState<RemainderDestination>("first");
  const fetchSets = useServerFn(listCurveSets);
  const setsQ = useQuery({ queryKey: ["payout-curve-sets"], queryFn: () => fetchSets(), staleTime: 300_000 });
  const installed = (setsQ.data ?? []).filter((x) => x.status === "published").flatMap((set) =>
    set.curves.map((c) => ({ value: `set|${set.version}|${c.key}`, label: `${c.label} — ${set.label}`, b: c.b, version: set.version })),
  );
  const chosenSet = installed.find((c) => c.value === curveKey);
  const [sanctioned, setSanctioned] = useState(false);
  const [divMode, setDivMode] = useState("pro");
  const [tier, setTier] = useState("C");
  const [packValue, setPackValue] = useState(0);

  const entries = Math.max(0, Math.floor(players / team));
  const pool = poolMode === "entry" ? Math.round(perPlayer * 100) * players : Math.round(poolTotal * 100);
  const settings = {
    team_size: team,
    min_player_cents: Math.round(minPlayer * 100),
    round_player_cents: Math.round(rounding * 100),
    curve: (chosenSet ? DEFAULT_PAYOUT_CURVE : curveKey) as PayoutCurve,
    curve_b: chosenSet?.b,
    curve_version: chosenSet?.version,
    remainder_to: (remainderDest === "first" ? "first" : "hold") as "first" | "hold",
  };

  const sched = computePayoutSchedule({
    ...settings,
    pool_cents: pool,
    requested_places: requestedPlaces(depthMode, entries, depth),
  });

  const divisionType = divMode === "pro" ? "pro" : "am";
  const compliance = checkPayoutCompliance({
    sanctioned,
    mode: divMode === "true_am" ? "true_amateur" : "pdga_guided",
    division_type: divisionType,
    tier: tier as SanctionTier,
    entries,
    places_paid: sched.places.length,
    max_places: sched.max_places,
    net_entry_cents: pool,
    am_value_cents: (divMode === "true_am" ? 0 : sched.total_paid_cents) + Math.round(packValue * 100) * players,
  });

  // Reference grid: same settings across common field sizes.
  const grid = useMemo(() => {
    const sizes = [8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 72, 90].filter((s) => s % team === 0 || team === 1);
    return sizes.map((size) => {
      const e = Math.floor(size / team);
      const p = poolMode === "entry" ? Math.round(perPlayer * 100) * size : pool;
      return {
        size,
        entries: e,
        s: computePayoutSchedule({
          ...settings,
          pool_cents: p,
          requested_places: requestedPlaces(depthMode, e, depth),
        }),
      };
    });
  }, [team, poolMode, perPlayer, pool, entryFee, deductTotal, depthMode, depth, minPlayer, rounding, curveKey, remainderDest, chosenSet?.b]);
  const gridPlaces = Math.max(1, ...grid.map((g) => g.s.places.length));

  const unitWord = team > 1 ? "teams" : "players";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payout calculator"
        description="Estimate payouts for any league night or tournament, per team and per player."
        primaryAction={
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> Print table
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <ContentCard title="Payout settings" className="print-hide">
          <div className="space-y-4">
            <Field label="Format">
              <Segmented<number>
                value={team}
                options={[
                  { value: 1, label: "Singles" },
                  { value: 2, label: "Doubles" },
                  { value: 3, label: "Teams of 3" },
                  { value: 4, label: "Teams of 4" },
                ]}
                onChange={setTeam}
              />
            </Field>
            <Field label="Players">
              <Input type="number" min="1" value={players} onChange={(e) => setPlayers(num(e.target.value, 1))} />
            </Field>
            <Field label="Payout pool">
              <div className="space-y-2">
                <Segmented<"entry" | "pool">
                  value={poolMode}
                  options={[
                    { value: "entry", label: "From entry fee" },
                    { value: "pool", label: "Total pool" },
                  ]}
                  onChange={setPoolMode}
                />
                {poolMode === "entry" ? (
                  <div className="space-y-2">
                    <label className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="font-medium">Entry fee per player</span>
                      <Input
                        type="number"
                        min="0"
                        className="w-24"
                        aria-label="Entry fee per player (USD)"
                        value={entryFee}
                        onChange={(e) => setEntryFee(num(e.target.value))}
                      />
                    </label>
                    <div className="space-y-1.5 rounded-lg border border-border p-2">
                      <div className="text-[13px] text-muted-foreground">Taken out of each entry</div>
                      {deductions.map((d) => (
                        <div key={d.id} className="flex items-center gap-2">
                          <Input
                            aria-label="Fee name"
                            value={d.label}
                            onChange={(e) => updateDeduction(d.id, { label: e.target.value })}
                          />
                          <Input
                            type="number"
                            min="0"
                            step="0.5"
                            className="w-20"
                            aria-label={`${d.label} per player (USD)`}
                            value={d.amount}
                            onChange={(e) => updateDeduction(d.id, { amount: num(e.target.value) })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${d.label}`}
                            onClick={() => setDeductions((ds) => ds.filter((x) => x.id !== d.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDeductions((ds) => [
                            ...ds,
                            { id: Date.now(), label: "Other fee", amount: 0 },
                          ])
                        }
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add a fee
                      </Button>
                    </div>
                    <p className="text-[13px] text-muted-foreground">
                      {money(Math.round(perPlayer * 100))} per player goes back to players
                      {deductTotal > 0 ? ` · ${money(Math.round(deductTotal * 100))} to fees and side pots` : ""}.
                    </p>
                    {deductTotal > entryFee ? (
                      <p className="text-[13px] text-destructive">
                        Fees add up to more than the entry — raise the entry or trim a fee.
                      </p>
                    ) : null}
                    {players > 0 && deductions.some((d) => d.amount > 0) ? (
                      <ul className="text-[13px] text-muted-foreground">
                        {deductions.filter((d) => d.amount > 0).map((d) => (
                          <li key={d.id}>
                            {d.label}: {money(Math.round(d.amount * 100) * players)} total
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : (
                  <Input
                    type="number"
                    min="0"
                    step="5"
                    aria-label="Total payout pool (USD)"
                    value={poolTotal}
                    onChange={(e) => setPoolTotal(num(e.target.value))}
                  />
                )}
                {poolMode === "pool" ? (
                  <p className="text-[13px] text-muted-foreground">Everything you plan to pay out.</p>
                ) : null}
              </div>
            </Field>
            <Field label="Payout depth">
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<"top_percent" | "top_count">
                  value={depthMode}
                  options={[
                    { value: "top_percent", label: "% of field" },
                    { value: "top_count", label: "Places" },
                  ]}
                  onChange={(v) => {
                    setDepthMode(v);
                    setDepth(v === "top_percent" ? 40 : 3);
                  }}
                />
                <Input
                  type="number"
                  min="1"
                  className="w-24"
                  aria-label={depthMode === "top_percent" ? "Percent of field paid" : "Places paid"}
                  value={depth}
                  onChange={(e) => setDepth(num(e.target.value, 1))}
                />
              </div>
            </Field>
            <Field label="Minimum payout per player">
              <Segmented<number>
                value={minPlayer}
                options={[1, 5, 10, 20].map((v) => ({ value: v, label: `$${v}` }))}
                onChange={setMinPlayer}
              />
            </Field>
            <Field label="Payout curve">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={curveKey}
                onChange={(e) => setCurveKey(e.target.value)}
              >
                {PAYOUT_CURVES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
                {installed.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[13px] text-muted-foreground">Same curves as the PDGA payout calculator. Steeper pays the top more.</p>
            </Field>
            <Field label="Leftover money goes to">
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={remainderDest}
                onChange={(e) => setRemainderDest(e.target.value as RemainderDestination)}
              >
                {REMAINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Event type">
              <Segmented<number>
                value={sanctioned ? 1 : 0}
                options={[{ value: 0, label: "Unsanctioned" }, { value: 1, label: "PDGA sanctioned" }]}
                onChange={(v) => setSanctioned(v === 1)}
              />
            </Field>
            {sanctioned ? (
              <>
                <Field label="Division">
                  <Segmented<string>
                    value={divMode}
                    options={[{ value: "pro", label: "Pro (cash)" }, { value: "am", label: "Am (merch)" }, { value: "true_am", label: "True Amateur" }]}
                    onChange={setDivMode}
                  />
                </Field>
                <Field label="Tier">
                  <Segmented<string>
                    value={tier}
                    options={[{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }, { value: "league", label: "League" }]}
                    onChange={setTier}
                  />
                </Field>
                {divMode !== "pro" ? (
                  <Field label="Player pack + trophy retail value per player ($)">
                    <Input type="number" min="0" value={packValue} onChange={(e) => setPackValue(num(e.target.value))} />
                    <p className="mt-1 text-[13px] text-muted-foreground">Counts toward Amateur value, not cash.</p>
                  </Field>
                ) : null}
              </>
            ) : null}
            <Field label="Round each player's payout">
              <Segmented<number>
                value={rounding}
                options={[
                  { value: 5, label: "Nearest $5" },
                  { value: 10, label: "Nearest $10" },
                  { value: 1, label: "Nearest $1" },
                  { value: 0, label: "Exact" },
                ]}
                onChange={setRounding}
              />
            </Field>
            {team > 1 ? (
              <p className="rounded-lg bg-muted/50 p-3 text-[13px] text-muted-foreground">
                {team} players per team · minimum team payout {money(sched.min_team_cents)}
                {rounding > 0 ? ` · team payouts move in ${money(rounding * 100 * team)} steps` : ""}
              </p>
            ) : null}
          </div>
        </ContentCard>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Summary label="Available pool" value={money(sched.pool_cents)} />
            <Summary
              label={team > 1 ? "Teams paid" : "Places paid"}
              value={`${sched.places.length} of ${entries}`}
            />
            <Summary label="Total paid" value={money(sched.total_paid_cents)} />
            <Summary label="Remainder" value={money(sched.remainder_cents)} />
          </div>

          {sched.depth_note ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-[13px]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              {sched.depth_note}
            </p>
          ) : null}
          {sched.remainder_cents > 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {money(sched.remainder_cents)} can't be split into clean payouts and goes to: {remainderLabel(remainderDest)}.
            </p>
          ) : null}

          {sanctioned ? (
            <ContentCard title="PDGA payout check">
              <div className="space-y-2 text-sm">
                {compliance.rows.map((r) => (
                  <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
                    <span className="font-medium">{r.label}</span>
                    <span className="text-muted-foreground">Minimum {r.required} · Yours {r.actual}</span>
                    <span className={r.pass ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                      {r.pass ? "Pass" : "Needs attention"}
                    </span>
                  </div>
                ))}
                {compliance.advice.map((a) => (
                  <p key={a} className="flex items-start gap-2 text-[13px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{a}</p>
                ))}
                <p className="pt-1 text-[13px] text-muted-foreground">
                  Payout guidance: {PAYOUT_GUIDANCE_LABEL} · Compliance rules: {PDGA_RULESET.label}
                </p>
              </div>
            </ContentCard>
          ) : null}

          <ContentCard title="Payout by place" subtitle={`${players} players${team > 1 ? ` · ${entries} teams of ${team}` : ""}`}>
            {sched.places.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Raise the pool or field size to pay at least one {team > 1 ? "team" : "player"}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-4 font-medium">Place</th>
                      <th className="py-2 pr-4 font-medium">{team > 1 ? "Team payout" : "Payout"}</th>
                      {team > 1 ? <th className="py-2 pr-4 font-medium">Each player receives</th> : null}
                      <th className="py-2 font-medium">Share of pool</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sched.places.map((p) => (
                      <tr key={p.place} className="border-b border-border/60">
                        <td className="py-2 pr-4">{ordinal(p.place)}</td>
                        <td className="py-2 pr-4 font-medium tabular-nums">{money(p.cents)}</td>
                        {team > 1 ? (
                          <td className="py-2 pr-4 tabular-nums">{money(p.per_player_cents)} each</td>
                        ) : null}
                        <td className="py-2 tabular-nums text-muted-foreground">
                          {pool > 0 ? `${Math.round((p.cents / pool) * 100)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ContentCard>
        </div>
      </div>

      <ContentCard
        title="Full payout table"
        subtitle={`${team > 1 ? "Team payout (each player)" : "Payout"} by place for common field sizes, using the settings above.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-[13px]">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card py-2 pr-3 font-medium">Players</th>
                <th className="py-2 pr-3 font-medium">Pool</th>
                <th className="py-2 pr-3 font-medium">Paid</th>
                {Array.from({ length: gridPlaces }, (_, i) => (
                  <th key={i} className="py-2 pr-3 font-medium">{ordinal(i + 1)}</th>
                ))}
                <th className="py-2 font-medium">Remainder</th>
              </tr>
            </thead>
            <tbody>
              {grid.map((g) => (
                <tr key={g.size} className="border-b border-border/60">
                  <td className="sticky left-0 bg-card py-1.5 pr-3 font-medium">
                    {g.size}
                    {team > 1 ? <span className="text-muted-foreground"> · {g.entries} teams</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{money(g.s.pool_cents)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{g.s.places.length}</td>
                  {Array.from({ length: gridPlaces }, (_, i) => {
                    const p = g.s.places[i];
                    return (
                      <td key={i} className="py-1.5 pr-3 tabular-nums">
                        {p ? (
                          <>
                            {money(p.cents)}
                            {team > 1 ? (
                              <span className="text-muted-foreground"> ({money(p.per_player_cents)})</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 tabular-nums text-muted-foreground">
                    {g.s.remainder_cents > 0 ? money(g.s.remainder_cents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          Every paid player gets at least {money(Math.max(SYSTEM_MIN_PLAYER_PAYOUT_CENTS, minPlayer * 100))}; higher places
          never get less than lower ones; the pool is never overpaid. Player value protection: rounding never reduces a payout once it's locked. Estimates — final payouts follow real turnout.
        </p>
      </ContentCard>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
