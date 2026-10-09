import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { openDirectConversation } from "@/lib/messaging";
import { useEffect, useState, useCallback } from "react";
import {
  MapPin,
  Award,
  Users as UsersIcon,
  ArrowLeft,
  UserPlus,
  UserCheck,
  UserX,
  Clock,
  Trophy,
  Sparkles,
  MessageCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PostCard, type FeedPost } from "@/components/post-card";
import { initials, useSession, PROFILE_COLUMNS } from "@/lib/current-user";
import { toast } from "sonner";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { getPublicAchievements } from "@/lib/public-achievements.functions";
import { getPublicProfileHead } from "@/lib/public-profile.functions";

export const Route = createFileRoute("/u/$username")({
  loader: async ({ params }) => {
    try {
      return await getPublicProfileHead({ data: { username: params.username } });
    } catch {
      return { displayName: null, avatarUrl: null };
    }
  },
  head: ({ params, loaderData }) => {
    const name = loaderData?.displayName?.trim() || params.username;
    const avatar = loaderData?.avatarUrl;
    const image = avatar && /^https:\/\//.test(avatar) ? avatar : null;
    const person: Record<string, unknown> = {
      "@type": "Person",
      name,
      alternateName: `@${params.username}`,
      identifier: params.username,
      url: `https://dgdashboard.app/u/${params.username}`,
    };
    if (image) person["image"] = image;
    return {
      meta: [
        { title: `${name} (@${params.username}) — DG Dashboard` },
        {
          name: "description",
          content: `${name}'s public disc golf profile: recent rounds, posts, and achievements on DG Dashboard.`,
        },
        { property: "og:title", content: `${name} (@${params.username}) on DG Dashboard` },
        {
          property: "og:description",
          content: `Public disc golf profile for @${params.username} — recent rounds, posts, and achievements.`,
        },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: `https://dgdashboard.app/u/${params.username}` },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: `https://dgdashboard.app/u/${params.username}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            name: `${name} (@${params.username})`,
            url: `https://dgdashboard.app/u/${params.username}`,
            mainEntity: person,
          }),
        },
      ],
    };
  },

  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This profile" />,
  component: ProfilePage,
});

type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  home_course: string | null;
  pdga_number: string | null;
  pdga_rating: number | null;
};

