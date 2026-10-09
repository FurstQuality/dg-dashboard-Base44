/**
 * People — one directory for everyone in disc golf: players, tournament
 * directors, volunteers and your own friends, each with a one-tap
 * "Add to tracker" so you can follow their results.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MapPin, Search, ShieldCheck, Target, UserPlus, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader } from "@/components/shell";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { useSession, initials } from "@/lib/current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { normalizeStateCode } from "@/lib/us-states";
import { PdgaPlayerSearchCard } from "@/components/tracker/pdga-player-search-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FriendsHub } from "@/components/community/friends-hub";
import { AddFriendButton } from "@/components/social/add-friend-button";
import { AddToTrackerButton } from "@/components/social/add-to-tracker-button";
import { PeopleYouMayKnow } from "@/components/social/people-you-may-know";
import { TrackersHub } from "@/components/community/trackers-hub";
import { listPeopleHighlights, type PersonHighlight } from "@/lib/people-highlights.functions";

type PersonRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  location: string | null;
  home_state: string | null;
  pdga_number: string | null;
  pdga_rating: number | null;
  is_event_director: boolean;
};

type GroupKey = "all" | "friends" | "directors" | "volunteers";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "all", label: "All players" },
  { key: "friends", label: "Friends" },
  { key: "directors", label: "Tournament directors" },
  { key: "volunteers", label: "Volunteers" },
];

const TABS = ["directory", "friends", "tracker"] as const;
type PeopleTab = (typeof TABS)[number];

const searchSchema = z.object({
  tab: z.string().max(20).optional(),
});

export const Route = createFileRoute("/_authenticated/people")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "People · DG Dashboard" },
      {
        name: "description",
        content:
          "Find players, tournament directors, volunteers and friends across disc golf, and add anyone to your tracker.",
      },
      { property: "og:title", content: "People · DG Dashboard" },
      {
        property: "og:description",
        content: "Players, tournament directors, volunteers and friends — all in one directory.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="People" />,
  component: PeoplePage,
});

function PeoplePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const raw = search.tab ?? "";
  const tab: PeopleTab = (TABS as readonly string[]).includes(raw)
    ? (raw as PeopleTab)
    : "directory";

  return (
    <PageShell>
      <PageHeader
        title="People"
        description="One place for everyone in disc golf — search the directory, manage your friends and crews, and follow any player's results."
        primaryAction={
          <Button
            size="sm"
            onClick={() =>
              void navigate({ to: "/people", search: { tab: "friends" }, replace: true })
            }
          >
            <UserPlus className="mr-1 h-4 w-4" /> Add a friend
          </Button>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          void navigate({ to: "/people", search: { tab: v as PeopleTab }, replace: true })
        }
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="directory" className="shrink-0 whitespace-nowrap">
            <Users className="mr-1.5 h-3.5 w-3.5" /> Directory
          </TabsTrigger>
          <TabsTrigger value="friends" className="shrink-0 whitespace-nowrap">
            <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Friends & crews
          </TabsTrigger>
          <TabsTrigger value="tracker" className="shrink-0 whitespace-nowrap">
            <Target className="mr-1.5 h-3.5 w-3.5" /> Player tracker
          </TabsTrigger>
        </TabsList>
        <TabsContent value="directory" className="mt-4 space-y-4">
          <PeopleYouMayKnow limit={6} />
          <PeopleDirectory />
        </TabsContent>
        <TabsContent value="friends" className="mt-4 space-y-4">
          <PeopleYouMayKnow limit={6} />
          <FriendsHub />
        </TabsContent>
        <TabsContent value="tracker" className="mt-4 space-y-4">
          <PdgaPlayerSearchCard />
          <TrackersHub variant="embedded" />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

const PAGE_SIZE = 40;

function PeopleDirectory() {
  const { user } = useSession();
  const [group, setGroup] = useState<GroupKey>("all");
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q.trim(), 300);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Reset paging whenever the list the player is looking at changes.
  useEffect(() => setVisible(PAGE_SIZE), [debouncedQ, group]);

  const friendIds = useQuery({
    queryKey: ["people", "friend-ids", user?.id],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("friendships")
        .select("requester_id, addressee_id, status")
        .eq("status", "accepted")
        .or(`requester_id.eq.${user!.id},addressee_id.eq.${user!.id}`)
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) =>
        r.requester_id === user!.id ? (r.addressee_id as string) : (r.requester_id as string),
      );
    },
  });

  const volunteerIds = useQuery({
    queryKey: ["people", "volunteer-ids"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("tournament_staff")
        .select("user_id, role")
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.user_id as string);
    },
  });

  const friendSet = useMemo(() => new Set(friendIds.data ?? []), [friendIds.data]);
  const volunteerSet = useMemo(() => new Set(volunteerIds.data ?? []), [volunteerIds.data]);

  // The group choice narrows the read server-side so the browser only receives
  // rows it can actually display.
  const idScope = useMemo<string[] | null>(() => {
    if (group === "friends") return friendIds.data ?? [];
    if (group === "volunteers") return Array.from(new Set(volunteerIds.data ?? []));
    return null;
  }, [group, friendIds.data, volunteerIds.data]);

  const scopeReady =
    group === "all" ||
    group === "directors" ||
    (group === "friends" ? !friendIds.isLoading : !volunteerIds.isLoading);

  const people = useQuery({
    queryKey: ["people", "directory", group, debouncedQ.toLowerCase(), idScope?.length ?? null],
    enabled: scopeReady,
    staleTime: 60_000,
    queryFn: async (): Promise<PersonRow[]> => {
      if (idScope && idScope.length === 0) return [];
      let query = supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url, location, home_state, pdga_number, pdga_rating, is_event_director",
        )
        .order("pdga_rating", { ascending: false, nullsFirst: false })
        .limit(200);
      if (group === "directors") query = query.eq("is_event_director", true);
      if (idScope) query = query.in("id", idScope);
      const term = debouncedQ;
      if (term) {
        const safe = term.replace(/[%,]/g, " ");
        query = query.or(
          `display_name.ilike.%${safe}%,username.ilike.%${safe}%,pdga_number.ilike.%${safe}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PersonRow[];
    },
  });

  // The player's own city and state, used to keep the directory local by default.
  const homeState = useQuery({
    queryKey: ["people", "home-place", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ state: string; city: string }> => {
      const { data } = await supabase
        .from("profiles")
        .select("home_state, location")
        .eq("id", user!.id)
        .maybeSingle();
      return {
        state:
          normalizeStateCode(data?.home_state ?? null) ??
          normalizeStateCode(data?.location ?? null) ??
          "",
        city: (data?.location ?? "").trim().toLowerCase(),
      };
    },
  });
  const homeStateCode = homeState.data?.state ?? "";
  const homeCity = homeState.data?.city ?? "";

  // Players in the clubs you belong to — the closest community the app knows.
  const clubMates = useQuery({
    queryKey: ["people", "club-mates", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data: mine } = await supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", user!.id);
      const clubIds = (mine ?? []).map((r) => r.club_id as string);
      if (!clubIds.length) return new Set<string>();
      const { data: mates } = await supabase
        .from("club_members")
        .select("user_id")
        .in("club_id", clubIds);
      return new Set((mates ?? []).map((r) => r.user_id as string));
    },
  });
  const clubMateIds = clubMates.data ?? new Set<string>();

  const allRows = useMemo(
    () => (people.data ?? []).filter((p) => p.id !== user?.id),
    [people.data, user?.id],
  );
  // Everyone stays in the list — the closest players simply come first:
  // your club mates, then your city, then your state.
  const rows = useMemo(() => {
    const proximity = (p: PersonRow) => {
      let rank = 0;
      if (clubMateIds.has(p.id)) rank += 4;
      if (homeCity && (p.location ?? "").trim().toLowerCase() === homeCity) rank += 2;
      if (
        homeStateCode &&
        (normalizeStateCode(p.home_state) === homeStateCode ||
          normalizeStateCode(p.location) === homeStateCode)
      )
        rank += 1;
      return rank;
    };
    if (!homeStateCode && !homeCity && clubMateIds.size === 0) return allRows;
    return [...allRows].sort((a, b) => proximity(b) - proximity(a));
  }, [allRows, homeStateCode, homeCity, clubMateIds]);
  const localCount = useMemo(
    () =>
      homeStateCode
        ? allRows.filter(
            (p) =>
              normalizeStateCode(p.home_state) === homeStateCode ||
              normalizeStateCode(p.location) === homeStateCode,
          ).length
        : 0,
    [allRows, homeStateCode],
  );
  const shown = useMemo(() => rows.slice(0, visible), [rows, visible]);

  // Ratings, achievements and goals for the rows on screen. The server applies
  // each player's own privacy choices before sending anything back.
  const fetchHighlights = useServerFn(listPeopleHighlights);
  const shownIds = useMemo(() => shown.map((p) => p.id), [shown]);
  const highlights = useQuery({
    queryKey: ["people", "highlights", shownIds],
    enabled: shownIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => fetchHighlights({ data: { userIds: shownIds } }),
  });
  const highlightMap = useMemo(() => {
    const map = new Map<string, PersonHighlight>();
    for (const row of highlights.data ?? []) map.set(row.userId, row);
    return map;
  }, [highlights.data]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => {
          const on = group === g.key;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              aria-pressed={on}
              className={`rounded-control border px-3.5 py-2 text-sm font-semibold transition ${
                on
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {homeStateCode && localCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          <MapPin className="mr-1 inline h-3.5 w-3.5" />
          {localCount} {localCount === 1 ? "player" : "players"} in {homeStateCode} listed first —
          everyone else follows below.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, username or PDGA number"
            className="pl-9"
            aria-label="Search people"
          />
        </div>
        {!people.isLoading && !people.isError ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {rows.length === 0
              ? "No matches"
              : `Showing ${shown.length} of ${rows.length} ${rows.length === 1 ? "person" : "people"}`}
          </p>
        ) : null}
      </div>

      {people.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : people.isError ? (
        <p className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground">
          We couldn't load the player list just now. Refresh the page to try again.
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-2 font-display text-lg font-semibold">Nobody here yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {group === "friends"
              ? "Add a few friends and they'll show up here."
              : group === "volunteers"
                ? "Volunteers appear once a director adds them to an event crew."
                : group === "directors"
                  ? "No tournament directors match that search yet."
                  : "Try a different name, or clear the search to see everyone."}
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {shown.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                isFriend={friendSet.has(p.id)}
                isVolunteer={volunteerSet.has(p.id)}
                highlight={highlightMap.get(p.id)}
              />
            ))}
          </div>
          {shown.length < rows.length ? (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show more people
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

function PersonCard({
  person,
  isFriend,
  isVolunteer,
  highlight,
}: {
  person: PersonRow;
  isFriend: boolean;
  isVolunteer: boolean;
  highlight?: PersonHighlight;
}) {
  const place = person.location ?? person.home_state ?? null;
  const pdgaNumber = highlight?.pdgaNumber ?? person.pdga_number;
  const pdgaRating = highlight?.pdgaRating ?? person.pdga_rating;
  const dgdRating = highlight?.dgdRating ?? null;
  const division = highlight?.division ?? null;
  const achievements = highlight?.achievements ?? null;
  const goalTitle = highlight?.goalTitle ?? null;
  const goalPct =
    goalTitle && highlight?.goalTarget
      ? Math.min(100, Math.round(((highlight.goalProgress ?? 0) / highlight.goalTarget) * 100))
      : null;

  return (
    <div className="flex flex-wrap items-start gap-4 p-4">
      <Avatar className="h-12 w-12">
        <AvatarImage src={person.avatar_url ?? undefined} alt={person.display_name} />
        <AvatarFallback>{initials(person.display_name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/players/$username"
            params={{ username: person.username }}
            className="truncate text-base font-semibold hover:text-primary"
          >
            {person.display_name}
          </Link>
          <span className="text-sm text-muted-foreground">@{person.username}</span>
          {person.is_event_director ? (
            <Badge variant="outline" className="gap-1 text-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> Tournament director
            </Badge>
          ) : null}
          {isFriend ? (
            <Badge variant="secondary" className="text-xs">
              Friend
            </Badge>
          ) : null}
          {isVolunteer && !person.is_event_director ? (
            <Badge variant="outline" className="text-xs">
              Event crew
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Metric
            label="PDGA"
            value={pdgaNumber ? `#${pdgaNumber}` : "Not linked"}
            muted={!pdgaNumber}
          />
          <Metric
            label="PDGA rating"
            value={pdgaRating ? String(pdgaRating) : "—"}
            muted={!pdgaRating}
          />
          <Metric
            label="DGD rating"
            value={dgdRating ? String(dgdRating) : "—"}
            muted={!dgdRating}
          />
          <Metric label="Division" value={division ?? "—"} muted={!division} />
          <Metric
            label="Achievements"
            value={achievements != null ? String(achievements) : "—"}
            muted={!achievements}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {place ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-4 w-4" /> {place}
            </span>
          ) : null}
          {goalTitle ? (
            <span className="inline-flex items-center gap-1">
              <Target className="h-4 w-4" /> Working on {goalTitle}
              {goalPct != null ? ` — ${goalPct}%` : ""}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AddFriendButton userId={person.id} name={person.display_name} isFriend={isFriend} />
        <AddToTrackerButton userId={person.id} name={person.display_name} />
        <Button asChild size="sm" variant="ghost">
          <Link to="/players/$username" params={{ username: person.username }}>
            Profile
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "font-semibold text-foreground"}>
        {value}
      </span>
    </span>
  );
}
