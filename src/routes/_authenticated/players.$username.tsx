import { DgdBadge } from "@/components/dgd/dgd-badge";
import { useTierState, CredentialChips } from "@/components/dgd/tier-progress";
import { useDgdIdentity } from "@/lib/dgd-identity";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { PROFILE_STALE, profileKeys } from "@/lib/profile-queries";
import {
  MapPin,
  Trophy,
  Calendar,
  Users,
  UserPlus,
  UserCheck,
  UserMinus,
  Camera,
  Star,
  Award,
  Disc,
  Settings,
  Share2,
  MessageSquare,
  Zap,
  ExternalLink,
  HandHeart,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RoundRatingPair } from "@/components/round-rating-pair";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PeopleYouMayKnow } from "@/components/social/people-you-may-know";
import { initials } from "@/lib/current-user";
import type { ProfileSectionKey } from "@/lib/profile-visibility";
import {
  getPlayerProfile,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  toggleFollow,
} from "@/lib/player-profile.functions";
import {
  PdgaCard,
  SkillSnapshot,
  FormCard,
  DivisionsCard,
  UpcomingEventsCard,
} from "@/components/profile/player-insights";
import { PlayerPassButton } from "@/components/events/player-pass";
import { ProgressHub } from "@/components/progress/progress-hub";
import { StatHighlightsCard, HighlightPicker } from "@/components/profile/stat-highlights-card";
import { ProfileVisibilityPanel } from "@/components/profile/profile-visibility-panel";
import { PlayerBagCard } from "@/components/profile/player-bag-card";
import { PlayerNowNextCard } from "@/components/profile/player-now-next";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { RatingsPanel } from "@/components/ratings-panel";

export const Route = createFileRoute("/_authenticated/players/$username")({
  component: PlayerProfilePage,
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search.tab === "string" ? { tab: search.tab } : {},
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — Player Profile · DG Dashboard` },
      {
        name: "description",
        content: `Member view of ${params.username}'s player profile: stats, rounds, events, trophies, badges, and achievements.`,
      },
      {
        property: "og:title",
        content: `@${params.username} — Player Profile (member view)`,
      },
      {
        property: "og:description",
        content: `Signed-in player profile with full stats, event history, trophies, and badges. Public profile: dgdashboard.app/u/${params.username}`,
      },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary_large_image" },
      // Members-only view of the same player; the public /u/:username page is the
      // indexable version, so keep this out of search results.
      { name: "robots", content: "noindex, follow" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: `https://dgdashboard.app/u/${params.username}`,
          mainEntity: {
            "@type": "Person",
            alternateName: `@${params.username}`,
            identifier: params.username,
            url: `https://dgdashboard.app/u/${params.username}`,
          },
        }),
      },
    ],
  }),
});

