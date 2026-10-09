import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CalendarClock, CheckCircle2, CircleDollarSign, MapPin, Trophy, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventAlertsBanner } from "@/components/events/event-alerts";
import { PlayerPassCard } from "@/components/events/player-pass";

export const Route = createFileRoute("/_authenticated/my-event/$slug")({
  head: () => ({
    meta: [
      { title: "My event · DG Dashboard | Ace" },
      { name: "description", content: "Your division, check-in, tee time, course and live updates for this event." },
      { property: "og:title", content: "My event · DG Dashboard | Ace" },
      { property: "og:description", content: "Your division, check-in, tee time and live event updates in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyEventPage,
});

type T = { id: string; name: string; slug: string; start_date: string | null; location: string | null };
type Reg = { id: string; status: string; payment_status: string; checked_in_at: string | null; division_id: string | null };
type Round = { id: string; round_number: number; starts_at: string | null; course_id: string | null };

function MyEventPage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const [t, setT] = useState<T | null>(null);
  const [reg, setReg] = useState<Reg | null>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [courses, setCourses] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: tt } = await supabase
        .from("tournaments")
        .select("id, name, slug, start_date, location")
        .eq("slug", slug)
        .maybeSingle();
      setT(tt as T | null);
      if (!tt) return setLoading(false);
      const [{ data: r }, { data: rs }] = await Promise.all([
        supabase
          .from("tournament_registrations")
          .select("id, status, payment_status, checked_in_at, division_id")
          .eq("tournament_id", tt.id)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.from("tournament_rounds").select("id, round_number, starts_at, course_id").eq("tournament_id", tt.id).order("round_number"),
      ]);
      setReg(r as Reg | null);
      setRounds((rs as Round[]) ?? []);
      if (r?.division_id) {
        const { data: d } = await supabase.from("tournament_divisions").select("code, name").eq("id", r.division_id).maybeSingle();
        setDivision(d ? `${d.code}${d.name ? ` · ${d.name}` : ""}` : null);
      }
      const cids = [...new Set((rs ?? []).map((x: any) => x.course_id).filter(Boolean))] as string[];
      if (cids.length) {
        const { data: cs } = await supabase.from("courses").select("id, name").in("id", cids);
        setCourses(new Map((cs ?? []).map((c) => [c.id, c.name])));
      }
      setLoading(false);
    })();
  }, [slug, user]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading your event…</div>;
  if (!t) return <div className="p-6 text-sm">We couldn't find that event.</div>;

  const now = Date.now();
  const next = rounds.find((r) => r.starts_at && new Date(r.starts_at).getTime() > now - 3 * 3600_000) ?? rounds[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/tournaments/$slug" params={{ slug }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Event page
        </Link>
      </Button>
      <header>
        <h1 className="font-display text-2xl">{t.name}</h1>
        <p className="text-sm text-muted-foreground">Everything you need for today, in one place.</p>
      </header>

      <EventAlertsBanner tournamentId={t.id} />

      {!reg ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm">You're not signed up for this event yet.</p>
          <Button asChild className="mt-3">
            <Link to="/tournaments/$slug" params={{ slug }}>See registration</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Stat icon={Trophy} label="Division" value={division ?? "Not set"} />
          <Stat
            icon={CheckCircle2}
            label="Check-in"
            value={reg.checked_in_at ? "Checked in" : "Not yet"}
            good={!!reg.checked_in_at}
          />
          <Stat
            icon={CircleDollarSign}
            label="Payment"
            value={reg.payment_status === "paid" ? "Paid" : reg.payment_status === "waived" ? "Waived" : reg.payment_status === "refunded" ? "Refunded" : "Unpaid"}
            good={reg.payment_status === "paid" || reg.payment_status === "waived"}
          />
          <Stat icon={CalendarClock} label="Status" value={reg.status.replace(/_/g, " ")} />
        </div>
      )}

      {next ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Next round</div>
          <div className="mt-1 text-lg font-semibold">Round {next.round_number}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-4 w-4" />
              {next.starts_at ? new Date(next.starts_at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Time TBD"}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {next.course_id ? (courses.get(next.course_id) ?? "Course") : "Course TBD"}
            </span>
          </div>
        </div>
      ) : null}

      {reg && !reg.checked_in_at ? <PlayerPassCard compact /> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" className="h-12">
          <Link to="/tournaments/$slug" params={{ slug }} search={{ tab: "leaderboard" }}>
            <Trophy className="mr-2 h-4 w-4" /> Leaderboard
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/tournaments/$slug" params={{ slug }} search={{ tab: "caddy" }}>
            <BookOpen className="mr-2 h-4 w-4" /> Caddy guide
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, good }: { icon: typeof Trophy; label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 flex items-center gap-2 text-base font-semibold capitalize">
        {value}
        {good ? <Badge variant="outline" className="border-primary/40 text-primary">OK</Badge> : null}
      </div>
    </div>
  );
}
