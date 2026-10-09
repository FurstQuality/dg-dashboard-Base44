import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus,
  Users,
  MapPin,
  Crown,
  Shield,
  Compass,
  Search,
  ExternalLink,
  HeartHandshake as HeartHandshakeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import { toast } from "sonner";
import { DropLinkPrompt } from "@/components/drop-link-prompt";
import { scrapeClubUrl, saveIngestedClub } from "@/lib/data-connectors.functions";
import { EmptyState } from "@/components/ui/empty-state";
import { importSceneClub } from "@/lib/scene-import.functions";
import { CommunityShell } from "@/components/community/community-shell";
import {
  getClubDirectory,
  joinClub as joinClubFn,
  leaveClub as leaveClubFn,
  createClub as createClubFn,
  type ClubScope,
  type ClubSort,
  type ClubSummary,
} from "@/lib/clubs.functions";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";

export const Route = createFileRoute("/_authenticated/clubs/")({
  head: () => ({
    meta: [
      { title: "Clubs · DG Dashboard" },
      {
        name: "description",
        content: "Discover, join, and manage disc golf clubs on DG Dashboard.",
      },
      { property: "og:title", content: "Clubs · DG Dashboard" },
      {
        property: "og:description",
        content: "Discover, join, and manage disc golf clubs on DG Dashboard.",
      },
    ],
  }),
  component: ClubsPage,
});

type Club = ClubSummary;
type MyMembership = { club_id: string; role: "owner" | "admin" | "member" };

const RADIUS_VALUES = ["any", "10", "25", "50", "100", "250", "500"] as const;
const FILTER_STORAGE_KEY = "dgd:clubs:filters:v1";

type SavedClubFilters = {
  q: string;
  city: string;
  state: string;
  radius: string;
  sort: ClubSort;
  origin: { lat: number; lng: number } | null;
};

const CLUB_FILTER_DEFAULTS: SavedClubFilters = {
  q: "",
  city: "",
  state: "all",
  radius: "100",
  sort: "suggested",
  origin: null,
};

function readSavedClubFilters(): SavedClubFilters {
  if (typeof window === "undefined") return CLUB_FILTER_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return CLUB_FILTER_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<SavedClubFilters>;
    return { ...CLUB_FILTER_DEFAULTS, ...parsed };
  } catch {
    return CLUB_FILTER_DEFAULTS;
  }
}

