/**
 * "Your events" + "Local scene" strip for the events library.
 *
 * Two jobs the browse grid can't do:
 *  - Always show what the player is actually signed up for (tournament
 *    registrations, league sign-ups, community RSVPs), regardless of the
 *    filters currently applied to the library below.
 *  - Say plainly how "near you" was worked out, how many local events that
 *    leaves, and offer to host one when the local calendar is thin.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/current-user";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Crosshair, MapPin, Plus, Trophy, Users } from "lucide-react";
import { fmtDate } from "./events-types";

type SignupKind = "tournament" | "league" | "community";

interface SignupRow {
  key: string;
  kind: SignupKind;
  title: string;
  date: string | null;
  status: string | null;
  to: string;
  params?: Record<string, string>;
}

const KIND_ICON = {
  tournament: Trophy,
  league: CalendarCheck,
  community: Users,
} as const;

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Registered",
  checked_in: "Checked in",
  waitlist: "Waitlisted",
  pending: "Pending",
  going: "Going",
  maybe: "Maybe",
};

/** Every event the signed-in player has committed to, soonest first. */
function useMySignups() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["events-library", "my-signups", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<SignupRow[]> => {
      const uid = user!.id;
      const today = new Date().toISOString().slice(0, 10);

      const [tourneys, leagues, rsvps] = await Promise.all([
        supabase
          .from("tournament_registrations")
          .select("id, status, tournaments!inner(name, slug, start_date, end_date)")
          .eq("user_id", uid)
          .in("status", ["confirmed", "waitlist", "checked_in", "pending"])
          .limit(20),
        supabase
          .from("league_registrations")
          .select("id, status, leagues!inner(name, slug, start_date, end_date)")
          .eq("user_id", uid)
          .limit(20),
        supabase
          .from("event_rsvps")
          .select("event_id, status, community_events!inner(id, title, starts_at)")
          .eq("user_id", uid)
          .in("status", ["going", "maybe"])
          .limit(20),
      ]);

      const rows: SignupRow[] = [];

      for (const r of (tourneys.data ?? []) as Array<{
        id: string;
        status: string | null;
        tournaments: {
          name: string;
          slug: string;
          start_date: string | null;
          end_date: string | null;
        };
      }>) {
        const end = r.tournaments.end_date ?? r.tournaments.start_date;
        if (end && end < today) continue;
        rows.push({
          key: `t-${r.id}`,
          kind: "tournament",
          title: r.tournaments.name,
          date: r.tournaments.start_date,
          status: r.status,
          to: "/tournaments/$slug",
          params: { slug: r.tournaments.slug },
        });
      }

      for (const r of (leagues.data ?? []) as Array<{
        id: string;
        status: string | null;
        leagues: { name: string; slug: string; start_date: string | null; end_date: string | null };
      }>) {
        const end = r.leagues.end_date ?? r.leagues.start_date;
        if (end && end < today) continue;
        rows.push({
          key: `l-${r.id}`,
          kind: "league",
          title: r.leagues.name,
          date: r.leagues.start_date,
          status: r.status,
          to: "/leagues/$slug",
          params: { slug: r.leagues.slug },
        });
      }

      for (const r of (rsvps.data ?? []) as Array<{
        event_id: string;
        status: string | null;
        community_events: { id: string; title: string; starts_at: string | null };
      }>) {
        const start = r.community_events.starts_at?.slice(0, 10) ?? null;
        if (start && start < today) continue;
        rows.push({
          key: `c-${r.event_id}`,
          kind: "community",
          title: r.community_events.title,
          date: start,
          status: r.status,
          to: "/community/$eventId",
          params: { eventId: r.community_events.id },
        });
      }

      return rows.sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999")).slice(0, 8);
    },
  });
}

export function MyEventsStrip() {
  const { data, isLoading } = useMySignups();
  const signups = data ?? [];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Your sign-ups — never filtered out by the library controls. */}
      <section className="rounded-card border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">You're signed up for</h2>
          <Link to="/schedule" className="text-xs font-semibold text-primary hover:underline">
            Full schedule
          </Link>
        </div>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : signups.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing on your card yet. Register for a tournament or join a league night below and it
            will show up here, filters or not.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {signups.map((r) => {
              const Icon = KIND_ICON[r.kind];
              return (
                <li key={r.key}>
                  <Link
                    to={r.to as never}
                    params={(r.params ?? {}) as never}
                    className="flex items-center gap-2 rounded-control border border-border/60 px-2.5 py-2 text-[13px] transition hover:border-primary/60"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {r.date ? fmtDate(r.date) : "Date TBD"}
                    </span>
                    {r.status ? (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
