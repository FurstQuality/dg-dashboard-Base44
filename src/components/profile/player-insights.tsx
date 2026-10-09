import { Link } from "@tanstack/react-router";
import {
  Activity,
  Award,
  BadgeCheck,
  CalendarClock,
  Flame,
  Gauge,
  MapPin,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PlayerProfileData } from "@/lib/player-profile.functions";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const signed = (n: number, digits = 2) => `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;
const shortDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

function SectionCard({
  title,
  icon,
  meta,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <span className="shrink-0 text-primary">{icon}</span>
            <span className="min-w-0">{title}</span>
          </h3>
          {meta}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** PDGA membership + official rating detail. */
export function PdgaCard({ pdga }: { pdga: PlayerProfileData["pdga"] }) {
  if (!pdga) return null;
  const current = (pdga.membership_status ?? "").toLowerCase().includes("current");
  const delta = pdga.rating_delta;
  return (
    <SectionCard
      title="PDGA membership"
      icon={<BadgeCheck className="h-4 w-4" />}
      meta={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline">#{pdga.pdga_number}</Badge>
          <Badge variant={current ? "default" : "outline"}>
            {pdga.membership_status ?? "Membership not confirmed"}
          </Badge>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact
          label="Official rating"
          strong
          value={
            <span className="inline-flex items-baseline gap-1.5">
              {pdga.current_rating ?? "—"}
              {delta != null && delta !== 0 ? (
                <span
                  className={`text-xs font-semibold ${delta > 0 ? "text-emerald-500" : "text-rose-500"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              ) : null}
            </span>
          }
        />
        <Fact label="Class" value={pdga.player_class ?? pdga.classification ?? "—"} />
        <Fact label="Member since" value={pdga.member_since ?? "—"} />
        <Fact label="Career events" value={pdga.career_events ?? "—"} />
        <Fact label="Career wins" value={pdga.career_wins ?? "—"} />
        <Fact label="Rounds in rating" value={pdga.rounds_used ?? "—"} />
        <Fact label="Rated-round spread" value={pdga.std_dev != null ? `±${pdga.std_dev}` : "—"} />
        <Fact label="Rating updated" value={shortDate(pdga.last_changed) ?? "—"} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {pdga.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" />
            {pdga.location}
          </span>
        )}
        {pdga.next_update && (
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            Next PDGA update {shortDate(pdga.next_update)}
          </span>
        )}
        {pdga.official_status && (
          <span className="inline-flex items-center gap-1">
            <BadgeCheck className="h-3.5 w-3.5" />
            Certified official
            {pdga.official_expires ? ` through ${shortDate(pdga.official_expires)}` : ""}
          </span>
        )}
        {pdga.membership_expires && (
          <span>Membership through {shortDate(pdga.membership_expires)}</span>
        )}
      </div>
    </SectionCard>
  );
}

