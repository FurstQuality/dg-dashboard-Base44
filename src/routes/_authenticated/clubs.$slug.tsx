import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { ExternalChatLinks } from "@/components/community/external-chat-links";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, MapPin, MessageCircle, MessagesSquare } from "lucide-react";
import {
  ClubLinkChips,
  ClubLinksEditor,
  type ClubLinks,
} from "@/components/clubs/club-links-editor";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { clubDraft } from "@/lib/share-to-feed";
import {
  getClubDetail,
  getClubMembers,
  joinClub as joinClubFn,
  leaveClub as leaveClubFn,
  openClubChat,
  updateClubLinks,
} from "@/lib/clubs.functions";

import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";

import { Button } from "@/components/ui/button";
import { useMyProfile, useSession } from "@/lib/current-user";
import { AddFriendButton } from "@/components/social/add-friend-button";
import { AddToTrackerButton } from "@/components/social/add-to-tracker-button";
import { PostComposer } from "@/components/post-composer";
import { PostCard, type FeedPost } from "@/components/post-card";
import { toast } from "sonner";
import { DropLinkPrompt } from "@/components/drop-link-prompt";
import { scrapeClubUrl } from "@/lib/data-connectors.functions";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { openDirectConversation } from "@/lib/messaging";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const Route = createFileRoute("/_authenticated/clubs/$slug")({
  component: ClubDetail,
  head: ({ params }) => ({
    meta: [
      { title: `Club — DG Dashboard` },
      { name: "description", content: `Club feed, members, and events for ${params.slug}.` },
      { property: "og:title", content: `Club on DG Dashboard` },
      { property: "og:description", content: "Disc golf club community on DG Dashboard." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This club" />,
});

type Club = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  owner_id: string;
  member_count: number;
  facebook_url: string | null;
  instagram_url: string | null;
  website_url: string | null;
  youtube_url: string | null;
  tiktok_url: string | null;
  x_url: string | null;
  discgolfscene_url: string | null;
  discord_url: string | null;
};

function clubLinks(club: Club): ClubLinks {
  return {
    website_url: club.website_url,
    facebook_url: club.facebook_url,
    instagram_url: club.instagram_url,
    youtube_url: club.youtube_url,
    tiktok_url: club.tiktok_url,
    x_url: club.x_url,
    discgolfscene_url: club.discgolfscene_url,
    discord_url: club.discord_url,
  };
}

function hasAnyClubLink(club: Club): boolean {
  return Object.values(clubLinks(club)).some((v) => !!v);
}

function ClubDetail() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchDetail = useServerFn(getClubDetail);
  const join = useServerFn(joinClubFn);
  const leave = useServerFn(leaveClubFn);
  const updateLinks = useServerFn(updateClubLinks);

  const detailQuery = useQuery({
    queryKey: communityKeys.clubDetail(user?.id, slug),
    enabled: !!user,
    staleTime: COMMUNITY_STALE.short,
    queryFn: () => fetchDetail({ data: { slug } }),
  });

  const club = (detailQuery.data?.club ?? null) as Club | null;
  const posts = (detailQuery.data?.posts ?? []) as unknown as FeedPost[];
  const isMember = detailQuery.data?.isMember ?? false;
  const memberCount = detailQuery.data?.memberCount ?? club?.member_count ?? 0;
  const canEdit = !!club && (club.owner_id === user?.id || detailQuery.data?.myRole === "admin");

  const fetchMembers = useServerFn(getClubMembers);
  const membersQuery = useQuery({
    queryKey: communityKeys.clubMembers(user?.id, club?.id ?? ""),
    enabled: !!club?.id,
    staleTime: COMMUNITY_STALE.medium,
    queryFn: () => fetchMembers({ data: { clubId: club!.id } }),
  });
  const members = membersQuery.data?.members ?? [];

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: communityKeys.clubDetail(user?.id, slug) });
  }, [queryClient, slug, user?.id]);

  const loadPosts = useCallback(() => {
    reload();
  }, [reload]);

  async function messageOwner() {
    if (!user || !club || club.owner_id === user.id) return;
    const convId = await openDirectConversation(user.id, club.owner_id);
    if (convId) navigate({ to: "/dgim", search: { conv: convId } });
  }

  const startClubChat = useServerFn(openClubChat);

  async function openChat() {
    if (!club) return;
    try {
      const { conversationId } = await startClubChat({ data: { clubId: club.id } });
      navigate({ to: "/dgim", search: { conv: conversationId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the club chat");
    }
  }

  async function toggleMembership() {
    if (!club) return;
    try {
      if (isMember) {
        await leave({ data: { clubId: club.id } });
        toast.success("Left club");
      } else {
        await join({ data: { clubId: club.id } });
        toast.success("Joined club");
      }
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your membership");
    }
  }

  async function attachClubLink(url: string): Promise<void> {
    if (!club || !canEdit) return;
    try {
      toast.loading("Reading the page…", { id: "attach" });
      const s = await scrapeClubUrl({ data: { url } });
      const isFacebook = s.source === "facebook";
      const isInstagram = s.source === "instagram";
      await updateLinks({
        data: {
          clubId: club.id,
          facebook_url: isFacebook ? s.url : club.facebook_url,
          instagram_url: isInstagram ? s.url : club.instagram_url,
          website_url: isFacebook || isInstagram ? club.website_url : s.url,
          ...(!club.description && s.description ? { description: s.description } : {}),
        },
      });
      toast.success(
        s.needs_manual
          ? "Link saved. That site won't share details, so add them here yourself."
          : "Link attached",
        { id: "attach" },
      );

      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't read that link", { id: "attach" });
    }
  }

  if (detailQuery.isPending || !club) {
    return <div className="text-sm text-muted-foreground">Loading club…</div>;
  }

  return (
    <PageShell section="community">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Users className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold">{club.name}</h1>
            {club.location ? (
              <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> {club.location}
              </div>
            ) : null}
            {club.description ? <p className="mt-3 text-sm">{club.description}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {memberCount} member{memberCount === 1 ? "" : "s"}
              </span>
              <ClubLinkChips links={clubLinks(club)} />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEdit ? (
              <ClubLinksEditor clubId={club.id} links={clubLinks(club)} onSaved={reload} />
            ) : null}
            {isMember || club.owner_id === user?.id ? (
              <Button variant="outline" onClick={openChat}>
                <MessagesSquare className="mr-1.5 h-4 w-4" /> Club chat
              </Button>
            ) : null}
            <ShareToFeedButton
              draft={clubDraft({
                kind: isMember || club.owner_id === user?.id ? "update" : "joined",
                clubId: club.id,
                clubName: club.name,
                location: club.location,
                memberCount,
              })}
              label="Share"
              variant="outline"
            />
            {club.owner_id !== user?.id ? (
              <>
                <Button variant="outline" onClick={messageOwner}>
                  <MessageCircle className="mr-1.5 h-4 w-4" /> Message owner
                </Button>
                <Button
                  onClick={toggleMembership}
                  variant={isMember ? "outline" : "default"}
                  className={
                    isMember ? "" : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }
                >
                  {isMember ? "Leave" : "Join club"}
                </Button>
              </>
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">Owner</span>
            )}
          </div>
        </div>
      </div>

      {canEdit && !hasAnyClubLink(club) ? (
        <DropLinkPrompt
          title="Drop the URL of this club's Facebook page here"
          subtitle="Paste a Facebook, Instagram, UDisc, or website link and we'll attach it to the club. Members will see it in the header."
          placeholder="https://www.facebook.com/YourLocalDGC"
          cta="Attach link"
          onSubmit={attachClubLink}
          accent="sky"
        />
      ) : null}

      <ExternalChatLinks
        ownerType="club"
        ownerId={club.id}
        canManage={club.owner_id === user?.id}
      />

      <Tabs defaultValue="feed" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feed">Club feed</TabsTrigger>
          <TabsTrigger value="members">Members ({memberCount})</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-4">
          {isMember || club.owner_id === user?.id ? (
            <PostComposer profile={profile} clubId={club.id} onCreated={() => loadPosts()} />
          ) : null}
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUserId={user?.id ?? null}
              onChange={() => loadPosts()}
            />
          ))}
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              The club feed is quiet — share a round recap or league update to get the conversation
              rolling.
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="members">
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {membersQuery.isPending ? (
              <div className="p-6 text-sm text-muted-foreground">Loading roster…</div>
            ) : members.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No members yet. Invite local players and the roster will fill in here.
              </div>
            ) : (
              members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-3 p-3">
                  <Avatar className="h-9 w-9">
                    {m.avatar_url ? <AvatarImage src={m.avatar_url} alt="" /> : null}
                    <AvatarFallback>
                      {(m.display_name ?? m.username ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    {m.username ? (
                      <Link
                        to="/players/$username"
                        params={{ username: m.username }}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {m.display_name ?? m.username}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium">
                        {m.display_name ?? "Club member"}
                      </span>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {m.pdga_rating ? `${m.pdga_rating} rated` : "Rating not linked"}
                    </div>
                  </div>
                  {m.role !== "member" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                      {m.role}
                    </span>
                  ) : null}
                  {user?.id && m.user_id !== user.id ? (
                    <>
                      <AddFriendButton userId={m.user_id} name={m.display_name ?? m.username} />
                      <AddToTrackerButton userId={m.user_id} name={m.display_name ?? m.username} />
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="about" className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <p>{club.description ?? "This club hasn't written a description yet."}</p>
            <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Location</dt>
                <dd>{club.location ?? "Not listed"}</dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Members</dt>
                <dd>{memberCount}</dd>
              </div>
            </dl>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