function ClubsPage() {
  const { user } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [seed] = useState<SavedClubFilters>(() => readSavedClubFilters());
  const [q, setQ] = useState(seed.q);
  const [debouncedQ, setDebouncedQ] = useState(seed.q);
  const [city, setCity] = useState(seed.city);
  const [debouncedCity, setDebouncedCity] = useState(seed.city);
  const [stateFilter, setStateFilter] = useState(seed.state);
  const [radius, setRadius] = useState(seed.radius);
  const [sort, setSort] = useState<ClubSort>(seed.sort);
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(seed.origin);
  const [locating, setLocating] = useState(false);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<ClubScope | "contribute">("mine");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingLink, setPendingLink] = useState<{ url: string; source: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setDebouncedCity(city.trim());
      setPage(0);
    }, 250);
    return () => clearTimeout(t);
  }, [q, city]);

  // Persist the filter set so the directory reopens exactly where you left it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({ q, city, state: stateFilter, radius, sort, origin } as SavedClubFilters),
      );
    } catch {
      /* storage unavailable — filters just won't persist */
    }
  }, [q, city, stateFilter, radius, sort, origin]);

  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Your browser can't share a location for distance filtering.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        setPage(0);
      },
      () => {
        setLocating(false);
        toast.error("We couldn't get your location. Filter by city or state instead.");
      },
      { timeout: 8000 },
    );
  }, []);

  // Distance filtering needs a position; ask for it once when a radius is set.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current || origin || radius === "any") return;
    askedRef.current = true;
    requestLocation();
  }, [origin, radius, requestLocation]);

  const radiusMiles = radius === "any" ? null : Number(radius);
  const scope: ClubScope = tab === "contribute" ? "mine" : tab;
  const filters = {
    scope,
    q: debouncedQ,
    page,
    city: debouncedCity,
    state: stateFilter === "all" ? "" : stateFilter,
    radiusMiles: origin ? radiusMiles : null,
    lat: origin?.lat ?? null,
    lng: origin?.lng ?? null,
    sort,
  };
  const fetchDirectory = useServerFn(getClubDirectory);
  const dirQuery = useQuery({
    queryKey: communityKeys.clubDirectory(user?.id, filters),
    enabled: !!user,
    staleTime: COMMUNITY_STALE.medium,
    queryFn: () => fetchDirectory({ data: filters }),
  });

  const clubs = dirQuery.data?.clubs ?? [];
  const counts = dirQuery.data?.counts ?? { mine: 0, managed: 0, discover: 0 };
  const hasMore = dirQuery.data?.hasMore ?? false;
  const states = dirQuery.data?.states ?? [];
  const suggestions = dirQuery.data?.suggestions ?? [];
  const total = dirQuery.data?.total ?? clubs.length;
  const loading = dirQuery.isPending && !!user;

  const filtersActive =
    debouncedQ !== "" ||
    debouncedCity !== "" ||
    stateFilter !== "all" ||
    radius !== CLUB_FILTER_DEFAULTS.radius ||
    sort !== CLUB_FILTER_DEFAULTS.sort;

  function resetFilters() {
    setQ("");
    setCity("");
    setStateFilter("all");
    setRadius(CLUB_FILTER_DEFAULTS.radius);
    setSort(CLUB_FILTER_DEFAULTS.sort);
    setPage(0);
  }

  const join = useServerFn(joinClubFn);
  const leave = useServerFn(leaveClubFn);
  const create = useServerFn(createClubFn);

  function reload() {
    void queryClient.invalidateQueries({ queryKey: ["club-directory"] });
  }

  async function joinClub(club: Club) {
    try {
      const res = await join({ data: { clubId: club.id } });
      toast.success(
        res.kind === "already_member" ? `You're already in ${club.name}` : `Joined ${club.name}`,
      );
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join that club");
    }
  }

  async function leaveClub(club: Club) {
    try {
      await leave({ data: { clubId: club.id } });
      toast.success(`Left ${club.name}`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't leave that club");
    }
  }

  async function createClub(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      let slug: string;
      if (pendingLink) {
        const saved = await saveIngestedClub({
          data: {
            name: name.trim(),
            description: description.trim() || null,
            location: location.trim() || null,
            facebook_url: pendingLink.source === "facebook" ? pendingLink.url : null,
            instagram_url: pendingLink.source === "instagram" ? pendingLink.url : null,
            website_url: null,
            external_source: pendingLink.source,
          },
        });
        slug = saved.slug;
      } else {
        const res = await create({
          data: {
            name: name.trim(),
            description: description.trim() || undefined,
            location: location.trim() || undefined,
          },
        });
        slug = res.slug;
      }
      toast.success(pendingLink ? "Club added with its link attached" : "Club created");
      setOpen(false);
      setName("");
      setDescription("");
      setLocation("");
      setPendingLink(null);
      reload();
      navigate({ to: "/clubs/$slug", params: { slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create that club");
    } finally {
      setCreating(false);
    }
  }

  async function dropClubLink(url: string): Promise<void> {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    try {
      toast.loading("Reading the page…", { id: "drop" });
      if (/discgolfscene\.com\/clubs\//i.test(url)) {
        const saved = await importSceneClub({ data: { url } });
        toast.success(
          saved.existed ? "Already in Clubs — opening it" : `Added ${saved.club.name}`,
          { id: "drop" },
        );
        navigate({ to: "/clubs/$slug", params: { slug: saved.slug } });
        return;
      }
      const s = await scrapeClubUrl({ data: { url } });
      if (s.needs_manual) {
        setName(s.name);
        setPendingLink({ url: s.url, source: s.source });
        setOpen(true);
        toast.info(
          s.source === "instagram"
            ? "Instagram won't share club details. Add the name and location and we'll attach the link."
            : "Facebook won't share club details. Add the name and location and we'll attach the link.",
          { id: "drop" },
        );
        return;
      }
      const saved = await saveIngestedClub({
        data: {
          name: s.name,
          description: s.description ?? null,
          cover_image_url: s.cover_image_url ?? null,
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
          facebook_url: s.source === "facebook" ? s.url : null,
          instagram_url: s.source === "instagram" ? s.url : null,
          website_url: s.source === "facebook" || s.source === "instagram" ? null : s.url,
          external_source: s.source,
        },
      });
      toast.success(saved.existed ? "Already in Clubs — opening it" : `Added ${s.name}`, {
        id: "drop",
      });
      navigate({ to: "/clubs/$slug", params: { slug: saved.slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that link", { id: "drop" });
    }
  }

  const createDialog = (
    <div className="flex items-center gap-2">
      {counts.managed > 0 ? (
        <Button asChild variant="outline" size="sm">
          <Link to="/director/clubs">
            <Shield className="mr-1 h-4 w-4" /> Manage
          </Link>
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPendingLink(null);
        }}
      >
        <DialogTrigger asChild>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1 h-4 w-4" /> New club
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingLink ? "Add this club" : "Create a club"}</DialogTitle>
          </DialogHeader>
          {pendingLink ? (
            <p className="text-sm text-muted-foreground">
              {pendingLink.source === "instagram" ? "Instagram" : "Facebook"} doesn&apos;t let us
              read club pages, so fill in the details below. We&apos;ll save the link with the club.
            </p>
          ) : null}

          <form onSubmit={createClub} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">Club name</Label>
              <Input
                id="cname"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cloc">Location</Label>
              <Input
                id="cloc"
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, State"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cdesc">Description</Label>
              <Textarea
                id="cdesc"
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? "Creating…" : "Create club"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <CommunityShell
      title="Clubs"
      description="Local disc golf clubs, leagues, and creator communities."
      actions={createDialog}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search clubs by name, city, or keyword"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={80}
          />
          <Select
            value={stateFilter}
            onValueChange={(v) => {
              setStateFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={radius}
            onValueChange={(v) => {
              setRadius(v);
              setPage(0);
              if (v !== "any" && !origin) requestLocation();
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any distance" />
            </SelectTrigger>
            <SelectContent>
              {RADIUS_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v === "any" ? "Any distance" : `Within ${v} miles`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as ClubSort);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suggested">Suggested for you</SelectItem>
              <SelectItem value="near">Closest to me</SelectItem>
              <SelectItem value="members">Most members</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="new">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {loading
              ? "Finding clubs…"
              : `${total.toLocaleString()} club${total === 1 ? "" : "s"} match your filters`}
          </span>
          {radius !== "any" ? (
            <Badge variant="outline" className="gap-1">
              <MapPin className="h-3 w-3" />
              {origin
                ? `Within ${radius} miles`
                : locating
                  ? "Getting your location…"
                  : `Within ${radius} miles (needs your location)`}
            </Badge>
          ) : null}
          {!origin && radius !== "any" ? (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={requestLocation}>
              Use my location
            </Button>
          ) : null}
          {filtersActive ? (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={resetFilters}>
              Reset filters
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as typeof tab);
          setPage(0);
        }}
      >
        <TabsList>
          <TabsTrigger value="mine">
            My clubs{" "}
            <Badge variant="secondary" className="ml-2">
              {counts.mine}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="discover">
            Discover{" "}
            <Badge variant="secondary" className="ml-2">
              {counts.discover}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="managed">
            Managed{" "}
            <Badge variant="secondary" className="ml-2">
              {counts.managed}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="contribute">Contribute</TabsTrigger>
        </TabsList>

        {(["mine", "discover", "managed"] as ClubScope[]).map((s) => (
          <TabsContent key={s} value={s} className="mt-4 space-y-4">
            {s === "discover" && suggestions.length > 0 ? (
              <section className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
                <div>
                  <h2 className="text-sm font-semibold">Suggested for you</h2>
                  <p className="text-xs text-muted-foreground">
                    Based on where your friends play, the courses you log rounds at, and how close
                    each club is to you.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {suggestions.map((c) => (
                    <ClubCard key={c.id} club={c} onJoin={joinClub} onLeave={leaveClub} />
                  ))}
                </div>
              </section>
            ) : null}
            <ClubGrid
              clubs={clubs}
              loading={loading}
              onJoin={joinClub}
              onLeave={leaveClub}
              emptyText={
                s === "mine"
                  ? "You haven't joined any clubs yet. Head to Discover to find your locals."
                  : s === "managed"
                    ? "You don't own or admin any clubs yet."
                    : "No clubs match that search. Try Contribute to add one."
              }
            />
            {hasMore ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                  Load more clubs
                </Button>
              </div>
            ) : null}
            {page > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                Page {page + 1} ·{" "}
                <button className="underline" onClick={() => setPage(0)} type="button">
                  Back to the first page
                </button>
              </p>
            ) : null}
          </TabsContent>
        ))}

        <TabsContent value="contribute" className="mt-4">
          <DropLinkPrompt
            title="Drop your club's link here"
            subtitle="Paste a Disc Golf Scene club page, Facebook / Instagram, UDisc, PDGA, or a club website — we'll pull the name, cover, location, and links."
            placeholder="https://www.discgolfscene.com/clubs/YourLocalDGC"
            cta="Add this club"
            submittingLabel="Reading the page…"
            onSubmit={dropClubLink}
            footer="Don't see your club? Every drop helps fill in the map for everyone."
          />
        </TabsContent>
      </Tabs>
    </CommunityShell>
  );
}

function ClubGrid({
  clubs,
  loading,
  onJoin,
  onLeave,
  emptyText,
}: {
  clubs: Club[];
  loading: boolean;
  onJoin: (c: Club) => void;
  onLeave: (c: Club) => void;
  emptyText: string;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    );
  }
  if (clubs.length === 0) {
    return (
      <EmptyState
        icon={HeartHandshakeIcon}
        title="No clubs here yet"
        description={emptyText}
        accent="accent-clubs"
      />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clubs.map((c) => (
        <ClubCard
          key={c.id}
          club={c}
          role={c.my_role ?? undefined}
          onJoin={onJoin}
          onLeave={onLeave}
        />
      ))}
    </div>
  );
}

function ClubCard({
  club,
  role,
  onJoin,
  onLeave,
}: {
  club: Club;
  role?: MyMembership["role"];
  onJoin: (c: Club) => void;
  onLeave: (c: Club) => void;
}) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
      <Link to="/clubs/$slug" params={{ slug: club.slug }} className="block">
        <div
          className="h-24 w-full bg-gradient-to-br from-primary/20 via-emerald-500/10 to-transparent"
          style={
            club.cover_url
              ? {
                  backgroundImage: `url(${club.cover_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />
      </Link>
      <div className="flex-1 p-4">
        <div className="flex items-start gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-primary/10 text-primary"
            style={
              club.avatar_url
                ? { backgroundImage: `url(${club.avatar_url})`, backgroundSize: "cover" }
                : undefined
            }
          >
            {!club.avatar_url ? <Users className="h-5 w-5" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <Link
              to="/clubs/$slug"
              params={{ slug: club.slug }}
              className="block truncate font-semibold hover:underline"
            >
              {club.name}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {club.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {club.location}
                </span>
              ) : null}
              <span>·</span>
              <span>
                {club.member_count} member{club.member_count === 1 ? "" : "s"}
              </span>
              {role ? (
                <Badge variant="secondary" className="ml-1 gap-1">
                  {role === "owner" ? (
                    <Crown className="h-3 w-3" />
                  ) : role === "admin" ? (
                    <Shield className="h-3 w-3" />
                  ) : null}
                  {role}
                </Badge>
              ) : null}
              {club.distance_miles !== null ? (
                <>
                  <span>·</span>
                  <span>{Math.round(club.distance_miles)} mi away</span>
                </>
              ) : null}
              {club.external_source ? (
                <Badge variant="outline" className="ml-1 gap-1 uppercase">
                  <ExternalLink className="h-3 w-3" />
                  {club.external_source}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        {club.match_reasons.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {club.match_reasons.map((r) => (
              <Badge key={r} variant="secondary" className="text-[11px] font-normal">
                {r}
              </Badge>
            ))}
          </div>
        ) : null}
        {club.description ? (
          <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{club.description}</p>
        ) : (
          <p className="mt-3 line-clamp-2 text-sm italic text-muted-foreground/70">
            <Compass className="mr-1 inline h-3 w-3" />
            No description yet.
          </p>
        )}
        <div className="mt-4 flex items-center gap-2">
          <Button asChild size="sm" variant="secondary" className="flex-1">
            <Link to="/clubs/$slug" params={{ slug: club.slug }}>
              Open
            </Link>
          </Button>
          {role ? (
            role === "owner" ? (
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link to="/director/clubs">Manage</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onLeave(club)} className="flex-1">
                Leave
              </Button>
            )
          ) : (
            <Button size="sm" onClick={() => onJoin(club)} className="flex-1">
              Join
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