/** Birdie / par / bogey mix plus par-type breakdown. */
export function SkillSnapshot({ scoring }: { scoring: PlayerProfileData["scoring"] }) {
  if (!scoring) return null;
  const sourceLabel =
    scoring.source === "verified"
      ? "Verified PDGA holes"
      : scoring.source === "mixed"
        ? "PDGA + imported holes"
        : "Imported holes";

  const bars = [
    { label: "Birdie or better", value: scoring.birdie_rate, className: "bg-emerald-500" },
    { label: "Par", value: scoring.par_rate, className: "bg-muted-foreground/50" },
    { label: "Bogey or worse", value: scoring.bogey_rate, className: "bg-rose-500" },
  ];

  return (
    <SectionCard
      title="Scoring profile"
      icon={<Target className="h-4 w-4" />}
      meta={
        <Badge variant="outline">
          {scoring.holes.toLocaleString()} holes · {sourceLabel}
        </Badge>
      }
    >
      <div className="space-y-3">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{b.label}</span>
              <span className="font-semibold">{pct(b.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${b.className}`}
                style={{ width: `${Math.max(2, b.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Avg per hole" value={signed(scoring.avg_to_par_per_hole)} strong />
        <Fact label="Eagles" value={scoring.eagles} />
        <Fact label="Birdies" value={scoring.birdies} />
        <Fact label="Double+" value={scoring.doubles_plus} />
      </div>

      {scoring.byPar.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            How they score by hole type
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {scoring.byPar.map((b) => (
              <div key={b.par} className="rounded-lg border p-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>Par {b.par}</span>
                  <span
                    className={
                      b.avg_to_par < 0
                        ? "text-emerald-500"
                        : b.avg_to_par > 0
                          ? "text-rose-500"
                          : ""
                    }
                  >
                    {signed(b.avg_to_par)}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {pct(b.birdie_rate)} birdie rate · {b.holes} holes
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/** Recent rated-round trend with a lightweight sparkline. */
export function FormCard({
  form,
  highlights,
}: {
  form: PlayerProfileData["form"];
  highlights: PlayerProfileData["highlights"];
}) {
  const trend = form.trend;
  if (!trend.length && !highlights.best_round) return null;

  const values = trend.map((t) => t.rating);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const span = Math.max(1, max - min);
  const delta = form.delta;

  return (
    <SectionCard
      title="Current form"
      icon={<Activity className="h-4 w-4" />}
      meta={
        delta != null ? (
          <Badge variant={delta >= 0 ? "default" : "outline"} className="gap-1">
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta} vs prior 5
          </Badge>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Last 5 rounds" value={form.last5_avg ?? "—"} strong />
        <Fact label="Prior 5 rounds" value={form.prev5_avg ?? "—"} />
        <Fact label="Hottest 3-round run" value={highlights.hottest_stretch ?? "—"} />
        <Fact label="Courses played" value={highlights.courses_played} />
      </div>

      {trend.length > 1 && (
        <div className="mt-4">
          <div className="flex h-24 items-end gap-1 rounded-lg bg-muted/40 p-2">
            {trend.map((t, i) => {
              const h = 20 + ((t.rating - min) / span) * 80;
              return (
                <div
                  key={`${t.played_on}-${i}`}
                  className="group relative flex h-full flex-1 items-end"
                >
                  <div
                    className="w-full min-w-[2px] rounded-t bg-primary transition group-hover:bg-primary/80"
                    style={{ height: `${h}%` }}
                    title={`${t.rating} · ${t.label} · ${shortDate(t.played_on)}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{shortDate(trend[0].played_on)}</span>
              <span className="truncate">{shortDate(trend[trend.length - 1].played_on)}</span>
            </div>
            <div className="text-center">Round ratings, oldest to newest</div>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {highlights.best_round && (
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-primary" /> Best rated round
            </div>
            <div className="mt-1 text-lg font-bold">{highlights.best_round.rating}</div>
            <div className="text-xs text-muted-foreground">
              {highlights.best_round.event_name ?? highlights.best_round.course_name}
              {highlights.best_round.to_par != null &&
                ` · ${signed(highlights.best_round.to_par, 0)}`}
              {" · "}
              {shortDate(highlights.best_round.played_on)}
            </div>
          </div>
        )}
        {highlights.best_finish && (
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-primary" /> Best finish
            </div>
            <div className="mt-1 text-lg font-bold">
              #{highlights.best_finish.place}
              {highlights.best_finish.field_size ? (
                <span className="text-sm font-normal text-muted-foreground">
                  /{highlights.best_finish.field_size}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              {highlights.best_finish.event_name}
              {highlights.best_finish.division && ` · ${highlights.best_finish.division}`}
              {" · "}
              {shortDate(highlights.best_finish.played_on)}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

/** Divisions this player competes in. */
export function DivisionsCard({ divisions }: { divisions: PlayerProfileData["divisions"] }) {
  if (!divisions.length) return null;
  return (
    <SectionCard title="Divisions played" icon={<Award className="h-4 w-4" />}>
      <div className="divide-y rounded-lg border">
        {divisions.map((d) => (
          <div
            key={d.division}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{d.division}</Badge>
                <span className="text-sm text-muted-foreground">
                  {d.events} event{d.events === 1 ? "" : "s"}
                </span>
              </div>
              {d.last_played && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Last played {shortDate(d.last_played)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs">
              {d.wins > 0 && (
                <Badge className="gap-1">
                  <Trophy className="h-3 w-3" />
                  {d.wins} win{d.wins === 1 ? "" : "s"}
                </Badge>
              )}
              {d.podiums > 0 && (
                <span className="text-muted-foreground">
                  {d.podiums} podium{d.podiums === 1 ? "" : "s"}
                </span>
              )}
              {d.best_place != null && (
                <span className="text-muted-foreground">Best #{d.best_place}</span>
              )}
              {d.avg_rating != null && (
                <Badge variant="outline">
                  <Gauge className="mr-1 h-3 w-3" />
                  {d.avg_rating} avg
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

/** Upcoming tournaments and leagues this player is registered for. */
export function UpcomingEventsCard({
  upcoming,
  isSelf,
  displayName,
}: {
  upcoming: PlayerProfileData["upcoming"];
  isSelf: boolean;
  displayName: string;
}) {
  if (!upcoming.length) {
    return (
      <SectionCard title="Upcoming events" icon={<CalendarClock className="h-4 w-4" />}>
        <p className="text-sm text-muted-foreground">
          {isSelf
            ? "Nothing on the schedule yet. Register for a tournament or league and it shows up here."
            : `${displayName} hasn't registered for anything upcoming yet.`}
        </p>
        {isSelf && (
          <Link
            to="/events"
            className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
          >
            Browse events
          </Link>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Upcoming events"
      icon={<CalendarClock className="h-4 w-4" />}
      meta={<Badge variant="outline">{upcoming.length} scheduled</Badge>}
    >
      <div className="divide-y rounded-lg border">
        {upcoming.map((e, i) => (
          <div
            key={`${e.kind}-${e.slug}-${i}`}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{e.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {shortDate(e.start_date) ?? "Date TBD"}
                {e.location && ` · ${e.location}`}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="capitalize">
                {e.kind}
              </Badge>
              {e.division && <Badge variant="secondary">{e.division}</Badge>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Fact({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className={strong ? "text-xl font-bold" : "text-base font-semibold"}>{value}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
