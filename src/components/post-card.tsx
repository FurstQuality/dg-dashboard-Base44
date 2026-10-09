import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  MessageCircle,
  Bookmark,
  MapPin,
  Target,
  Trophy,
  Award,
  Swords,
  Camera,
  Video,
  Send,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
  Users,
  Lock,
} from "lucide-react";
import { PostReactions } from "@/components/feed/post-reactions";
import { usePrefetchedInteraction } from "@/components/feed/feed-interactions";
import { PostBody } from "@/components/feed/post-body";
import { PostModerationMenu } from "@/components/feed/post-moderation-menu";
import { RepostDialog } from "@/components/feed/repost-dialog";
import { QuotedPost } from "@/components/feed/quoted-post";
import { RoundSnapshotCard, type RoundSnapshot } from "@/components/feed/round-snapshot-card";
import { PostMedia } from "@/components/feed/post-media";
import { CommentReactions } from "@/components/feed/comment-reactions";
import { ShareSheet } from "@/components/feed/share-sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { initials, timeAgo } from "@/lib/current-user";
import { toast } from "sonner";
import { pushToUser } from "@/lib/push.functions";
import { channelNonce } from "@/lib/realtime";

export type FeedPost = {
  id: string;
  author_id: string;
  type: string;
  body: string | null;
  media: Array<{ url: string; path: string; type: string }> | null;
  location: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  course_name?: string | null;
  round_id?: string | null;
  repost_of?: string | null;
  share_count?: number | null;
  visibility?: "public" | "friends" | "club" | null;
  score_data?: {
    total?: number;
    to_par?: number;
    rating?: number | null;
    holes?: number;
    auto?: string;
    achievement_name?: string;
    tier?: string | null;
  } | null;
  snapshot?: RoundSnapshot | null;
  author: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  /** True when the post was published under a club identity. */
  posted_as_club?: boolean | null;
  club_id?: string | null;
  /** Club identity, hydrated by the feed loader when posted_as_club is true. */
  club?: {
    id: string;
    name: string;
    slug: string;
    avatar_url: string | null;
  } | null;
  /** Friends the author tagged on this post, hydrated by the feed loader. */
  tagged?: Array<{
    id: string;
    username: string | null;
    display_name: string | null;
  }> | null;
};

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  parent_id: string | null;
  author?: { display_name: string; username: string; avatar_url: string | null } | null;
  /** True while the comment is still being saved. */
  pending?: boolean;
};

type CommentReactionRow = { comment_id: string; user_id: string; reaction: string };

/** Viewer profiles are reused across cards so opening comments stays instant. */
const viewerCache = new Map<string, { display_name: string; username: string; avatar_url: string | null }>();

const TYPE_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  ace: { label: "Ace!", icon: Target, color: "text-primary" },
  checkin: { label: "Checked in", icon: MapPin, color: "text-accent" },
  roundcard: { label: "Round", icon: Target, color: "text-primary" },
  tournament: { label: "Tournament", icon: Trophy, color: "text-accent" },
  photo: { label: "Photo", icon: Camera, color: "text-muted-foreground" },
  video: { label: "Video", icon: Video, color: "text-muted-foreground" },
  text: { label: "Update", icon: Send, color: "text-muted-foreground" },
};

