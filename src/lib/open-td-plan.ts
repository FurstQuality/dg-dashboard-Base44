/**
 * Open Event Director Kit — the plan model behind the account-free directing
 * tool at /td-kit.
 *
 * A plan is one self-contained JSON document: event basics, the run-of-day
 * checklist, the running order, divisions and money, and the player list. It
 * lives in the browser by default and can be pushed to a shareable link.
 *
 * Everything here is pure so both the local and shared routes, and tests, use
 * the same rules. Tier requirements come from `sanctioning-plan.ts`; the
 * running order reuses the league night agenda model.
 */
import {
  buildTdChecklist,
  tierProfile,
  type ChecklistRow,
  type EventPhase,
  type TierCode,
} from "@/lib/sanctioning-plan";
import {
  buildDefaultNightAgenda,
  parseNightAgenda,
  sortNightAgenda,
  type NightItem,
} from "@/lib/league-night-schedule";

export const PLAN_VERSION = 1;

export type PlanKind = "tournament" | "league";

export type PlanTask = {
  id: string;
  label: string;
  phase: EventPhase;
  done: boolean;
  /** Added by the director rather than generated from the tier rules. */
  custom: boolean;
  owner?: string;
};

export type PlanDivision = {
  id: string;
  name: string;
  entryFeeCents: number;
  /** Expected or registered players in this division. */
  players: number;
};

export type PlanPlayer = {
  id: string;
  name: string;
  division: string;
  pdgaNumber: string;
  paid: boolean;
  checkedIn: boolean;
  note: string;
};

export type PlanMoney = {
  /** Share of entry fees that goes back out as payout, 0–100. */
  payoutPercent: number;
  /** Per-player money held out of entry fees for CTP prizes. */
  ctpPerPlayerCents: number;
  /** Per-player optional ace pot buy-in. */
  acePotPerPlayerCents: number;
  /** Cash or merch added by the club or a sponsor. */
  addedValueCents: number;
  /** Fixed costs: permits, insurance, printing, sanctioning. */
  expensesCents: number;
  payoutKind: "cash" | "merch" | "trophy_only";
};

export type OpenPlan = {
  version: number;
  title: string;
  kind: PlanKind;
  date: string;
  startTime: string;
  courseName: string;
  layoutName: string;
  holes: number;
  rounds: number;
  location: string;
  sanctioned: boolean;
  tier: TierCode | "";
  pdgaEventNumber: string;
  tdName: string;
  tdEmail: string;
  tdPhone: string;
  notes: string;
  agenda: NightItem[];
  tasks: PlanTask[];
  divisions: PlanDivision[];
  money: PlanMoney;
  players: PlanPlayer[];
};

export const PHASE_LABEL: Record<EventPhase, string> = {
  pre: "Before the event",
  day_of: "Event day",
  post: "After the event",
};

export const PHASE_ORDER: EventPhase[] = ["pre", "day_of", "post"];

export function planId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function money(cents: number): string {
  return `$${(Math.round(cents) / 100).toFixed(2)}`;
}

