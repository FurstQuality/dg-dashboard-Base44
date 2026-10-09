import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Calendar,
  CalendarPlus,
  MapPin,
  Users,
  Plus,
  Recycle,
  HeartHandshake,
  Coffee,
  GraduationCap,
  CircleDot,
  Search,
  CheckCircle2,
  Navigation,
  Loader2,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { CommunityErrorState } from "@/components/community/community-error-state";
import { Badge } from "@/components/ui/badge";
import { EVENT_KIND_LABEL, EVENT_KIND_STYLE } from "@/lib/gamification-utils";
import { CommunityShell } from "@/components/community/community-shell";
import { EventsViewTabs } from "@/components/events/events-view-tabs";
import { SmartLink } from "@/components/statboard/smart-link";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { eventDraft } from "@/lib/share-to-feed";
import { downloadEventIcs } from "@/lib/community-ics";
import { getOutreachEvents } from "@/lib/community.functions";
import type { CommunityOutreachEvent } from "@/lib/community.functions";
import {
  COMMUNITY_STALE,
  communityKeys,
  type OutreachScope,
  type OutreachWhen,
} from "@/lib/community-queries";
import { useSession } from "@/lib/current-user";

const KIND_ICONS: Record<string, typeof Recycle> = {
  cleanup: Recycle,
  charity: HeartHandshake,
  group_round: CircleDot,
  meetup: Coffee,
  clinic: GraduationCap,
};

const TEMPLATES = [
  {
    kind: "cleanup",
    label: "Course cleanup",
    icon: Recycle,
    blurb: "Bring gloves & bags — leave the course better.",
  },
  {
    kind: "group_round",
    label: "Group round",
    icon: CircleDot,
    blurb: "Casual round with friends — pick a tee time and go.",
  },
  {
    kind: "clinic",
    label: "Clinic / lesson",
    icon: GraduationCap,
    blurb: "Teach a skill — forms, forehand, putting, mental game.",
  },
  {
    kind: "charity",
    label: "Charity event",
    icon: HeartHandshake,
    blurb: "Play for a cause — raise money for a local nonprofit.",
  },
  {
    kind: "meetup",
    label: "Meetup / hangout",
    icon: Coffee,
    blurb: "Coffee, cards, or watch party — no clubs required.",
  },
] as const;

/** Shared with the Play section so one location grant serves both. */
const COORD_KEY = "dgd.play.lastCoords";
const NEAR_RADIUS_MI = 100;

