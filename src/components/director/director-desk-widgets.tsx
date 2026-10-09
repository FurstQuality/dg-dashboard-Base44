import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, CheckCircle2, DollarSign, Printer } from "lucide-react";
import { ContentCard } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  getDirectorCockpit,
  getDirectorChecklist,
  getDirectorStaff,
  getEventKit,
} from "@/lib/director.functions";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import type { DirectorEvent } from "@/lib/director-alerts";
import { money } from "@/lib/director-kit";

const ROLE_LABEL: Record<string, string> = {
  co_td: "Co-TD",
  scorekeeper: "Scorekeeper",
  volunteer: "Volunteer",
  spotter: "Spotter",
  media: "Media",
};

const dayLabel = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function pct(done: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/**
 * The three event desks — registrations, event kit, staff & prep — condensed
 * onto the Director overview and filtered by a single event picker. Every
 * number comes from the same authenticated cockpit read the desks use.
 */
export function DirectorDeskWidgets({ userId }: { userId: string | null | undefined }) {
  const fetchCockpit = useServerFn(getDirectorCockpit);
  const cockpit = useQuery({
    queryKey: directorKeys.cockpit(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchCockpit(),
  });

  const events = cockpit.data?.events ?? [];
  const [eventId, setEventId] = useState<string | null>(null);
  const selected: DirectorEvent | null = useMemo(
    () => events.find((e) => e.id === eventId) ?? events[0] ?? null,
    [events, eventId],
  );

  if (cockpit.isPending) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    );
  }

  // The cockpit above already shows the "no events yet" prompt — don't repeat it.
  if (!selected) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Event desks</span>
        <Select value={selected.id} onValueChange={setEventId}>
          <SelectTrigger className="h-9 w-full max-w-sm">
            <SelectValue placeholder="Pick an event" />
          </SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name} · {dayLabel(e.startDate)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">
          {selected.pdgaSanctioned ? "PDGA sanctioned" : "Unsanctioned"}
        </Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RegistrationsWidget event={selected} />
        <KitWidget event={selected} />
        <StaffPrepWidget event={selected} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function RegistrationsWidget({ event }: { event: DirectorEvent }) {
  const r = event.registrations;
  const capacity = event.maxPlayers ?? null;
  return (
    <ContentCard
      title="Registrations"
      subtitle={event.name}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/director/registrations" search={{ event: event.id }}>
            Open desk <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-2xl font-bold tabular-nums">{r.confirmed + r.checkedIn}</div>
            <div className="text-[13px] text-muted-foreground">
              {capacity ? `of ${capacity} spots filled` : "players in the field"}
            </div>
          </div>
          <div className="text-right">
            <div className="inline-flex items-center gap-1 text-sm font-semibold">
              <DollarSign className="h-3.5 w-3.5 text-success" />
              {money(event.feesCollectedCents)}
            </div>
            <div className="text-[13px] text-muted-foreground">
              {money(event.feesOutstandingCents)} outstanding
            </div>
          </div>
        </div>
        {capacity ? <Progress value={pct(r.confirmed + r.checkedIn, capacity)} /> : null}
        <div>
          <Row label="Pending approval" value={r.pending} />
          <Row label="Waitlist" value={r.waitlist} />
          <Row label="Checked in" value={r.checkedIn} />
          <Row label="Unpaid entries" value={r.unpaid} />
        </div>
      </div>
    </ContentCard>
  );
}

function KitWidget({ event }: { event: DirectorEvent }) {
  const fetchKit = useServerFn(getEventKit);
  const { data, isPending, isError } = useQuery({
    queryKey: directorKeys.kit(event.id),
    staleTime: DIRECTOR_STALE.long,
    queryFn: () => fetchKit({ data: { tournamentId: event.id } }),
  });

  return (
    <ContentCard
      title="Event kit"
      subtitle="Tee signs, caddy guide, player pack"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/director/kit" search={{ event: event.id }}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print
          </Link>
        </Button>
      }
    >
      {isPending ? (
        <Skeleton className="h-28 w-full rounded-control" />
      ) : isError || !data ? (
        <p className="text-[13px] text-muted-foreground">
          The kit source data didn't load. Open the kit desk to try again.
        </p>
      ) : (
        <div className="space-y-2">
          <Row label="Layouts mapped" value={data.layouts.length} />
          <Row
            label="Holes with pars"
            value={data.layouts.reduce((n, l) => n + l.holes.filter((h) => h.par > 0).length, 0)}
          />
          <Row label="Divisions" value={data.divisions.length} />
          <Row label="Rounds scheduled" value={data.rounds.length} />
          {data.warnings.length === 0 ? (
            <p className="inline-flex items-center gap-1.5 pt-1 text-[13px] text-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> Everything the kit prints is filled in.
            </p>
          ) : (
            <ul className="space-y-1 pt-1">
              {data.warnings.slice(0, 3).map((w) => (
                <li key={w} className="flex items-start gap-1.5 text-[13px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </ContentCard>
  );
}

function StaffPrepWidget({ event }: { event: DirectorEvent }) {
  const fetchStaff = useServerFn(getDirectorStaff);
  const fetchChecklist = useServerFn(getDirectorChecklist);
  const staffQuery = useQuery({
    queryKey: directorKeys.staff(event.id),
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchStaff({ data: { tournamentId: event.id } }),
  });
  const checklistQuery = useQuery({
    queryKey: directorKeys.checklist(event.id),
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchChecklist({ data: { tournamentId: event.id } }),
  });

  const staff = staffQuery.data ?? [];
  const items = checklistQuery.data ?? [];
  const done = items.filter((i) => i.done).length;
  const nextUp = items.filter((i) => !i.done).slice(0, 3);

  return (
    <ContentCard
      title="Staff & prep"
      subtitle="Crew and the run-up checklist"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/director/ops" search={{ event: event.id }}>
            Open desk <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      {staffQuery.isPending || checklistQuery.isPending ? (
        <Skeleton className="h-28 w-full rounded-control" />
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Prep checklist</span>
              <span className="font-semibold tabular-nums">
                {done}/{items.length || 0} done
              </span>
            </div>
            <Progress value={pct(done, items.length)} />
          </div>

          {nextUp.length > 0 ? (
            <ul className="space-y-1">
              {nextUp.map((i) => (
                <li key={i.id} className="text-[13px] text-muted-foreground">
                  • {i.label}
                </li>
              ))}
            </ul>
          ) : items.length > 0 ? (
            <p className="text-[13px] text-success">Prep is clear — you're ready for event day.</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No prep tasks yet. Seed the PDGA template from the Staff & prep desk.
            </p>
          )}

          <div className="border-t border-border/50 pt-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Crew</span>
              <span className="font-semibold tabular-nums">{staff.length}</span>
            </div>
            {staff.length > 0 ? (
              <ul className="mt-1.5 space-y-1.5">
                {staff.slice(0, 3).map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={s.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback>{s.displayName.slice(0, 1)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{s.displayName}</span>
                    <Badge variant="outline">{ROLE_LABEL[s.role] ?? s.role}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[13px] text-muted-foreground">
                No crew assigned yet — add a co-TD or scorekeeper before event day.
              </p>
            )}
          </div>
        </div>
      )}
    </ContentCard>
  );
}