function ProfilePage() {
  const { username } = Route.useParams();
  const { user } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [friendship, setFriendship] = useState<{
    id: string;
    status: string;
    requester_id: string;
    addressee_id: string;
  } | null>(null);
  const [friendCount, setFriendCount] = useState(0);
  const [xpTotal, setXpTotal] = useState(0);
  const [achievements, setAchievements] = useState<
    { key: string; name: string; icon: string; tier: string; earned_at: string }[]
  >([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("username", username)
      .maybeSingle();
    if (!data) return setNotFound(true);
    setProfile(data as unknown as Profile);

    const [{ data: ps }, { count: fc }, { count: gc }] = await Promise.all([
      supabase
        .from("posts")
        .select(
          "id, author_id, type, body, media, location, like_count, comment_count, created_at, course_name, round_id, score_data",
        )
        .eq("author_id", data.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("followee_id", data.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", data.id),
    ]);
    setFollowers(fc ?? 0);
    setFollowingCount(gc ?? 0);
    setPosts(
      (ps ?? []).map((p) => ({
        ...(p as FeedPost),
        media: p.media as FeedPost["media"],
        author: {
          username: data.username,
          display_name: data.display_name,
          avatar_url: data.avatar_url,
        },
      })),
    );

    // Friend count for this profile
    const { count: frc } = await supabase
      .from("friendships")
      .select("*", { count: "exact", head: true })
      .eq("status", "accepted")
      .or(`requester_id.eq.${data.id},addressee_id.eq.${data.id}`);
    setFriendCount(frc ?? 0);

    // XP total + achievements (badges served via a controlled server route)
    const [{ data: xpRows }, achRows] = await Promise.all([
      supabase.from("xp_events").select("xp").eq("user_id", data.id),
      getPublicAchievements({ data: { userId: data.id, limit: 12 } }).catch(() => []),
    ]);
    setXpTotal((xpRows ?? []).reduce((s, r) => s + (r.xp ?? 0), 0));
    setAchievements(achRows ?? []);

    if (user && user.id !== data.id) {
      const { data: f } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", user.id)
        .eq("followee_id", data.id)
        .maybeSingle();
      setIsFollowing(!!f);

      const { data: fr } = await supabase
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${data.id}),and(requester_id.eq.${data.id},addressee_id.eq.${user.id})`,
        )
        .maybeSingle();
      setFriendship(fr ?? null);
    } else {
      setFriendship(null);
    }
  }, [username, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleFollow() {
    if (!user || !profile) return;
    if (isFollowing) {
      setIsFollowing(false);
      setFollowers((c) => Math.max(0, c - 1));
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("followee_id", profile.id);
    } else {
      setIsFollowing(true);
      setFollowers((c) => c + 1);
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, followee_id: profile.id });
      if (error) return toast.error(error.message);
      await supabase.from("notifications").insert({
        user_id: profile.id,
        actor_id: user.id,
        type: "follow",
      });
    }
  }

  const navigate = useNavigate();
  async function messagePlayer() {
    if (!user || !profile) return;
    const convId = await openDirectConversation(user.id, profile.id);
    if (convId) void navigate({ to: "/messages", search: { conv: convId } });
  }

  async function sendFriendRequest() {
    if (!user || !profile) return;
    const { data, error } = await supabase
      .from("friendships")
      .insert({ requester_id: user.id, addressee_id: profile.id, status: "pending" })
      .select("id, status, requester_id, addressee_id")
      .single();
    if (error) return toast.error(error.message);
    setFriendship(data);
    // The notification is written by a database trigger on `friendships`.
    toast.success(`Request sent. ${profile.display_name ?? "They"} will see it in notifications.`);
  }

  async function acceptFriendRequest() {
    if (!user || !profile || !friendship) return;
    // Only the addressee may accept; the database enforces it too.
    if (friendship.addressee_id !== user.id || friendship.status !== "pending") {
      return toast.error("That request is waiting on the other player.");
    }
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendship.id)
      .eq("status", "pending");
    if (error) return toast.error(error.message);
    setFriendship({ ...friendship, status: "accepted" });
    setFriendCount((c) => c + 1);
    toast.success("You are now friends");
  }

  async function removeFriendship(cancel = false) {
    if (!friendship) return;
    const { error } = await supabase.from("friendships").delete().eq("id", friendship.id);
    if (error) return toast.error(error.message);
    if (friendship.status === "accepted") setFriendCount((c) => Math.max(0, c - 1));
    setFriendship(null);
    toast.success(cancel ? "Request cancelled" : "Friend removed");
  }

  // Signed-in viewers get the full athlete profile; guests keep the public page.
  const viewerId: string | null = user?.id ?? null;
  if (viewerId) {
    return <Navigate to="/players/$username" params={{ username }} replace />;
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="font-display text-2xl">Player not found</div>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't find an account for @{username}.
        </p>
        <Link to="/home" className="mt-4 inline-block text-primary hover:underline">
          Back to feed
        </Link>
      </div>
    );
  }

  if (!profile)
    return <div className="p-6 text-sm text-muted-foreground">Loading player profile…</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6">
        {!user ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
            <span className="text-muted-foreground">Viewing as guest</span>
            <Link to="/auth">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                Sign in
              </Button>
            </Link>
          </div>
        ) : (
          <Link
            to="/home"
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Feed
          </Link>
        )}

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20">
              {profile.avatar_url ? (
                <AvatarImage
                  src={profile.avatar_url}
                  alt={`Profile photo of ${profile.display_name}, disc golf player on DG Dashboard`}
                />
              ) : null}
              <AvatarFallback className="text-lg">{initials(profile.display_name)}</AvatarFallback>
            </Avatar>

            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold">{profile.display_name}</h1>
              <div className="text-sm text-muted-foreground">@{profile.username}</div>
              {profile.bio ? <p className="mt-2 text-sm">{profile.bio}</p> : null}
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {profile.home_course ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {profile.home_course}
                  </span>
                ) : null}
                {profile.pdga_number ? (
                  <span className="inline-flex items-center gap-1">
                    <Award className="h-3 w-3" /> PDGA #{profile.pdga_number}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <UsersIcon className="h-3 w-3" /> {friendCount} friend
                  {friendCount === 1 ? "" : "s"} · {followers} follower{followers === 1 ? "" : "s"}{" "}
                  · {followingCount} following
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {user && user.id === profile.id ? (
                <Link to="/me/edit">
                  <Button variant="outline" size="sm">
                    Edit profile
                  </Button>
                </Link>
              ) : user ? (
                <>
                  {!friendship ? (
                    <Button size="sm" onClick={sendFriendRequest}>
                      <UserPlus className="mr-1 h-3.5 w-3.5" /> Add friend
                    </Button>
                  ) : friendship.status === "accepted" ? (
                    <Button size="sm" variant="outline" onClick={() => removeFriendship(false)}>
                      <UserCheck className="mr-1 h-3.5 w-3.5" /> Friends
                    </Button>
                  ) : friendship.requester_id === user.id ? (
                    <Button size="sm" variant="outline" onClick={() => removeFriendship(true)}>
                      <Clock className="mr-1 h-3.5 w-3.5" /> Requested
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" onClick={acceptFriendRequest}>
                        <UserCheck className="mr-1 h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => removeFriendship(false)}>
                        <UserX className="mr-1 h-3.5 w-3.5" /> Decline
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="outline" onClick={messagePlayer}>
                    <MessageCircle className="mr-1 h-3.5 w-3.5" /> Message
                  </Button>
                  <Button
                    size="sm"
                    variant={isFollowing ? "outline" : "ghost"}
                    onClick={toggleFollow}
                  >
                    {isFollowing ? "Following" : "Follow"}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <Award className="h-3.5 w-3.5" /> PDGA Rating
            </div>
            <div className="mt-1 font-display text-2xl font-bold">{profile.pdga_rating ?? "—"}</div>
            {profile.pdga_number ? (
              <div className="text-xs text-muted-foreground">#{profile.pdga_number}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" /> XP
            </div>
            <div className="mt-1 font-display text-2xl font-bold">{xpTotal.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">
              Level {Math.floor(xpTotal / 500) + 1}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> Achievements
            </div>
            <div className="mt-1 font-display text-2xl font-bold">{achievements.length}</div>
            <div className="text-xs text-muted-foreground">earned</div>
          </div>
        </div>

        {achievements.length > 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <div className="mb-2 text-xs uppercase text-muted-foreground">Recent achievements</div>
            <div className="flex flex-wrap gap-2">
              {achievements.map((a) => (
                <span
                  key={a.key}
                  title={`${a.name} · ${a.tier}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-1 text-xs"
                >
                  <span>{a.icon}</span>
                  <span className="font-medium">{a.name}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
          <h2 className="mb-1 text-sm font-semibold text-foreground">
            About player profiles on DG Dashboard
          </h2>
          <p>
            Player profiles collect rounds, PDGA rating history, achievements, and club activity in
            one place. Players use DG Dashboard to score rounds hole by hole, compare stats with
            friends, and register for local tournaments and leagues.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {posts.map((p) => (
            <PostCard key={p.id} post={p} currentUserId={user?.id ?? null} onChange={load} />
          ))}
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              This player hasn't posted yet — check back after their next round.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