export function PostCard({
  post,
  currentUserId,
  onChange,
  reason,
}: {
  post: FeedPost;
  currentUserId: string | null;
  onChange?: () => void;
  /** Why this post is in the For You feed, shown under the byline. */
  reason?: string | null;
}) {
  const [saved, setSaved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body ?? "");
  const [body, setBody] = useState(post.body);
  const [deleted, setDeleted] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [viewer, setViewer] = useState<Comment["author"]>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, CommentReactionRow[]>>({});
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({});

  const prefetched = usePrefetchedInteraction(post.id);
  const isOwner = currentUserId === post.author_id;
  const meta = TYPE_META[post.type] ?? TYPE_META.text;
  const Icon = meta.icon;

  useEffect(() => {
    if (!currentUserId) return;
    // Feed pages fetch saves for the whole page; standalone cards ask for their own.
    if (prefetched) {
      setSaved(prefetched.saved);
      return;
    }
    supabase
      .from("post_saves")
      .select("post_id")
      .eq("post_id", post.id)
      .eq("user_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setSaved(!!data));
  }, [post.id, currentUserId, prefetched]);



  async function toggleSave() {
    if (!currentUserId) return toast.error("Sign in to save posts");
    if (saved) {
      setSaved(false);
      const { error } = await supabase
        .from("post_saves")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", currentUserId);
      if (error) {
        setSaved(true);
        toast.error("We couldn't remove that save. Try again.");
      }
    } else {
      setSaved(true);
      const { error } = await supabase
        .from("post_saves")
        .insert({ post_id: post.id, user_id: currentUserId });
      if (error) {
        setSaved(false);
        toast.error("We couldn't save that post. Try again.");
      } else {
        toast.success("Saved to your collection.");
      }
    }
  }

  async function loadComments() {
    const { data } = await supabase
      .from("comments")
      .select("id, body, created_at, author_id, parent_id")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (!data) return;
    const ids = [...new Set(data.map((c) => c.author_id))];
    const commentIds = data.map((c) => c.id);
    if (commentIds.length) {
      const { data: reactionRows } = await supabase
        .from("comment_likes")
        .select("comment_id, user_id, reaction")
        .in("comment_id", commentIds);
      const grouped: Record<string, CommentReactionRow[]> = {};
      for (const row of reactionRows ?? []) {
        (grouped[row.comment_id] ??= []).push(row as CommentReactionRow);
      }
      setCommentReactions(grouped);
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids);
    const map = new Map((profs ?? []).map((p) => [p.id, p]));
    setCommentCount(data.length);
    setComments(
      data.map((c) => ({
        ...c,
        author: map.get(c.author_id) as Comment["author"],
      })),
    );
  }

  async function submitComment(parentId: string | null = null) {
    const raw = parentId ? replyBody : commentBody;
    if (!currentUserId || !raw.trim()) return;
    const body = raw.trim();
    if (parentId) {
      setReplyBody("");
      setReplyToId(null);
    } else {
      setCommentBody("");
    }

    // Show the comment immediately, then swap in the saved row.
    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      body,
      created_at: new Date().toISOString(),
      author_id: currentUserId,
      parent_id: parentId,
      author: viewer,
      pending: true,
    };
    setComments((cs) => [...cs, optimistic]);
    setCommentCount((c) => c + 1);

    const { data: saved, error } = await supabase
      .from("comments")
      .insert({ post_id: post.id, author_id: currentUserId, body, parent_id: parentId })
      .select("id, created_at")
      .maybeSingle();
    if (error) {
      setComments((cs) => cs.filter((c) => c.id !== tempId));
      setCommentCount((c) => Math.max(0, c - 1));
      if (parentId) setReplyBody(body);
      else setCommentBody(body);
      return toast.error("That comment didn't go through. Try again.");
    }
    setComments((cs) =>
      cs.map((c) =>
        c.id === tempId
          ? { ...c, id: saved?.id ?? c.id, created_at: saved?.created_at ?? c.created_at, pending: false }
          : c,
      ),
    );
    const parentAuthorId = parentId ? comments.find((c) => c.id === parentId)?.author_id : null;
    const recipients = [
      ...new Set(
        [post.author_id, parentAuthorId].filter((id): id is string => !!id && id !== currentUserId),
      ),
    ];
    for (const userId of recipients) {
      await supabase.rpc("notify_user", {
        _user_id: userId,
        _type: "comment",
        _post_id: post.id,
      });
      void pushToUser({
        data: {
          userId,
          title: parentId ? "New reply" : "New comment",
          body: body.slice(0, 140),
          url: `/p/${post.id}`,
          tag: `comment:${post.id}`,
        },
      }).catch(() => {});
    }
    onChange?.();
  }

  function openComments() {
    setShowComments(true);
    if (comments.length === 0) void loadComments();
    if (currentUserId && !viewer) {
      const cached = viewerCache.get(currentUserId);
      if (cached) {
        setViewer(cached);
        return;
      }
      void supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", currentUserId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          viewerCache.set(currentUserId, data as NonNullable<Comment["author"]>);
          setViewer(data as NonNullable<Comment["author"]>);
        });
    }
  }

  async function savePostEdit() {
    const next = editBody.trim();
    if (!next) return toast.error("Post cannot be empty");
    const { error } = await supabase.from("posts").update({ body: next }).eq("id", post.id);
    if (error) return toast.error(error.message);
    setBody(next);
    setEditing(false);
    toast.success("Post updated");
    onChange?.();
  }

  async function deletePost() {
    // Best-effort cleanup of any media in storage
    const paths = (post.media ?? []).map((m) => m.path).filter(Boolean);
    if (paths.length)
      await supabase.storage
        .from("posts")
        .remove(paths)
        .catch(() => {});
    const { error } = await supabase.from("posts").delete().eq("id", post.id);
    if (error) return toast.error(error.message);
    setDeleted(true);
    toast.success("Post deleted");
    onChange?.();
  }

  async function saveCommentEdit(id: string) {
    const next = editCommentBody.trim();
    if (!next) return;
    const { error } = await supabase.from("comments").update({ body: next }).eq("id", id);
    if (error) return toast.error(error.message);
    setComments((cs) => cs.map((c) => (c.id === id ? { ...c, body: next } : c)));
    setEditingCommentId(null);
  }

  async function deleteComment(id: string) {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setComments((cs) => cs.filter((c) => c.id !== id));
    setCommentCount((c) => Math.max(0, c - 1));
    onChange?.();
  }

  // While a thread is open, keep it in sync with anyone else commenting on it.
  useEffect(() => {
    if (!showComments) return;
    const channel = supabase
      .channel(`post-comments-${post.id}-${channelNonce()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `post_id=eq.${post.id}` },
        () => {
          void loadComments();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showComments, post.id]);

  const REPLY_PREVIEW = 2;

  function renderComment(c: Comment) {
    const canEdit = currentUserId === c.author_id;
    const canDelete = canEdit || isOwner;
    const isEditingC = editingCommentId === c.id;
    return (
      <div key={c.id} className="group flex gap-2">
        <Avatar className="h-7 w-7">
          {c.author?.avatar_url ? <AvatarImage src={c.author.avatar_url} /> : null}
          <AvatarFallback>{initials(c.author?.display_name)}</AvatarFallback>
        </Avatar>
        <div
          className={
            "min-w-0 flex-1 rounded-lg bg-muted/50 px-3 py-2 " + (c.pending ? "opacity-60" : "")
          }
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold">{c.author?.display_name ?? "Player"}</span>
            <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
            {(canEdit || canDelete) && !isEditingC ? (
              <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                {canEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label="Edit comment"
                    onClick={() => {
                      setEditingCommentId(c.id);
                      setEditCommentBody(c.body);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    aria-label="Delete comment"
                    onClick={() => deleteComment(c.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {isEditingC ? (
            <div className="mt-1">
              <Textarea
                value={editCommentBody}
                onChange={(e) => setEditCommentBody(e.target.value)}
                className="min-h-8 resize-none py-1.5 text-sm"
                autoFocus
              />
              <div className="mt-1 flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setEditingCommentId(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7"
                  onClick={() => saveCommentEdit(c.id)}
                  disabled={!editCommentBody.trim()}
                >
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <PostBody body={c.body} className="text-sm whitespace-pre-wrap" />
              <div className="flex items-center gap-3">
                <CommentReactions
                  commentId={c.id}
                  currentUserId={currentUserId}
                  seed={commentReactions[c.id] ?? []}
                />
                {currentUserId ? (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setReplyToId(c.parent_id ?? c.id);
                      setReplyBody(c.parent_id ? `@${c.author?.username ?? ""} ` : "");
                    }}
                  >
                    Reply
                  </button>
                ) : null}
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  if (deleted) return null;

  const media = post.media ?? [];
  const autoKind = post.score_data?.auto ?? null;
  const autoBadge =
    autoKind === "achievement"
      ? { label: post.score_data?.achievement_name ?? "Achievement", icon: Award }
      : autoKind === "duel"
        ? { label: "Duel win", icon: Swords }
        : null;
  const clubIdentity = post.posted_as_club && post.club ? post.club : null;

  return (
    <article
      data-feed-post
      tabIndex={-1}
      className="overflow-hidden rounded-xl border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Post by ${clubIdentity?.name ?? post.author?.display_name ?? "a player"}`}
    >
      <header className="flex items-center gap-3 p-4 pb-3">
        {clubIdentity ? (
          <Link to="/clubs/$slug" params={{ slug: clubIdentity.slug }} className="shrink-0">
            <Avatar className="h-10 w-10">
              {clubIdentity.avatar_url ? <AvatarImage src={clubIdentity.avatar_url} /> : null}
              <AvatarFallback>{initials(clubIdentity.name)}</AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Link
            to="/u/$username"
            params={{ username: post.author?.username ?? "" }}
            className="shrink-0"
          >
            <Avatar className="h-10 w-10">
              {post.author?.avatar_url ? <AvatarImage src={post.author.avatar_url} /> : null}
              <AvatarFallback>{initials(post.author?.display_name)}</AvatarFallback>
            </Avatar>
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            {clubIdentity ? (
              <>
                <Link
                  to="/clubs/$slug"
                  params={{ slug: clubIdentity.slug }}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {clubIdentity.name}
                </Link>
                <span className="text-xs text-muted-foreground">Club</span>
              </>
            ) : (
              <>
                <Link
                  to="/u/$username"
                  params={{ username: post.author?.username ?? "" }}
                  className="truncate text-sm font-semibold hover:underline"
                >
                  {post.author?.display_name ?? "Player"}
                </Link>
                <span className="text-xs text-muted-foreground">
                  @{post.author?.username ?? "…"}
                </span>
              </>
            )}
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{timeAgo(post.created_at)}</span>
            {post.visibility === "friends" ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title="Friends only"
              >
                <Users className="h-3 w-3" /> Friends
              </span>
            ) : post.visibility === "club" ? (
              <span
                className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                title="Club only"
              >
                <Lock className="h-3 w-3" /> Club
              </span>
            ) : null}
          </div>
          {post.tagged && post.tagged.length ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> with
              {post.tagged.slice(0, 4).map((t, i) => (
                <span key={t.id}>
                  <Link
                    to="/u/$username"
                    params={{ username: t.username ?? "" }}
                    className="font-medium text-foreground hover:underline"
                  >
                    {t.display_name ?? t.username ?? "Player"}
                  </Link>
                  {i < Math.min(post.tagged!.length, 4) - 1 ? "," : ""}
                </span>
              ))}
              {post.tagged.length > 4 ? <span>+{post.tagged.length - 4} more</span> : null}
            </div>
          ) : null}
          {post.location ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {post.location}
            </div>
          ) : null}
          {reason ? (
            <div className="mt-0.5 text-xs text-muted-foreground/90" title="Why you're seeing this">
              {reason}
            </div>
          ) : null}
        </div>
        {autoBadge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-primary">
            <autoBadge.icon className="h-3 w-3" /> {autoBadge.label}
          </span>
        ) : null}
        {post.type !== "text" ? (
          <span
            className={
              "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium " +
              meta.color
            }
          >
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        ) : null}
        {isOwner ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="Post options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setEditBody(body ?? "");
                  setEditing(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this post?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the post, its likes, and comments. This cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deletePost}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <PostModerationMenu
            postId={post.id}
            authorId={post.author_id}
            authorName={post.author?.display_name ?? "this player"}
            currentUserId={currentUserId}
            onHidden={() => setDeleted(true)}
          />
        )}
      </header>

      {editing ? (
        <div className="px-4 pb-3">
          <Textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            className="min-h-20 resize-none"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false);
                setEditBody(body ?? "");
              }}
            >
              <X className="mr-1 h-3 w-3" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={savePostEdit}
              disabled={!editBody.trim() || editBody.trim() === (body ?? "")}
            >
              Save
            </Button>
          </div>
        </div>
      ) : body ? (
        <PostBody body={body} />
      ) : null}

      {post.repost_of ? <QuotedPost postId={post.repost_of} /> : null}

      {post.type === "roundcard" && (post.snapshot || post.score_data) ? (
        <RoundSnapshotCard
          snap={
            post.snapshot ?? {
              course_name: post.course_name,
              total: post.score_data?.total,
              to_par: post.score_data?.to_par,
              rating: post.score_data?.rating,
              holes: post.score_data?.holes,
            }
          }
        />
      ) : null}

      <PostMedia media={media} authorName={post.author?.display_name ?? "a DG Dashboard player"} />

      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <PostReactions
          postId={post.id}
          postAuthorId={post.author_id}
          currentUserId={currentUserId}
          initialCount={post.like_count}
        />
        <Button
          variant="ghost"
          size="sm"
          data-feed-comments
          onClick={openComments}
          className="h-8 gap-1.5"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="text-xs tabular-nums">{commentCount}</span>
        </Button>
        <RepostDialog
          postId={post.repost_of ?? post.id}
          postAuthorId={post.author_id}
          shareCount={post.share_count ?? 0}
          currentUserId={currentUserId}
          onReposted={onChange}
        />
        <ShareSheet postId={post.id} body={body} />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSave}
          className={"ml-auto h-8 " + (saved ? "text-primary" : "")}
        >
          <Bookmark className={"h-4 w-4 " + (saved ? "fill-current" : "")} />
        </Button>
      </div>

      {showComments ? (
        <div className="border-t border-border bg-background/30 px-4 py-3">
          <div className="space-y-3">
            {comments.length === 0 ? (
              <div className="text-xs text-muted-foreground">Be the first to comment.</div>
            ) : (
              comments
                .filter((c) => !c.parent_id)
                .map((c) => (
                  <div key={c.id} className="space-y-2">
                    {renderComment(c)}
                    {(() => {
                      const replies = comments.filter((r) => r.parent_id === c.id);
                      if (replies.length === 0) return null;
                      const expanded = expandedThreads[c.id] === true;
                      const shown = expanded ? replies : replies.slice(-REPLY_PREVIEW);
                      const hidden = replies.length - shown.length;
                      return (
                        <div className="ml-9 space-y-2 border-l border-border/60 pl-3">
                          {hidden > 0 ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-primary hover:underline"
                              onClick={() =>
                                setExpandedThreads((prev) => ({ ...prev, [c.id]: true }))
                              }
                            >
                              {hidden === 1 ? "Load 1 more reply" : `Load ${hidden} more replies`}
                            </button>
                          ) : null}
                          {shown.map((r) => renderComment(r))}
                        </div>
                      );
                    })()}

                    {replyToId === c.id && currentUserId ? (
                      <div className="ml-9 flex gap-2">
                        <Textarea
                          placeholder={`Reply to ${c.author?.display_name ?? "player"}…`}
                          value={replyBody}
                          onChange={(e) => setReplyBody(e.target.value)}
                          className="min-h-8 flex-1 resize-none py-1.5"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                              void submitComment(c.id);
                          }}
                        />
                        <Button
                          size="sm"
                          onClick={() => void submitComment(c.id)}
                          disabled={!replyBody.trim()}
                        >
                          Reply
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
            )}
          </div>
          {currentUserId ? (
            <div className="mt-3 flex gap-2">
              <Textarea
                placeholder="Add a comment…"
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                className="min-h-8 flex-1 resize-none py-1.5"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submitComment();
                }}
              />
              <Button size="sm" onClick={() => void submitComment()} disabled={!commentBody.trim()}>
                Post
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