function loadCoords(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem(COORD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
    if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const OUTREACH_FILTER_KEY = "dgd:outreach:filters:v1";

type SavedOutreachFilters = {
  kind: string;
  when: OutreachWhen;
  scope: OutreachScope;
  q: string;
  nearMe: boolean;
};

const OUTREACH_FILTER_DEFAULTS: SavedOutreachFilters = {
  kind: "all",
  when: "upcoming",
  scope: "all",
  q: "",
  nearMe: false,
};

/** Filters come back the way the player left them, like the club directory. */
function readSavedOutreachFilters(): SavedOutreachFilters {
  if (typeof window === "undefined") return OUTREACH_FILTER_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(OUTREACH_FILTER_KEY);
    if (!raw) return OUTREACH_FILTER_DEFAULTS;
    return {
      ...OUTREACH_FILTER_DEFAULTS,
      ...(JSON.parse(raw) as Partial<SavedOutreachFilters>),
    };
  } catch {
    return OUTREACH_FILTER_DEFAULTS;
  }
}

export function OutreachEventsPanel() {
  const { user } = useSession();
  const fetchEvents = useServerFn(getOutreachEvents);

  const [seed] = useState<SavedOutreachFilters>(() => readSavedOutreachFilters());
  const [kind, setKind] = useState<string>(seed.kind);
  const [when, setWhen] = useState<OutreachWhen>(seed.when);
  const [scope, setScope] = useState<OutreachScope>(seed.scope);
  const [q, setQ] = useState(seed.q);
  const [debouncedQ, setDebouncedQ] = useState(seed.q);
  const [nearMe, setNearMe] = useState(seed.nearMe);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<CommunityOutreachEvent[]>([]);

  useEffect(() => {
    setCoords(loadCoords());
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Any filter change restarts paging.
  useEffect(() => {
    setPage(0);
    setRows([]);
  }, [kind, when, scope, debouncedQ, nearMe]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        OUTREACH_FILTER_KEY,
        JSON.stringify({ kind, when, scope, q: debouncedQ, nearMe }),
      );
    } catch {
      // Private browsing can refuse storage; filters just won't persist.
    }
  }, [kind, when, scope, debouncedQ, nearMe]);

  const origin = nearMe ? coords : null;

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: communityKeys.outreach(user?.id, { kind, when, scope, q: debouncedQ, nearMe, page }),
    enabled: !!user?.id,
    staleTime: COMMUNITY_STALE.medium,
    queryFn: () =>
      fetchEvents({
        data: { kind, when, scope, q: debouncedQ, page, origin, radiusMi: NEAR_RADIUS_MI },
      }),
  });

  // Accumulate pages so "Load more" appends instead of replacing.
  useEffect(() => {
    if (!data) return;
    setRows((prev) => {
      if (data.page === 0) return data.rows;
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...data.rows.filter((r) => !seen.has(r.id))];
    });
  }, [data]);

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        setNearMe(true);
        setLocating(false);
        try {
          localStorage.setItem(COORD_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
      },
      () => {
        setLocating(false);
        setGeoError("We couldn't get your location. You can still browse everything below.");
      },
      { timeout: 10_000 },
    );
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; events: CommunityOutreachEvent[] }>();
    for (const e of rows) {
      const key = dayKey(e.starts_at);
      const bucket = map.get(key);
      if (bucket) bucket.events.push(e);
      else map.set(key, { label: dayLabel(e.starts_at), events: [e] });
    }
    return [...map.values()];
  }, [rows]);

  const total = data?.total ?? 0;
  const hasMore = rows.length < total;
  const loading = isLoading && rows.length === 0;

  const clearFilters = () => {
    setKind("all");
    setWhen("upcoming");
    setScope("all");
    setQ("");
    setNearMe(false);
  };

  return (
    <CommunityShell
      title="Community events"
      description="Cleanups, clinics, charity rounds, meetups and group rounds near you."
    >
      <EventsViewTabs current="community" />

      <SmartLink
        to="/events"
        tone="statboard"
        variant="row"
        icon={Trophy}
        label="Looking for tournaments or leagues? Preview your odds in DG Statboard"
        hint="Every Disc Golf Dashboard, PDGA, UDisc, and Disc Golf Scene event — with Monte Carlo win probability."
      />

      {/* Search + timeframe */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search events by title, location, or cause"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Tabs value={when} onValueChange={(v) => setWhen(v as OutreachWhen)}>
          <TabsList>
            <TabsTrigger value="upcoming">All upcoming</TabsTrigger>
            <TabsTrigger value="week">This week</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
            <TabsTrigger value="past">Past</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={scope} onValueChange={(v) => setScope(v as OutreachScope)}>
          <TabsList>
            <TabsTrigger value="all">Discover</TabsTrigger>
            <TabsTrigger value="going">
              I'm going{" "}
              <Badge variant="secondary" className="ml-2">
                {data?.goingCount ?? 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="hosting">
              I'm hosting{" "}
              <Badge variant="secondary" className="ml-2">
                {data?.hostingCount ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {coords ? (
          <Button
            size="sm"
            variant={nearMe ? "default" : "outline"}
            onClick={() => setNearMe((v) => !v)}
          >
            <Navigation className="mr-1.5 h-3.5 w-3.5" />
            {nearMe ? `Within ${NEAR_RADIUS_MI} mi` : "Near me"}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={locate} disabled={locating}>
            {locating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Navigation className="mr-1.5 h-3.5 w-3.5" />
            )}
            Use my location
          </Button>
        )}
      </div>

      <Tabs value={kind} onValueChange={setKind}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="all">All kinds</TabsTrigger>
          <TabsTrigger value="cleanup">Cleanups</TabsTrigger>
          <TabsTrigger value="group_round">Group rounds</TabsTrigger>
          <TabsTrigger value="clinic">Clinics</TabsTrigger>
          <TabsTrigger value="charity">Charity</TabsTrigger>
          <TabsTrigger value="meetup">Meetups</TabsTrigger>
        </TabsList>
      </Tabs>

      {geoError ? <p className="text-xs text-muted-foreground">{geoError}</p> : null}

      {isError && rows.length === 0 ? (
        <CommunityErrorState
          title="We couldn't load outreach events"
          message="The event list didn't come through. Try again in a moment."
          onRetry={() => void refetch()}
        />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Calendar className="h-6 w-6" />
          </div>
          <div className="mt-3 font-semibold">
            {scope === "going"
              ? "You haven't RSVP'd to anything yet"
              : scope === "hosting"
                ? "You're not hosting an outreach event yet"
                : nearMe
                  ? `Nothing scheduled within ${NEAR_RADIUS_MI} miles`
                  : "No events match these filters"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {scope === "hosting"
              ? "Events you organize are managed in Event Manager."
              : "Try clearing filters or widening the date range."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label} className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{g.label}</h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.events.map((e) => (
                  <EventCard key={e.id} ev={e} />
                ))}
              </div>
            </section>
          ))}

          <div className="flex items-center justify-center gap-3 pt-2">
            {hasMore ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
              >
                {isFetching ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Load more
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">
              Showing {rows.length} of {total} event{total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </CommunityShell>
  );
}

function EventCard({ ev }: { ev: CommunityOutreachEvent }) {
  const Icon = KIND_ICONS[ev.kind] ?? CircleDot;
  const starts = new Date(ev.starts_at);
  const spotsLeft =
    ev.capacity && ev.capacity > 0 ? Math.max(0, ev.capacity - ev.goingCount) : null;

  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card transition hover:border-primary/40 hover:shadow-md">
      <Link to="/community/$eventId" params={{ eventId: ev.id }} className="block">
        {ev.cover_url ? (
          <div
            className="h-32 bg-cover bg-center"
            style={{ backgroundImage: `url(${ev.cover_url})` }}
          />
        ) : (
          <div className="h-32 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent" />
        )}
        <div className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase " +
                (EVENT_KIND_STYLE[ev.kind] ?? "")
              }
            >
              <Icon className="h-3 w-3" /> {EVENT_KIND_LABEL[ev.kind] ?? ev.kind}
            </span>
            <span className="text-xs text-muted-foreground">
              {starts.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ·{" "}
              {starts.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
            </span>
            {ev.isHost ? (
              <Badge variant="outline" className="ml-auto">
                Hosting
              </Badge>
            ) : ev.myRsvp === "going" ? (
              <Badge className="ml-auto gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Going
              </Badge>
            ) : ev.myRsvp === "maybe" ? (
              <Badge variant="secondary" className="ml-auto">
                Maybe
              </Badge>
            ) : null}
          </div>
          <h3 className="mt-2 font-semibold group-hover:text-primary">{ev.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {ev.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {ev.location}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> {ev.goingCount} going
              {ev.capacity ? ` / ${ev.capacity}` : ""}
            </span>
            {ev.distanceMi !== null ? <span>· {ev.distanceMi} mi away</span> : null}
            {ev.cause ? <span>· For {ev.cause}</span> : null}
          </div>
          {ev.full ? (
            <div className="mt-2 text-xs font-medium text-amber-500">
              At capacity — the host can add you to the waitlist.
            </div>
          ) : spotsLeft !== null && spotsLeft <= 5 ? (
            <div className="mt-2 text-xs font-medium text-amber-500">
              Only {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left.
            </div>
          ) : null}
          {ev.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{ev.description}</p>
          ) : null}
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            downloadEventIcs({
              id: ev.id,
              title: ev.title,
              description: ev.description,
              location: ev.location,
              starts_at: ev.starts_at,
              ends_at: ev.ends_at,
            })
          }
        >
          <CalendarPlus className="mr-1.5 h-3.5 w-3.5" /> Add to calendar
        </Button>
        <ShareToFeedButton
          variant="ghost"
          label="Share"
          draft={() =>
            eventDraft({
              id: ev.id,
              title: ev.title,
              kind: ev.kind,
              location: ev.location,
              starts_at: ev.starts_at,
            })
          }
        />
      </div>
    </article>
  );
}
