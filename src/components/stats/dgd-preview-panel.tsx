import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight, FlaskConical, Gauge, Info, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getMyDgdPreview, getMyDgdPreviewHistory, getMyDgdScaleCandidates } from "@/lib/dgd-v1.functions";
import {
  DGD_MODEL_STORAGE_KEY,
  HISTORY_CATEGORY_FILTERS,
  HISTORY_SOURCE_FILTERS,
  RATING_STATUS_LABEL,
  SOURCE_BADGE_BY_ID,
  freshnessWording,
  indexedSeries,
  SOURCE_BADGES,
  STATUS_LABEL,
  changeWording,
  confidenceBand,
  courseDayWording,
  explainChange,
  formWording,
  formLabels,
  resolveModelView,
  strokesVsExpectation,
  type DgdModelView,
} from "@/lib/dgd-v1/preview-format";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Summary = Record<string, any>;
type Round = Record<string, any>;

/**
 * DGD model section for Statboard. Renders nothing for players without
 * preview access, so the production Statboard is unchanged for them.
 */
export function DgdModelSection() {
  return (
    <section className="space-y-3" aria-label="DGD model">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 px-4 py-2.5 text-sm">
        <FlaskConical className="h-4 w-4 text-accent" aria-hidden />
        <span className="font-semibold">Production model</span>
        <span className="text-muted-foreground">dgd-core-v1.3@0.3.0 · scale dgd-scale-1000-v1 · Legacy archived · V1.2 and V1.1 frozen for research</span>
      </div>
      <DgdRatingSection />
    </section>
  );
}

type PreviewModel = "v13" | "v12" | "v11";
const MODEL_LABEL: Record<PreviewModel, string> = { v13: "DGD Rating", v12: "DGD V1.2 Preview", v11: "DGD V1.1 Control" };

function FreshnessLine({ f, label }: { f: any; label: string }) {
  if (!f) return null;
  const w = freshnessWording(f);
  const tone = w.state === "CURRENT" ? "text-muted-foreground" : w.state === "ERROR" ? "text-red-400" : "text-amber-400";
  return <p className={`px-1 text-xs ${tone}`} role="status">{label} · {w.text}</p>;
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums leading-snug">{value}</div>
    </div>
  );
}

function TrendIcon({ t }: { t: string }) {
  if (t === "improving") return <TrendingUp className="h-4 w-4 text-emerald-400" aria-hidden />;
  if (t === "declining") return <TrendingDown className="h-4 w-4 text-red-400" aria-hidden />;
  return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden />;
}
const TREND_LABEL: Record<string, string> = { improving: "Improving", stable: "Stable", declining: "Declining", insufficient: "Not enough history" };

