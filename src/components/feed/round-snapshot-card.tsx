import { Trophy, Target, TrendingUp, Zap } from "lucide-react";

export type RoundSnapshot = {
  course_name?: string | null;
  layout_name?: string | null;
  holes?: number;
  total?: number;
  to_par?: number;
  rating?: number | null;
  aces?: number;
  eagles?: number;
  birdies?: number;
  pars?: number;
  bogeys?: number;
  doubles_plus?: number;
  c1_putt_pct?: number | null;
  c2_putt_pct?: number | null;
  longest_drive_ft?: number | null;
  best_hole?: { number: number; to_par: number } | null;
  worst_hole?: { number: number; to_par: number } | null;
};

function fmtPar(n?: number) {
  if (typeof n !== "number") return "";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `${n}`;
}

export function RoundSnapshotCard({ snap }: { snap: RoundSnapshot }) {
  return (
    <div className="mx-4 mb-3 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/10 via-transparent to-accent/10">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 p-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Round Recap
          </div>
          <div className="truncate text-sm font-semibold">
            {snap.course_name ?? "Round"}{" "}
            {snap.layout_name ? (
              <span className="text-xs font-normal text-muted-foreground">
                · {snap.layout_name}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex items-baseline gap-4 tabular-nums">
          {typeof snap.total === "number" ? (
            <div className="text-right">
              <div className="text-[11px] uppercase text-muted-foreground">Finish</div>
              <div className="font-graphic text-2xl leading-none text-primary">
                {typeof snap.to_par === "number" ? fmtPar(snap.to_par) : snap.total}
              </div>
              <div className="mt-0.5 text-[12px] text-muted-foreground">
                {typeof snap.to_par === "number"
                  ? `${snap.total} · Par ${snap.total - snap.to_par}`
                  : `${snap.total} · Par unknown`}
              </div>
            </div>
          ) : null}
          {typeof snap.rating === "number" ? (
            <div className="text-right">
              <div className="text-[11px] uppercase text-muted-foreground">DGD Round Rating</div>
              <div className="font-graphic text-2xl leading-none text-accent">{snap.rating}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs sm:grid-cols-4">
        <Stat
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Birdies+"
          value={(snap.aces ?? 0) + (snap.eagles ?? 0) + (snap.birdies ?? 0)}
          accent="text-primary"
        />
        <Stat icon={<Target className="h-3.5 w-3.5" />} label="Pars" value={snap.pars ?? 0} />
        <Stat
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Bogeys+"
          value={(snap.bogeys ?? 0) + (snap.doubles_plus ?? 0)}
          accent="text-amber-500"
        />
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Longest drive"
          value={snap.longest_drive_ft ? `${snap.longest_drive_ft}ft` : "—"}
        />
        {typeof snap.c1_putt_pct === "number" ? (
          <Stat label="C1 Putt" value={`${Math.round(snap.c1_putt_pct)}%`} />
        ) : null}
        {typeof snap.c2_putt_pct === "number" ? (
          <Stat label="C2 Putt" value={`${Math.round(snap.c2_putt_pct)}%`} />
        ) : null}
        {snap.best_hole ? (
          <Stat
            label={`Best · H${snap.best_hole.number}`}
            value={fmtPar(snap.best_hole.to_par)}
            accent="text-primary"
          />
        ) : null}
        {snap.worst_hole ? (
          <Stat
            label={`Worst · H${snap.worst_hole.number}`}
            value={fmtPar(snap.worst_hole.to_par)}
            accent="text-amber-500"
          />
        ) : null}
      </div>

      <ScoringDistribution snap={snap} />

      {(snap.aces ?? 0) > 0 ? (
        <div className="border-t border-border/60 bg-primary/10 px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-primary">
          🎯 {snap.aces} ace{(snap.aces ?? 0) > 1 ? "s" : ""} · chains rattled
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <div className="truncate text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className={"text-sm font-semibold tabular-nums " + (accent ?? "")}>{value}</div>
      </div>
    </div>
  );
}

function ScoringDistribution({ snap }: { snap: RoundSnapshot }) {
  const birdiesPlus = (snap.aces ?? 0) + (snap.eagles ?? 0) + (snap.birdies ?? 0);
  const pars = snap.pars ?? 0;
  const bogeysPlus = (snap.bogeys ?? 0) + (snap.doubles_plus ?? 0);
  const total = birdiesPlus + pars + bogeysPlus;
  if (total <= 0) return null;
  const pct = (n: number) => (n / total) * 100;
  return (
    <div className="border-t border-border/60 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Scoring mix</span>
        <span className="tabular-nums">{total} holes</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {birdiesPlus > 0 ? (
          <div
            className="bg-primary"
            style={{ width: `${pct(birdiesPlus)}%` }}
            title={`${birdiesPlus} birdie or better`}
          />
        ) : null}
        {pars > 0 ? (
          <div
            className="bg-muted-foreground/40"
            style={{ width: `${pct(pars)}%` }}
            title={`${pars} pars`}
          />
        ) : null}
        {bogeysPlus > 0 ? (
          <div
            className="bg-amber-500"
            style={{ width: `${pct(bogeysPlus)}%` }}
            title={`${bogeysPlus} bogey or worse`}
          />
        ) : null}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span className="text-primary">Birdie+ {birdiesPlus}</span>
        <span>Par {pars}</span>
        <span className="text-amber-500">Bogey+ {bogeysPlus}</span>
      </div>
    </div>
  );
}
