import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import {
  CloudSun,
  DollarSign,
  Gift,
  ListChecks,
  Printer,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";

type Counts = { total: number; checkedIn: number; withdrawn: number; unpaid: number; waitlist: number };

export type EventDayInfo = {
  id: string;
  slug: string;
  name: string;
  isLiveToday: boolean;
  daysOut: number | null;
  registrations: Counts;
};

/**
 * Event Day home for a director: the numbers that matter at the course and
 * large one-tap actions into the existing tools. Phone-first; on wide screens
 * it becomes a compact strip.
 */
export function EventDayPanel({
  event,
  onOpenFinance,
}: {
  event: EventDayInfo;
  onOpenFinance: () => void;
}) {
  const r = event.registrations;
  const active = r.total - r.withdrawn - r.waitlist;
  const pct = active > 0 ? Math.round((r.checkedIn / active) * 100) : 0;
  const when = event.isLiveToday
    ? "Event day"
    : event.daysOut != null && event.daysOut > 0
      ? `In ${event.daysOut} day${event.daysOut === 1 ? "" : "s"}`
      : "Finished";

  return (
    <section aria-label="Event day" className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide " +
              (event.isLiveToday ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
            }
          >
            {event.isLiveToday ? <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none" /> : null}
            {when}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Registered" value={active} />
          <Stat label="Checked in" value={r.checkedIn} />
          <Stat label="Unpaid" value={r.unpaid} tone={r.unpaid > 0 ? "warn" : undefined} />
        </div>
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Checked in">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[13px] text-muted-foreground">
            {active === 0
              ? "No one has signed up yet."
              : r.checkedIn >= active
                ? "Everyone is checked in."
                : `${active - r.checkedIn} still to check in.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Action primary icon={UserCheck} label="Scan players in">
          {(cls, body) => (
            <Link to="/director/check-in" search={{ kind: "tournament", id: event.id, scan: true }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={UserPlus} label="Walk-up sign-up">
          {(cls, body) => (
            <Link to="/director/registrations" search={{ event: event.id }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={Users} label="Players & payments">
          {(cls, body) => (
            <Link to="/director/registrations" search={{ event: event.id }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={Trophy} label="Leaderboard">
          {(cls, body) => (
            <Link to="/tournaments/$slug" params={{ slug: event.slug }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={ListChecks} label="Staff & tasks">
          {(cls, body) => (
            <Link to="/director/ops" search={{ event: event.id }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={Printer} label="Cards & signs">
          {(cls, body) => (
            <Link to="/director/kit" search={{ event: event.id }} className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={CloudSun} label="Weather">
          {(cls, body) => (
            <Link to="/weather" className={cls}>
              {body}
            </Link>
          )}
        </Action>
        <Action icon={DollarSign} label="Payouts">
          {(cls, body) => (
            <button type="button" onClick={onOpenFinance} className={cls}>
              {body}
            </button>
          )}
        </Action>
        <Action icon={Gift} label="Prizes & pots">
          {(cls, body) => (
            <button type="button" onClick={onOpenFinance} className={cls}>
              {body}
            </button>
          )}
        </Action>
      </div>
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3 ring-1 ring-border/50">
      <div className={"font-display text-2xl font-black tabular-nums leading-none " + (tone === "warn" ? "text-amber-500" : "")}>
        {value}
      </div>
      <div className="mt-1 text-[13px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  primary,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  primary?: boolean;
  children: (cls: string, body: ReactNode) => ReactNode;
}) {
  const cls =
    "flex min-h-[72px] flex-col items-start justify-between gap-2 rounded-2xl p-3 text-left text-[14px] font-semibold transition duration-150 active:scale-[0.97] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    (primary
      ? "col-span-2 bg-primary text-primary-foreground sm:col-span-1"
      : "bg-card ring-1 ring-border/50 hover:ring-primary/40");
  return (
    <>
      {children(
        cls,
        <>
          <Icon className="h-5 w-5" />
          <span>{label}</span>
        </>,
      )}
    </>
  );
}