export function DgdPreviewPanel({ s, model = "v12" }: { s: Summary; model?: PreviewModel }) {
  const lowContext = s.form_state === "LOW_CONTEXT" || s.form_state === "UNAVAILABLE";
  const form = formWording(s.form_minus_skill ?? s.form_delta, s.form_rounds ?? 0);
  const fl = formLabels(s.form_value ?? (s.display_rating != null && s.form_delta != null ? s.display_rating + s.form_delta : null), s.form_minus_skill ?? s.form_delta, s.form_rounds ?? 0);
  const updated = s.updated_at ? new Date(s.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
  return (
    <div className="space-y-4">
      {/* Performance card */}
      <div className="rounded-2xl border border-accent/30 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{model === "v13" ? "DGD Rating" : model === "v12" ? "DGD V1.2" : "DGD V1.1 Control"}</h2>
          {model !== "v13" && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
            PREVIEW · UNCALIBRATED
          </span>
          )}
          <Link to="/dgd-methodology" className="ml-auto inline-flex items-center gap-1 text-sm text-primary hover:underline">
            <Info className="h-3.5 w-3.5" aria-hidden /> How DGD works
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{model === "v13" ? "DGD Rating" : "Preview rating"}</div>
            <div className="text-3xl font-bold tabular-nums text-accent">{s.display_rating ?? "—"}</div>
            {s.rating_status && <div className="text-xs text-muted-foreground">{RATING_STATUS_LABEL[s.rating_status] ?? s.rating_status}</div>}
          </div>
          {lowContext ? (
            <>
              <Stat label="Form" value="Low Context" hint="Your recent rounds don't have enough course detail to judge a rise or drop yet." />
              <Stat label="Form vs Rating" value="—" hint="Shown once recent rounds have enough course detail." />
            </>
          ) : (
            <>
              <Stat label="Form" value={fl.form.value ?? form.label} hint={model !== "v11" ? "Recent DGD performance, weighted toward newer rounds and rounds DGD understands well. Same scale as your rating." : "Average DGD performance over your last 8 eligible rounds, on the same scale as your rating."} />
              <Stat label="Form vs Rating" value={fl.vsSkill.value ? `${fl.vsSkill.value} · ${form.label}` : "—"} hint="Form minus your DGD Rating. Negative means recent rounds are below your rating." />
            </>
          )}
          <Stat label="Confidence" value={`${confidenceBand(s.confidence)} · ${s.confidence ?? "—"}%`} hint="How certain DGD is about your current ability. It is not your skill level." />
          <Stat label="Trend (90 days)" value={<span className="inline-flex items-center gap-1"><TrendIcon t={s.trend} />{TREND_LABEL[s.trend] ?? "—"}</span>} />
          <Stat label="Eligible rounds" value={s.eligible_rounds ?? 0} />
          <Stat label="Last updated" value={updated} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {model === "v13" ? "One rating from every eligible round you've logged — PDGA, UDisc singles with cardmates, and DG Dashboard. It sits beside your PDGA and UDisc ratings and never replaces them." : null}
        </p>
        <p className={model === "v13" ? "hidden" : "mt-3 text-sm text-muted-foreground"}>
          This preview number is a placeholder scale and isn't your public DGD Rating. Your public rating still uses the Production model.
        </p>
      </div>


      <ExpectedScores layouts={s.layouts ?? []} />
      <SourceCoverage c={s.coverage} />
      <PerformanceHistory model={model} />
      {model === "v12" && <ScaleCandidates />}
      {model !== "v13" && <LegacyComparison model={model} />}
      <p className="text-xs text-muted-foreground">
        Model: {model === "v13" ? "DGD Rating · 0–1000 scale (1000 is theoretical perfection)" : model === "v12" ? "DGD Core V1.2" : "DGD Core V1.1 (frozen control)"} · {model === "v13" ? "PUBLIC" : String(s.stage ?? "shadow").replace("_", " ").toUpperCase()}
        {model !== "v11" && s.form_confidence ? ` · Form confidence ${String(s.form_confidence).toLowerCase()}` : ""}
      </p>
    </div>
  );
}

function ExpectedScores({ layouts }: { layouts: any[] }) {
  const [all, setAll] = useState(false);
  if (!layouts.length) return null;
  const shown = all ? layouts : layouts.slice(0, 6);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Your expected score</h3>
      <p className="mb-3 text-sm text-muted-foreground">On layouts you've played, from what DGD knows today.</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((l, i) => (
          <li key={i} className="rounded-xl border border-border/70 p-3">
            <div className="truncate text-sm font-medium" title={l.layout_name ?? ""}>{l.layout_name ?? "Unnamed layout"}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums">{l.expected}</span>
              <span className="text-sm text-muted-foreground">Likely range {l.likely_low}–{l.likely_high}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Confidence {l.layout_confidence} · {l.player_rounds} round{l.player_rounds === 1 ? "" : "s"} · best {l.best_score ?? "—"} · avg {l.avg_score ?? "—"}
            </div>
          </li>
        ))}
      </ul>
      {layouts.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer layouts" : `Show all ${layouts.length} layouts`}
        </Button>
      )}
    </div>
  );
}

const PAGE = 20;
const RATED_FILTERS: { id: boolean | null; label: string }[] = [
  { id: null, label: "Any status" },
  { id: true, label: "DGD rated" },
  { id: false, label: "DGD not rated" },
];