export function centsFromInput(value: string): number {
  const n = Number.parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

function defaultDivisions(): PlanDivision[] {
  return [
    { id: planId(), name: "MA1 — Advanced", entryFeeCents: 3000, players: 0 },
    { id: planId(), name: "MA3 — Intermediate", entryFeeCents: 2500, players: 0 },
    { id: planId(), name: "FA1 — Advanced Women", entryFeeCents: 2500, players: 0 },
  ];
}

export function newPlan(kind: PlanKind = "tournament"): OpenPlan {
  const base: OpenPlan = {
    version: PLAN_VERSION,
    title: kind === "league" ? "Weekly league night" : "Club tournament",
    kind,
    date: new Date().toISOString().slice(0, 10),
    startTime: kind === "league" ? "17:30" : "09:00",
    courseName: "",
    layoutName: "",
    holes: 18,
    rounds: 1,
    location: "",
    sanctioned: false,
    tier: "",
    pdgaEventNumber: "",
    tdName: "",
    tdEmail: "",
    tdPhone: "",
    notes: "",
    agenda: [],
    tasks: [],
    divisions: defaultDivisions(),
    money: {
      payoutPercent: 100,
      ctpPerPlayerCents: 200,
      acePotPerPlayerCents: 100,
      addedValueCents: 0,
      expensesCents: 0,
      payoutKind: kind === "league" ? "cash" : "merch",
    },
    players: [],
  };
  base.agenda = buildDefaultNightAgenda({
    startTime: base.startTime,
    holes: base.holes,
    rounds: base.rounds,
  });
  base.tasks = syncTasks(base, []);
  return base;
}

/** Tier-aware task rows for the current plan settings. */
export function generatedTaskRows(plan: OpenPlan): ChecklistRow[] {
  const hasEntryFee = plan.divisions.some((d) => d.entryFeeCents > 0);
  return buildTdChecklist({
    sanctioned: plan.sanctioned && !!plan.tier,
    tier: plan.tier || null,
    hasEntryFee,
    hasPayouts: hasEntryFee && plan.money.payoutKind !== "trophy_only",
    rounds: plan.rounds,
  });
}

/**
 * Rebuilds the generated part of the checklist for the current settings while
 * keeping every tick the director already made and every task they added.
 */
export function syncTasks(plan: OpenPlan, existing: PlanTask[]): PlanTask[] {
  const rows = generatedTaskRows(plan);
  const doneByLabel = new Map(existing.map((t) => [t.label, t]));
  const generated: PlanTask[] = rows.map((row) => {
    const prev = doneByLabel.get(row.label);
    return {
      id: prev?.id ?? planId(),
      label: row.label,
      phase: row.phase,
      done: prev?.done ?? false,
      custom: false,
      ...(prev?.owner ? { owner: prev.owner } : {}),
    };
  });
  const custom = existing.filter((t) => t.custom);
  return [...generated, ...custom];
}

export type PhaseProgress = { phase: EventPhase; done: number; total: number };

export function taskProgress(tasks: PlanTask[]): PhaseProgress[] {
  return PHASE_ORDER.map((phase) => {
    const rows = tasks.filter((t) => t.phase === phase);
    return { phase, done: rows.filter((t) => t.done).length, total: rows.length };
  });
}

export type MoneyBreakdown = {
  playerCount: number;
  entryTotalCents: number;
  ctpTotalCents: number;
  acePotTotalCents: number;
  payoutPoolCents: number;
  clubKeepsCents: number;
  perDivision: {
    id: string;
    name: string;
    players: number;
    entryFeeCents: number;
    collectedCents: number;
    payoutCents: number;
    /** Suggested split for 1st / 2nd / 3rd, in cents. */
    topThreeCents: number[];
  }[];
  warnings: string[];
};

/** Money math for the plan: what comes in, what goes back out, what's left. */
export function computeMoney(plan: OpenPlan): MoneyBreakdown {
  const pct = Math.min(100, Math.max(0, plan.money.payoutPercent)) / 100;
  const perDivision = plan.divisions.map((d) => {
    const players = Math.max(0, Math.round(d.players));
    const collected = players * d.entryFeeCents;
    const holdBack = players * (plan.money.ctpPerPlayerCents + plan.money.acePotPerPlayerCents);
    const payout = Math.max(0, Math.round((collected - holdBack) * pct));
    return {
      id: d.id,
      name: d.name,
      players,
      entryFeeCents: d.entryFeeCents,
      collectedCents: collected,
      payoutCents: payout,
      topThreeCents: splitTopThree(payout, players),
    };
  });

  const playerCount = perDivision.reduce((s, d) => s + d.players, 0);
  const entryTotal = perDivision.reduce((s, d) => s + d.collectedCents, 0);
  const ctpTotal = playerCount * plan.money.ctpPerPlayerCents;
  const aceTotal = playerCount * plan.money.acePotPerPlayerCents;
  const payoutPool = perDivision.reduce((s, d) => s + d.payoutCents, 0);
  const clubKeeps =
    entryTotal + plan.money.addedValueCents - ctpTotal - aceTotal - payoutPool - plan.money.expensesCents;

  const warnings: string[] = [];
  const t = plan.sanctioned && plan.tier ? tierProfile(plan.tier) : null;
  if (t && t.payoutStyle === "merch_only" && plan.money.payoutKind === "cash") {
    warnings.push(`${t.label} is amateur-only — winners take merchandise or credit, not cash.`);
  }
  if (t && entryTotal > 0 && pct < t.minPayoutRatio) {
    warnings.push(
      `${t.label} expects at least ${Math.round(t.minPayoutRatio * 100)}% of the division purse paid back out.`,
    );
  }
  if (clubKeeps < 0) {
    warnings.push("Payout, prizes, and costs add up to more than the money coming in.");
  }
  if (playerCount === 0) {
    warnings.push("Add expected player counts per division to see the payout table.");
  }
  return {
    playerCount,
    entryTotalCents: entryTotal,
    ctpTotalCents: ctpTotal,
    acePotTotalCents: aceTotal,
    payoutPoolCents: payoutPool,
    clubKeepsCents: clubKeeps,
    perDivision,
    warnings,
  };
}

/** 50/30/20 for a full card, tapering down for tiny divisions. */
function splitTopThree(payout: number, players: number): number[] {
  if (payout <= 0 || players <= 0) return [];
  if (players <= 2) return [payout];
  if (players <= 4) return [Math.round(payout * 0.65), payout - Math.round(payout * 0.65)];
  const first = Math.round(payout * 0.5);
  const second = Math.round(payout * 0.3);
  return [first, second, payout - first - second];
}

export type RosterTotals = {
  total: number;
  paid: number;
  checkedIn: number;
  unpaid: number;
};

export function rosterTotals(players: PlanPlayer[]): RosterTotals {
  const paid = players.filter((p) => p.paid).length;
  return {
    total: players.length,
    paid,
    checkedIn: players.filter((p) => p.checkedIn).length,
    unpaid: players.length - paid,
  };
}

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
function csvCell(value: string | number | boolean): string {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function rosterCsv(plan: OpenPlan): string {
  const header = ["Player", "Division", "PDGA #", "Paid", "Checked in", "Note"];
  const rows = plan.players.map((p) => [
    p.name,
    p.division,
    p.pdgaNumber,
    p.paid ? "Yes" : "No",
    p.checkedIn ? "Yes" : "No",
    p.note,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function planSummaryLine(plan: OpenPlan): string {
  const bits = [
    plan.kind === "league" ? "League night" : "Tournament",
    plan.courseName || "Course to confirm",
    `${plan.rounds} round${plan.rounds > 1 ? "s" : ""} · ${plan.holes} holes`,
  ];
  if (plan.sanctioned && plan.tier) bits.push(`PDGA ${plan.tier}-tier`);
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Accepts anything (stored JSON, pasted blob) and returns a usable plan. */
export function parsePlan(raw: unknown): OpenPlan {
  const base = newPlan();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const kind: PlanKind = r.kind === "league" ? "league" : "tournament";
  const plan: OpenPlan = {
    ...base,
    kind,
    version: PLAN_VERSION,
    title: str(r.title, base.title).slice(0, 120) || base.title,
    date: str(r.date, base.date).slice(0, 10),
    startTime: str(r.startTime, base.startTime).slice(0, 5),
    courseName: str(r.courseName).slice(0, 160),
    layoutName: str(r.layoutName).slice(0, 160),
    holes: Math.min(90, Math.max(1, Math.round(num(r.holes, 18)))),
    rounds: Math.min(6, Math.max(1, Math.round(num(r.rounds, 1)))),
    location: str(r.location).slice(0, 200),
    sanctioned: bool(r.sanctioned),
    tier: (["M", "ES", "A", "B", "C", "XA", "XB", "XC", "L"] as string[]).includes(String(r.tier))
      ? (r.tier as TierCode)
      : "",
    pdgaEventNumber: str(r.pdgaEventNumber).slice(0, 24),
    tdName: str(r.tdName).slice(0, 120),
    tdEmail: str(r.tdEmail).slice(0, 160),
    tdPhone: str(r.tdPhone).slice(0, 40),
    notes: str(r.notes).slice(0, 4000),
    agenda: sortNightAgenda(parseNightAgenda(r.agenda)),
    tasks: Array.isArray(r.tasks)
      ? (r.tasks as unknown[]).flatMap((x) => {
          if (!x || typeof x !== "object") return [];
          const t = x as Record<string, unknown>;
          const label = str(t.label).slice(0, 240);
          if (!label) return [];
          const phase = PHASE_ORDER.includes(t.phase as EventPhase) ? (t.phase as EventPhase) : "pre";
          const row: PlanTask = {
            id: str(t.id) || planId(),
            label,
            phase,
            done: bool(t.done),
            custom: bool(t.custom),
          };
          const owner = str(t.owner).slice(0, 80);
          return [owner ? { ...row, owner } : row];
        })
      : [],
    divisions: Array.isArray(r.divisions)
      ? (r.divisions as unknown[]).flatMap((x) => {
          if (!x || typeof x !== "object") return [];
          const d = x as Record<string, unknown>;
          return [
            {
              id: str(d.id) || planId(),
              name: str(d.name).slice(0, 80) || "Division",
              entryFeeCents: Math.max(0, Math.round(num(d.entryFeeCents, 0))),
              players: Math.max(0, Math.round(num(d.players, 0))),
            },
          ];
        })
      : [],
    money: {
      payoutPercent: Math.min(100, Math.max(0, Math.round(num((r.money as never)?.["payoutPercent"], 100)))),
      ctpPerPlayerCents: Math.max(0, Math.round(num((r.money as never)?.["ctpPerPlayerCents"], 0))),
      acePotPerPlayerCents: Math.max(0, Math.round(num((r.money as never)?.["acePotPerPlayerCents"], 0))),
      addedValueCents: Math.max(0, Math.round(num((r.money as never)?.["addedValueCents"], 0))),
      expensesCents: Math.max(0, Math.round(num((r.money as never)?.["expensesCents"], 0))),
      payoutKind: (["cash", "merch", "trophy_only"] as string[]).includes(
        String((r.money as never)?.["payoutKind"]),
      )
        ? ((r.money as never)["payoutKind"] as PlanMoney["payoutKind"])
        : "merch",
    },
    players: Array.isArray(r.players)
      ? (r.players as unknown[]).slice(0, 500).flatMap((x) => {
          if (!x || typeof x !== "object") return [];
          const p = x as Record<string, unknown>;
          const name = str(p.name).slice(0, 120);
          if (!name) return [];
          return [
            {
              id: str(p.id) || planId(),
              name,
              division: str(p.division).slice(0, 80),
              pdgaNumber: str(p.pdgaNumber).slice(0, 12),
              paid: bool(p.paid),
              checkedIn: bool(p.checkedIn),
              note: str(p.note).slice(0, 240),
            },
          ];
        })
      : [],
  };
  if (!plan.agenda.length) {
    plan.agenda = buildDefaultNightAgenda({
      startTime: plan.startTime,
      holes: plan.holes,
      rounds: plan.rounds,
    });
  }
  if (!plan.tasks.length) plan.tasks = syncTasks(plan, []);
  return plan;
}

/** Rebuilds the running order for the current start time, holes, and rounds. */
export function rebuildAgenda(plan: OpenPlan): NightItem[] {
  return buildDefaultNightAgenda({
    startTime: plan.startTime,
    holes: plan.holes,
    rounds: plan.rounds,
  });
}