function PlayerProfilePage() {
  const { username } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getPlayerProfile);
  const sendReq = useServerFn(sendFriendRequest);
  const respond = useServerFn(respondFriendRequest);
  const remove = useServerFn(removeFriend);
  const follow = useServerFn(toggleFollow);
  const [requestedTab, setTab] = useState(tabParam ?? "overview");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: profileKeys.player(username),
    queryFn: () => fetchProfile({ data: { username } }),
    staleTime: PROFILE_STALE.player,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: profileKeys.player(username) });

  const friendMut = useMutation({
    mutationFn: async (action: "send" | "accept" | "reject" | "remove") => {
      if (!data) return;
      if (action === "send") await sendReq({ data: { addressee_id: data.profile.id } });
      else if (action === "accept")
        await respond({ data: { friendship_id: data.friendship!.id, accept: true } });
      else if (action === "reject")
        await respond({ data: { friendship_id: data.friendship!.id, accept: false } });
      else if (action === "remove") await remove({ data: { friendship_id: data.friendship!.id } });
    },
    onSuccess: (_, action) => {
      invalidate();
      toast.success(
        action === "send"
          ? "Friend request sent"
          : action === "accept"
            ? "Friend request accepted"
            : action === "reject"
              ? "Friend request declined"
              : "Friend removed",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const followMut = useMutation({
    mutationFn: async () => {
      if (!data) return;
      await follow({ data: { followee_id: data.profile.id, follow: !data.viewerFollows } });
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const copyShare = async () => {
    const url = `${window.location.origin}/players/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl animate-pulse space-y-6">
          <div className="h-56 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-64 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">We couldn't load this profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing is wrong with the account — the page just didn't come through. Try again in a
          moment.
        </p>
        <Button className="mt-4" onClick={() => void refetch()} disabled={isFetching}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold">Player not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't find a player with the username @{username}.
        </p>
        <Button className="mt-4" onClick={() => navigate({ to: "/friends" })}>
          Find players
        </Button>
      </div>
    );
  }

  const p = data.profile;
  const friend = data.friendship;
  const hiddenSections = new Set(data.hidden ?? []);
  const shows = (key: ProfileSectionKey) => !hiddenSections.has(key);
  // Fall back to Overview when the owner has hidden the tab that's selected.
  const tabSection: Record<string, ProfileSectionKey> = {
    photos: "photos",
    friends: "friends",
    stats: "stats",
    bag: "bag",
    rounds: "rounds",
    achievements: "achievements",
  };
  // Rounds and events are merged into one owner-only tab; posts live on the Overview home page.
  const normalizedTab =
    requestedTab === "events" ? "rounds" : requestedTab === "posts" ? "overview" : requestedTab;
  const requestedSection = tabSection[normalizedTab];
  const ownerOnlyTab = (normalizedTab === "rounds" || normalizedTab === "edit") && !data.isSelf;
  const visibleTab =
    ownerOnlyTab || (requestedSection && !shows(requestedSection)) ? "overview" : normalizedTab;

  // Ratings only mean something with their source attached: the PDGA number is
  // official and updates on the PDGA's own schedule, while the DGD number is
  // this app's estimate from however many rated rounds it has seen.
  const pdgaRounds = data.pdga?.rounds_used ?? null;
  const pdgaUpdated = data.pdga?.last_changed
    ? new Date(data.pdga.last_changed).toLocaleDateString()
    : null;
  const dgdRounds = data.stats.dgd_rating_rounds ?? 0;
  const ratingProvenance = {
    pdga:
      (data.pdga?.current_rating ?? p.pdga_rating) == null
        ? null
        : [
            "Official PDGA",
            pdgaRounds ? `${pdgaRounds} rounds` : null,
            pdgaUpdated ? `updated ${pdgaUpdated}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
    dgd:
      data.stats.dgd_rating == null
        ? null
        : `DGD Rating${dgdRounds ? ` · ${dgdRounds} rated round${dgdRounds === 1 ? "" : "s"}` : ""}`,
  };


  return (
    <PageShell>
      {/* Cover */}
      <div className="relative h-56 w-full overflow-hidden rounded-b-xl bg-gradient-to-br from-primary/40 via-primary/20 to-accent/30 sm:h-72">
        {p.cover_url && (
          <img src={p.cover_url} alt="Cover" className="h-full w-full object-cover" />
        )}
      </div>

      {/* Header */}
      <div className="px-4 sm:px-6">
        <div className="-mt-16 flex flex-col gap-4 sm:-mt-20 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
            <Avatar className="h-32 w-32 border-4 border-background shadow-lg sm:h-40 sm:w-40">
              <AvatarImage src={p.avatar_url ?? undefined} alt={p.display_name} />
              <AvatarFallback className="text-2xl">{initials(p.display_name)}</AvatarFallback>
            </Avatar>
            <div className="text-center sm:pb-3 sm:text-left">
              <h1 className="text-2xl font-bold sm:text-3xl">{p.display_name}</h1>
              <ProfileCredentials userId={data.profile.id} />
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground sm:justify-start">
                <span>@{p.username}</span>
                {p.pdga_number && <Badge variant="secondary">PDGA #{p.pdga_number}</Badge>}
                {(data.pdga?.current_rating ?? p.pdga_rating) != null && (
                  <Badge title={ratingProvenance.pdga ?? undefined}>
                    PDGA {data.pdga?.current_rating ?? p.pdga_rating}
                  </Badge>
                )}
<ProfileDgdBadge userId={data.profile.id} />
                {(p.preferred_division ?? data.divisions[0]?.division) && (
                  <Badge variant="outline">
                    {p.preferred_division ?? data.divisions[0].division}
                  </Badge>
                )}
                {data.pdga?.official_status && (
                  <Badge variant="outline">{data.pdga.official_status}</Badge>
                )}
                {data.form.delta != null && data.form.delta !== 0 && (
                  <Badge variant={data.form.delta > 0 ? "default" : "outline"}>
                    {data.form.delta > 0 ? "▲" : "▼"} {Math.abs(data.form.delta)} recent form
                  </Badge>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground sm:justify-start">
                {(p.location || p.home_state) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[p.location, p.home_state].filter(Boolean).join(", ")}
                  </span>
                )}
                {p.home_course && (
                  <span className="inline-flex items-center gap-1">
                    <Disc className="h-3.5 w-3.5" />
                    Home: {p.home_course}
                  </span>
                )}
                {p.player_since && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Since {p.player_since}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:pb-3">
            {data.isSelf ? (
              <>
                <Button variant="secondary" onClick={() => setTab("edit")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
                <PlayerPassButton label="Player pass" />
                <Button variant="outline" onClick={copyShare}>
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
              </>
            ) : (
              <>
                {friend?.direction === "friends" && (
                  <Button variant="secondary" onClick={() => friendMut.mutate("remove")}>
                    <UserCheck className="mr-2 h-4 w-4" />
                    Friends
                  </Button>
                )}
                {friend?.direction === "outgoing" && (
                  <Button variant="outline" disabled>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Request Sent
                  </Button>
                )}
                {friend?.direction === "incoming" && (
                  <>
                    <Button onClick={() => friendMut.mutate("accept")}>
                      <UserCheck className="mr-2 h-4 w-4" />
                      Accept Request
                    </Button>
                    <Button variant="outline" onClick={() => friendMut.mutate("reject")}>
                      <UserMinus className="mr-2 h-4 w-4" />
                      Decline
                    </Button>
                  </>
                )}
                {!friend && (
                  <Button onClick={() => friendMut.mutate("send")}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add Friend
                  </Button>
                )}
                <Button
                  variant={data.viewerFollows ? "secondary" : "outline"}
                  onClick={() => followMut.mutate()}
                >
                  {data.viewerFollows ? "Following" : "Follow"}
                </Button>
                <Button variant="outline" onClick={() => navigate({ to: "/dgim" })}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Message
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy a link to this profile"
                  onClick={copyShare}
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {p.bio && <p className="mt-4 max-w-3xl text-sm text-foreground/90">{p.bio}</p>}

        {/* Stat strip */}
        {(shows("stats") || shows("ratings") || shows("friends")) && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {shows("stats") && (
              <StatTile
                label="Rounds"
                value={data.stats.total_rounds}
                icon={<Disc className="h-4 w-4" />}
              />
            )}
            {shows("ratings") && (
              <StatTile
                label="PDGA rating"
                value={data.pdga?.current_rating ?? p.pdga_rating ?? "—"}
                icon={<Star className="h-4 w-4" />}
                hint={ratingProvenance.pdga}
              />
            )}
            {shows("ratings") && (
              <StatTile
                label="DGD rating"
                value={data.stats.dgd_rating ?? "—"}
                icon={<Star className="h-4 w-4" />}
                hint={ratingProvenance.dgd}
              />
            )}
            {shows("ratings") && (
              <StatTile
                label="Best round"
                value={data.stats.best_rating ?? "—"}
                icon={<Trophy className="h-4 w-4" />}
              />
            )}
            {shows("stats") && (
              <StatTile label="Wins" value={data.stats.wins} icon={<Award className="h-4 w-4" />} />
            )}
            {shows("stats") && (
              <StatTile label="Aces" value={data.stats.aces} icon={<Zap className="h-4 w-4" />} />
            )}
            {shows("stats") && p.reunited_count > 0 && (
              <StatTile
                label="Discs returned"
                value={p.reunited_count}
                icon={<HandHeart className="h-4 w-4" />}
              />
            )}
            {shows("stats") && (
              <StatTile
                label="Events"
                value={data.stats.events_played}
                icon={<Calendar className="h-4 w-4" />}
              />
            )}
            {shows("friends") && (
              <StatTile
                label="Friends"
                value={data.counts.friends}
                icon={<Users className="h-4 w-4" />}
              />
            )}
          </div>
        )}

        {shows("progress") && data.progress && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Level {data.progress.level}</Badge>
            <span>{data.progress.title}</span>
            <span>·</span>
            <span>{data.progress.xp.toLocaleString()} XP</span>
            {data.progress.streak_days > 0 && (
              <>
                <span>·</span>
                <span>🔥 {data.progress.streak_days}-day streak</span>
              </>
            )}
          </div>
        )}

        <PlayerNowNextCard
          nowNext={data.nowNext}
          upcoming={data.upcoming}
          recentRounds={data.recentRounds}
          displayName={p.display_name}
          isSelf={data.isSelf}
        />

        {/* Tabs */}
        <Tabs value={visibleTab} onValueChange={setTab} className="mt-6">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1.5 p-1.5">
            <TabsTrigger value="overview">Overview</TabsTrigger>

            {shows("photos") && <TabsTrigger value="photos">Photos</TabsTrigger>}
            {shows("friends") && (
              <TabsTrigger value="friends">Friends ({data.counts.friends})</TabsTrigger>
            )}
            {shows("stats") && <TabsTrigger value="stats">Stats</TabsTrigger>}
            {shows("bag") && (
              <TabsTrigger value="bag">
                {data.isSelf ? "My Bag" : `${p.display_name.split(" ")[0]}'s bag`}
              </TabsTrigger>
            )}
            {data.isSelf && (shows("rounds") || shows("events")) && (
              <TabsTrigger value="rounds">Rounds &amp; events</TabsTrigger>
            )}

            {shows("achievements") && (
              <TabsTrigger value="achievements">Trophies &amp; badges</TabsTrigger>
            )}
            {data.isSelf && <TabsTrigger value="edit">Edit profile</TabsTrigger>}
          </TabsList>

          <TabsContent value="edit" className="mt-4 space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">Everything on your profile, in one place</div>
              <p className="text-xs text-muted-foreground">
                Photos, identity, home turf, division, linked accounts, the stats you show off, and
                who can see each part of your page.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/me/bag">Edit my bag</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings/notifications">Notifications</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/settings/personalization">Look &amp; feel</Link>
                </Button>
                <Button asChild size="sm" variant="ghost" onClick={() => setTab("overview")}>
                  <span>Back to profile</span>
                </Button>
              </div>
            </div>

            <RatingsPanel />
            <ProfileEditor afterSave="stay" />

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="text-sm font-semibold">Stats other players see</div>
              <p className="text-xs text-muted-foreground">
                Pick the highlights that headline your profile.
              </p>
              <HighlightPicker data={data} selected={data.statHighlights} />
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold">Who sees what</div>
              <ProfileVisibilityPanel showDataLink={false} />
            </div>
          </TabsContent>

          <TabsContent value="overview" className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-3">
                {shows("form") && <FormCard form={data.form} highlights={data.highlights} />}
                {shows("scoring") && <SkillSnapshot scoring={data.scoring} />}
              </div>
              <div className="space-y-3">
                {shows("pdga") && <PdgaCard pdga={data.pdga} />}
                {shows("calendar") && (
                  <UpcomingEventsCard
                    upcoming={data.upcoming}
                    isSelf={data.isSelf}
                    displayName={p.display_name}
                  />
                )}
                {shows("divisions") && <DivisionsCard divisions={data.divisions} />}
              </div>
            </div>
            {!data.pdga &&
              !data.scoring &&
              data.form.trend.length === 0 &&
              data.divisions.length === 0 && (
                <EmptyCard
                  icon={<Star className="h-8 w-8" />}
                  title="No performance data yet"
                  hint={
                    data.isSelf
                      ? "Link your PDGA number or play a rated round and your scoring profile, form trend, and divisions fill in automatically."
                      : `${p.display_name} hasn't logged rated rounds yet.`
                  }
                />
              )}
            {data.recentRounds.length > 0 && (
              <Card>
                <CardContent className="pt-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Latest rounds</h3>
                    <button
                      className="text-sm text-primary hover:underline"
                      onClick={() => setTab("rounds")}
                    >
                      See all rounds
                    </button>
                  </div>
                  <div className="divide-y rounded-lg border">
                    {data.recentRounds.slice(0, 5).map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{r.course_name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {new Date(r.played_on).toLocaleDateString()}
                            {r.event_name && ` · ${r.event_name}`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {r.score != null && (
                            <span className="font-mono">
                              {r.score}
                              {r.to_par != null && ` (${r.to_par > 0 ? "+" : ""}${r.to_par})`}
                            </span>
                          )}
                          {r.round_rating != null && <Badge>{r.round_rating}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {shows("posts") && (
              <div className="space-y-3">
                <h3 className="pt-2 text-sm font-semibold">Recent posts</h3>
                {data.posts.length === 0 && data.scene.comments.length === 0 && (
                  <EmptyCard
                    icon={<MessageSquare className="h-8 w-8" />}
                    title="No posts yet"
                    hint={
                      data.isSelf
                        ? "Share a round, ace, or check-in from the feed."
                        : `${p.display_name} hasn't posted yet.`
                    }
                  />
                )}
                {data.posts.map((post) => (
                  <Card key={post.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {post.type}
                          </Badge>
                          {post.course_name && <span>{post.course_name}</span>}
                        </div>
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                      {post.body && <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>}
                      {Array.isArray(post.media) && post.media.length > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {(post.media as Array<{ url?: string }>)
                            .slice(0, 6)
                            .map(
                              (m, i) =>
                                m.url && (
                                  <img
                                    key={i}
                                    src={m.url}
                                    alt=""
                                    className="aspect-square w-full rounded-lg object-cover"
                                  />
                                ),
                            )}
                        </div>
                      )}
                      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                        <span>{post.like_count} likes</span>
                        <span>{post.comment_count} comments</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {data.scene.comments.length > 0 && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="font-semibold">Recent Disc Golf Scene comments</h3>
                        <Badge variant="outline">{data.scene.comments.length}</Badge>
                      </div>
                      <div className="space-y-3">
                        {data.scene.comments.slice(0, 10).map((c, i) => (
                          <div key={i} className="rounded-md border p-3 text-sm">
                            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                              {c.author && (
                                <span className="font-medium text-foreground">{c.author}</span>
                              )}
                              {c.posted_at && (
                                <span>{new Date(c.posted_at).toLocaleDateString()}</span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap">{c.body}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="photos" className="mt-4">
            {data.photos.length === 0 && (
              <EmptyCard
                icon={<Camera className="h-8 w-8" />}
                title="No photos yet"
                hint="Photos from shared rounds and posts show up here."
              />
            )}
            <div className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6">
              {data.photos.map((ph, i) => (
                <img
                  key={i}
                  src={ph.url}
                  alt=""
                  className="aspect-square w-full rounded-md object-cover"
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="friends" className="mt-4 space-y-4">
            {data.friends.length === 0 && (
              <EmptyCard
                icon={<Users className="h-8 w-8" />}
                title="No friends yet"
                hint="Send a friend request to start building a crew."
              />
            )}
            {data.friends.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  DG Dashboard crew
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {data.friends.map((f) => (
                    <Link
                      key={f.id}
                      to="/players/$username"
                      params={{ username: f.username }}
                      className="group"
                    >
                      <Card className="transition hover:border-primary">
                        <CardContent className="flex items-center gap-3 p-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={f.avatar_url ?? undefined} />
                            <AvatarFallback>{initials(f.display_name)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium group-hover:text-primary">
                              {f.display_name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              @{f.username}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="bag" className="mt-4 space-y-3">
            <PlayerBagCard username={p.username} />
          </TabsContent>

          <TabsContent value="stats" className="mt-4 space-y-3">
            <StatHighlightsCard data={data} />
            {data.scene.aces.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Career aces</h3>
                    <Badge>{data.scene.aces.length}</Badge>
                  </div>
                  <div className="mt-3 divide-y rounded-md border">
                    {data.scene.aces.slice(0, 20).map((a, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {a.course_name ?? "Unknown course"}
                            {a.hole ? (
                              <span className="text-muted-foreground"> · Hole {a.hole}</span>
                            ) : null}
                          </div>
                          {a.event_name && (
                            <div className="truncate text-xs text-muted-foreground">
                              {a.event_name}
                            </div>
                          )}
                        </div>
                        {a.played_on && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.played_on).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="rounds" className="mt-4 space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground">Round history</h3>
            {data.recentRounds.length === 0 && (
              <EmptyCard
                icon={<Disc className="h-8 w-8" />}
                title="No rounds yet"
                hint="Rounds from PDGA sync, UDisc imports, and DG Dashboard scoring appear here."
              />
            )}
            <div className="divide-y rounded-xl border">
              {data.recentRounds.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {r.course_name}
                      {r.layout_name && (
                        <span className="text-muted-foreground"> · {r.layout_name}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.played_on).toLocaleDateString()}
                      {r.event_name && ` · ${r.event_name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge variant="outline" className="uppercase">
                      {r.source}
                    </Badge>
                    {r.score != null && (
                      <span className="font-mono">
                        {r.score}
                        {r.to_par != null && ` (${r.to_par > 0 ? "+" : ""}${r.to_par})`}
                      </span>
                    )}
                    <RoundRatingPair
                      compact
                      source={r.source}
                      publishedRating={r.round_rating}
                      roundId={r.id}
                    />
                    {r.place != null && (
                      <span className="text-muted-foreground">
                        #{r.place}
                        {r.field_size ? `/${r.field_size}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <UpcomingEventsCard
              upcoming={data.upcoming}
              isSelf={data.isSelf}
              displayName={p.display_name}
            />
            <DivisionsCard divisions={data.divisions} />
            {data.events.length === 0 && data.scene.series.length === 0 && (
              <EmptyCard
                icon={<Trophy className="h-8 w-8" />}
                title="No completed events yet"
                hint="Sanctioned PDGA events and tracked flex events show up here once results post."
              />
            )}
            {data.events.length > 0 && (
              <h3 className="text-sm font-semibold text-muted-foreground">Event history</h3>
            )}
            {data.events.length > 0 && (
              <div className="space-y-2">
                {data.events.map((e, i) => (
                  <Card key={i}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{e.event_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.played_on).toLocaleDateString()} · {e.rounds} round
                          {e.rounds === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {e.place != null && (
                          <Badge variant="outline">
                            #{e.place}
                            {e.field_size ? `/${e.field_size}` : ""}
                          </Badge>
                        )}
                        {e.best_rating != null && <Badge>Best {e.best_rating}</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            {data.scene.series.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-semibold">Series &amp; leagues from Disc Golf Scene</h3>
                    <Badge variant="outline">{data.scene.series.length}</Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {data.scene.series.slice(0, 30).map((s, i) => (
                      <a
                        key={i}
                        href={s.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:border-primary"
                      >
                        <span className="min-w-0 truncate">{s.name}</span>
                        <span className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
                          {s.season && <Badge variant="outline">{s.season}</Badge>}
                          {s.url && <ExternalLink className="h-3 w-3" />}
                        </span>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="achievements" className="mt-4 space-y-6">
            <ProgressHub username={username} displayName={data.profile.display_name} />
            {data.achievements.length === 0 && data.scene.achievements.length === 0 && (
              <EmptyCard
                icon={<Award className="h-8 w-8" />}
                title="No achievements yet"
                hint="Play more rounds, hit milestones, and unlock badges."
              />
            )}
            {data.achievements.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                  DG Dashboard badges
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {data.achievements.map((a) => (
                    <Card key={a.key} className={tierClass(a.tier)}>
                      <CardContent className="p-4 text-center">
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          <Trophy className="h-6 w-6 text-primary" />
                        </div>
                        <div className="text-sm font-semibold">{a.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{a.description}</div>
                        <Badge variant="outline" className="mt-2 capitalize">
                          {a.tier}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            {data.scene.achievements.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  Disc Golf Scene achievements
                  <Badge variant="outline">{data.scene.achievements.length}</Badge>
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.scene.achievements.map((a, i) => (
                    <div key={i} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium">{a.title}</div>
                        {a.date && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {a.description && (
                        <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <PeopleYouMayKnow className="mt-6" limit={6} title="More players you may know" />
      </div>
    </PageShell>
  );
}

function StatTile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  /** Where the number came from, so a rating is never mistaken for official. */
  hint?: string | null;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 py-4">
        <div className="text-muted-foreground">{icon}</div>
        <div className="text-lg font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {hint ? (
          <div className="text-center text-[10px] leading-tight text-muted-foreground/80">
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function EmptyCard({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <div className="text-muted-foreground">{icon}</div>
        <div className="font-medium">{title}</div>
        <div className="max-w-md text-sm text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function tierClass(tier: string) {
  switch (tier) {
    case "platinum":
      return "border-sky-400/60 bg-sky-500/5";
    case "gold":
      return "border-yellow-500/60 bg-yellow-500/5";
    case "silver":
      return "border-slate-400/60 bg-slate-500/5";
    default:
      return "border-amber-700/60 bg-amber-700/5";
  }
}

function ProfileDgdBadge({ userId }: { userId: string }) {
  const ids = useDgdIdentity(userId);
  const tier = useTierState(userId);
  const r = ids.data?.dgd_rating ?? null;
  return <DgdBadge size="sm" tier={tier.data?.current_tier ?? ids.data?.tier} rating={r == null ? null : Math.round(r)} />;
}

function ProfileCredentials({ userId }: { userId: string }) {
  const tier = useTierState(userId);
  return <div className="my-1 flex justify-center sm:justify-start"><CredentialChips credentials={tier.data?.career?.credentials} /></div>;
}