type HistFilters = { source: string | null; rated: boolean | null; category: string | null; from: string; to: string; course: string };
const NO_FILTERS: HistFilters = { source: null, rated: null, category: null, from: "", to: "", course: "" };

function SourceCoverage({ c }: { c: any }) {
  if (!c || !c.physical_rounds) return null;
  const items = [
    { label: "Physical rounds", value: c.physical_rounds },
    { label: "With PDGA", value: c.pdga },
    { label: "With UDisc", value: c.udisc },
    { label: "Scored in DG Dashboard", value: c.app },
    { label: "Linked across sources", value: c.multi_source },
    { label: "Count toward DGD", value: c.eligible },
    { label: "Pending review", value: c.pending_review },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Where your DGD evidence comes from</h3>
      <p className="mb-3 text-sm text-muted-foreground">One round linked from several sources counts once.</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {items.map((i) => (
          <div key={i.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{i.label}</dt>
            <dd className="text-base font-semibold tabular-nums">{i.value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PerformanceHistory({ model }: { model: PreviewModel }) {
  const fetchRounds = useServerFn(getMyDgdPreviewHistory);
  const [page, setPage] = useState(0);
  const [f, setF] = useState<HistFilters>(NO_FILTERS);
  const [open, setOpen] = useState<Round | null>(null);
  const set = (patch: Partial<HistFilters>) => { setF((x) => ({ ...x, ...patch })); setPage(0); };
  const q = useQuery({
    queryKey: ["dgd-preview-history", model, page, f],
    queryFn: () =>
      fetchRounds({
        data: {
          limit: PAGE, offset: page * PAGE, source: f.source as any, rated: f.rated, category: f.category as any,
          from: f.from || null, to: f.to || null, course: f.course.trim() || null, model,
        },
      }),
    throwOnError: false,
  });
  const total = q.data?.total ?? 0;
  const active = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);
  const sel = "h-9 rounded-lg border border-input bg-background px-2 text-sm";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">DGD round history</h3>
        {active && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setF(NO_FILTERS); setPage(0); }}>Clear filters</Button>}
      </div>
      <div className="mb-3 flex gap-1 flex-wrap pb-1">
        {HISTORY_SOURCE_FILTERS.map((o) => (
          <Button key={o.label} size="sm" className="shrink-0" variant={f.source === o.id ? "secondary" : "ghost"} onClick={() => set({ source: o.id })}>{o.label}</Button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <select aria-label="DGD status" className={sel} value={String(f.rated)} onChange={(e) => set({ rated: e.target.value === "null" ? null : e.target.value === "true" })}>
          {RATED_FILTERS.map((o) => <option key={o.label} value={String(o.id)}>{o.label}</option>)}
        </select>
        <select aria-label="Round type" className={sel} value={f.category ?? ""} onChange={(e) => set({ category: e.target.value || null })}>
          {HISTORY_CATEGORY_FILTERS.map((o) => <option key={o.label} value={o.id ?? ""}>{o.label}</option>)}
        </select>
        <input aria-label="From date" type="date" className={sel} value={f.from} onChange={(e) => set({ from: e.target.value })} />
        <input aria-label="To date" type="date" className={sel} value={f.to} onChange={(e) => set({ to: e.target.value })} />
        <input aria-label="Course or layout" placeholder="Course or layout" className={`${sel} col-span-2 sm:col-span-1`} value={f.course} maxLength={80} onChange={(e) => set({ course: e.target.value })} />
      </div>
      {q.isError ? (
        <p className="text-sm text-muted-foreground">Your DGD rounds didn't load. Everything else on Statboard still works — try again in a moment.</p>
      ) : q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your rounds…</p>
      ) : !q.data?.rounds.length ? (
        <p className="text-sm text-muted-foreground">No rounds match these filters.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {q.data.rounds.map((r: Round) => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpen(r)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-muted/30">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{r.event_name ?? r.course_name ?? "Round"}</span>
                    {(r.sources ?? []).map((src: string) => {
                      const b = SOURCE_BADGES[SOURCE_BADGE_BY_ID[src] ?? "dgd"];
                      return <span key={src} className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${b.tone}`}>{b.label}</span>;
                    })}
                    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{STATUS_LABEL[r.status] ?? r.status}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.played_on} · {r.layout_name ?? r.course_name ?? "Layout unknown"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm tabular-nums">
                  <div className="font-semibold">{r.score}</div>
                  <div className="text-xs text-muted-foreground">{r.pre_expected != null ? `exp ${r.pre_expected}` : r.status_reason ?? ""}</div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Newer</Button>
          <span className="text-muted-foreground tabular-nums">{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} of {total}</span>
          <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Older</Button>
        </div>
      )}
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">{open && <RoundDetail r={open} />}</SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Tester research view. Legacy and V1.1 use unlike scales, so each is shown
 * as change from its own starting point on its own chart — never one axis.
 */
/** Research-only: candidate public scales. Values come stored from the backend; nothing is converted here. */
function ScaleCandidates() {
  const fetchScales = useServerFn(getMyDgdScaleCandidates);
  const q = useQuery({ queryKey: ["dgd-scale-candidates"], queryFn: () => fetchScales(), staleTime: 10 * 60_000, throwOnError: false });
  const rows = q.data?.rows ?? [];
  if (!rows.length) return null;
  const bench = rows.find((r: any) => r.benchmark_version);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Rating scale research · testers only</h3>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Not your public rating</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Your underlying ability estimate stays the same. Each row shows it on a different candidate scale we're testing.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr><th className="py-1 text-left font-medium">Scale</th><th className="text-right font-medium">DGD Rating</th><th className="text-right font-medium">Form</th><th className="text-right font-medium">Confidence</th><th className="text-right font-medium">Percentile</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r: any) => (
              <tr key={r.scale_version} className="border-t border-border/60">
                <td className="py-1.5">{r.scale_version.replace("dgd-scale-", "")}</td>
                <td className="text-right">{Number(r.display_rating).toFixed(1)}</td>
                <td className="text-right">{r.display_form == null ? "—" : Number(r.display_form).toFixed(1)}</td>
                <td className="text-right">{confidenceBand(r.confidence)} · {Math.round(Number(r.confidence))}%</td>
                <td className="text-right">{r.percentile == null ? "—" : Math.round(Number(r.percentile))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bench && (
        <p className="mt-2 text-xs text-muted-foreground">
          Percentile is among the DGD research benchmark ({bench.benchmark_sample} benchmarked PDGA-rated players active in the last 2 years with 10+ rated rounds), not all disc golfers.
        </p>
      )}
    </div>
  );
}

function LegacyComparison({ model }: { model: PreviewModel }) {
  const fetchRounds = useServerFn(getMyDgdPreviewHistory);
  const [show, setShow] = useState(false);
  const q = useQuery({
    queryKey: ["dgd-preview-compare", model],
    enabled: show,
    queryFn: () => fetchRounds({ data: { limit: 100, offset: 0, source: null, rated: null, category: null, from: null, to: null, course: null, model } }),
    throwOnError: false,
  });
  const rows = [...(q.data?.rounds ?? [])].reverse();
  const rated = rows.filter((r: Round) => r.display_after != null);
  const legacyRows = rows.filter((r: Round) => r.legacy_round_rating != null);
  // Legacy: rolling 8-round average of its own round estimates.
  const legacyAvg = legacyRows.map((_: Round, i: number) => {
    const w = legacyRows.slice(Math.max(0, i - 7), i + 1).map((x: Round) => x.legacy_round_rating as number);
    return w.reduce((a: number, b: number) => a + b, 0) / w.length;
  });
  const v11 = indexedSeries(rated.map((r: Round) => Number(r.display_after)));
  const leg = indexedSeries(legacyAvg);
  const dir = (xs: (number | null)[]) => {
    const vals = xs.filter((x): x is number => x != null);
    if (vals.length < 2) return "Not enough rounds";
    const d = vals[vals.length - 1] - vals[Math.max(0, vals.length - 11)];
    return Math.abs(d) < 0.5 ? "Steady" : d > 0 ? "Rising" : "Falling";
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Legacy vs {model === "v12" ? "V1.2" : "V1.1"} · tester comparison</h3>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShow((v) => !v)}>{show ? "Hide" : "Compare"}</Button>
      </div>
      <p className="text-sm text-muted-foreground">The two use different scales. Each line shows change from its own starting point, so compare direction, not numbers.</p>
      {show && (q.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
      ) : q.isError ? (
        <p className="mt-3 text-sm text-muted-foreground">The comparison didn't load. Try again in a moment.</p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <MiniTrend title="DGD Legacy (rolling round average)" points={leg} direction={dir(leg)} unit="rating pts" />
          <MiniTrend title={`DGD ${model === "v12" ? "V1.2" : "V1.1"} Preview (DGD Rating after each round)`} points={v11} direction={dir(v11)} unit="preview pts" />
          <div className="sm:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Last 100 rounds" value={rows.length} />
            <Stat label="Legacy has an estimate" value={legacyRows.length} />
            <Stat label={`Counted by ${model === "v12" ? "V1.2" : "V1.1"}`} value={rated.length} />
            <Stat label={`Counted by ${model === "v12" ? "V1.2" : "V1.1"} only`} value={rated.filter((r: Round) => r.legacy_round_rating == null).length} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniTrend({ title, points, direction, unit }: { title: string; points: (number | null)[]; direction: string; unit: string }) {
  const vals = points.filter((x): x is number => x != null);
  const W = 300, H = 80;
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = max - min || 1;
  const path = vals.map((v, i) => `${i ? "L" : "M"}${((i / Math.max(1, vals.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`).join(" ");
  const zeroY = H - ((0 - min) / span) * H;
  return (
    <figure className="min-w-0 rounded-xl border border-border/70 p-3">
      <figcaption className="text-xs font-medium">{title}</figcaption>
      <div className="text-xs text-muted-foreground">Recent direction: {direction} · last {vals.length ? `${vals[vals.length - 1] >= 0 ? "+" : "−"}${Math.abs(vals[vals.length - 1]).toFixed(1)} ${unit}` : "—"}</div>
      {vals.length > 1 ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`${title} trend`}>
          <line x1="0" x2={W} y1={zeroY} y2={zeroY} className="stroke-border" strokeDasharray="3 3" />
          <path d={path} fill="none" className="stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Not enough rounds to draw a trend.</p>
      )}
    </figure>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function RoundDetail({ r }: { r: Round }) {
  const ex = explainChange(r as any);
  const toPar = r.par != null ? r.score - r.par : null;
  const day = courseDayWording(r.event_adjustment);
  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="text-left">{r.event_name ?? "Round"}</SheetTitle>
        <p className="text-left text-sm text-muted-foreground">{r.played_on} · {STATUS_LABEL[r.status] ?? r.status}{r.status_reason ? ` — ${r.status_reason}` : ""}</p>
      </SheetHeader>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Round result</h4>
        <Row label="Score" value={r.score} />
        <Row label="Par" value={r.par ?? "—"} />
        <Row label="Score to par" value={toPar == null ? "—" : toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : toPar} />
        <Row label="Layout" value={r.layout_name ?? "—"} />
        {r.division && <Row label="Division" value={r.division} />}
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source ratings</h4>
        <Row label="Official PDGA Round Rating" value={r.pdga_round_rating ?? "Not rated yet"} />
        {(r.sources?.includes("udisc") || r.udisc_round_rating != null) && (
          <Row label="UDisc Round Rating" value={r.udisc_round_rating ?? "Not supplied by UDisc"} />
        )}
      </section>
      <section>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Before the round</h4>
        <Row label="DGD Expected Score" value={r.pre_expected ?? "—"} />
        {r.likely_low != null && <Row label="Likely range" value={`${r.likely_low}–${r.likely_high}`} />}
        <Row label="Versus expectation" value={strokesVsExpectation(r.pre_strokes_vs_expectation) ?? "—"} />
      </section>
      {r.ctx_expected != null && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">After the round · how the course played</h4>
          {day && <Row label="That day" value={day} />}
          <Row label="Context-adjusted expected score" value={r.ctx_expected} />
          <Row label="Contextual performance" value={strokesVsExpectation(r.ctx_strokes_vs_expectation) ?? "—"} />
          <p className="mt-1 text-xs text-muted-foreground">Uses how the rest of the field scored. It isn't a forecast, and it never changes the layout's usual difficulty.</p>
        </section>
      )}
      {r.round_performance_display != null && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rating impact (preview scale)</h4>
          <Row label="DGD round performance" value={r.round_performance_display} />
          <Row label="DGD before → after" value={`${r.display_before} → ${r.display_after}`} />
          <Row label="Confidence before → after" value={`${r.confidence_before}% → ${r.confidence_after}%`} />
        </section>
      )}
      <section className="rounded-xl border border-border p-3">
        <h4 className="mb-1 text-sm font-semibold">Why did my DGD change?</h4>
        <p className="text-sm text-muted-foreground">{ex.headline}</p>
        {ex.lines.map((l) => <Row key={l.label} label={l.label} value={l.value} />)}
        <Link to="/dgd-methodology" className="mt-2 inline-block text-sm text-primary hover:underline">How DGD works</Link>
      </section>
    </div>
  );
}

/** Public DGD Rating (V1.3, 0–1000 scale) for every signed-in player. */
export function DgdRatingSection() {
  const fetchSummary = useServerFn(getMyDgdPreview);
  const q = useQuery({
    queryKey: ["dgd-rating-v13"],
    queryFn: async () => {
      try {
        return (await fetchSummary({ data: { model: "v13" } })) as Summary;
      } catch {
        return { allowed: false, available: false, error: true } as Summary;
      }
    },
    staleTime: 5 * 60_000,
    throwOnError: false,
  });
  const s = q.data;
  if (!s?.allowed) return null;
  return (
    <section className="space-y-3" aria-label="DGD Rating">
      <FreshnessLine f={s.freshness} label="DGD Rating" />
      {s.available ? (
        <DgdPreviewPanel s={s} model="v13" />
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Your DGD Rating appears after your first eligible round is processed. Import PDGA or UDisc rounds, or score a round with cardmates.
        </div>
      )}
    </section>
  );
}

/** Development tab: how the DGD Rating has moved and how consistent rounds are. */
export function DgdDevelopmentCard() {
  const fetchSummary = useServerFn(getMyDgdPreview);
  const q = useQuery({
    queryKey: ["dgd-rating-v13"],
    queryFn: async () => {
      try { return (await fetchSummary({ data: { model: "v13" } })) as Summary; } catch { return null; }
    },
    staleTime: 5 * 60_000,
  });
  const s: any = q.data;
  if (!s) return null;
  return (
    <>
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-primary" aria-hidden />DGD Rating trend</h3>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="30 days" value={changeWording(s.change_30)} />
        <Stat label="90 days" value={changeWording(s.change_90)} />
        <Stat label="180 days" value={changeWording(s.change_180)} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {s.volatility != null ? `Consistency: your rounds usually land within about ±${s.volatility} strokes of what's expected.` : "Consistency shows after 20+ recent rounds."}
      </p>
    </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" aria-hidden />Recent performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="py-1 text-left font-medium">Rounds</th><th className="text-right font-medium">DGD performance</th><th className="text-right font-medium">Vs expectation</th><th className="text-right font-medium">PDGA avg</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {(["last5", "last10", "last20"] as const).map((k) => {
                  const b = s.recent?.[k];
                  return (
                    <tr key={k} className="border-t border-border/60">
                      <td className="py-1.5">Last {k.slice(4)}</td>
                      <td className="text-right">{b?.avg_round_performance ?? "—"}</td>
                      <td className="text-right">{b ? `${b.avg_strokes_vs_expectation >= 0 ? "+" : "−"}${Math.abs(b.avg_strokes_vs_expectation).toFixed(1)}` : "—"}</td>
                      <td className="text-right">{b?.avg_pdga_round_rating ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">PDGA averages are official round ratings, shown separately.</p>
        </div>
    </>
  );
}
