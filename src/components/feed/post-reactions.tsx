import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { pushToUser } from "@/lib/push.functions";
import { usePrefetchedInteraction } from "@/components/feed/feed-interactions";

export const REACTIONS = [
  { key: "like", emoji: "👍", label: "Like" },
  { key: "fire", emoji: "🔥", label: "Fire" },
  { key: "disc", emoji: "🥏", label: "Nice disc" },
  { key: "chains", emoji: "🎯", label: "Chains" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
] as const;

export type ReactionKey = (typeof REACTIONS)[number]["key"];

type Counts = Record<string, number>;

export function PostReactions({
  postId,
  postAuthorId,
  currentUserId,
  initialCount,
}: {
  postId: string;
  postAuthorId: string;
  currentUserId: string | null;
  initialCount: number;
}) {
  const prefetched = usePrefetchedInteraction(postId);
  const [mine, setMine] = useState<ReactionKey | null>(null);
  const [counts, setCounts] = useState<Counts>({});
  const [total, setTotal] = useState(initialCount);
  const [showPicker, setShowPicker] = useState(false);

  // Feed pages hand us reactions for every card at once; standalone cards fetch their own.
  useEffect(() => {
    if (prefetched) {
      setCounts(prefetched.counts);
      setTotal(prefetched.total);
      setMine((prefetched.mine as ReactionKey | null) ?? null);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, currentUserId, prefetched]);

  async function load() {
    const { data } = await supabase
      .from("post_likes")
      .select("reaction, user_id")
      .eq("post_id", postId);
    if (!data) return;
    const map: Counts = {};
    for (const row of data) {
      const key = (row as { reaction?: string }).reaction ?? "like";
      map[key] = (map[key] ?? 0) + 1;
    }
    setCounts(map);
    setTotal(data.length);
    if (currentUserId) {
      const mineRow = data.find((r) => (r as { user_id: string }).user_id === currentUserId) as
        | { reaction?: string }
        | undefined;
      setMine((mineRow?.reaction as ReactionKey) ?? null);
    }
  }


  async function pick(reaction: ReactionKey) {
    if (!currentUserId) {
      toast.error("Sign in to react");
      return;
    }
    setShowPicker(false);
    const wasMine = mine;

    if (wasMine === reaction) {
      // toggle off
      setMine(null);
      setCounts((c) => ({ ...c, [reaction]: Math.max(0, (c[reaction] ?? 1) - 1) }));
      setTotal((t) => Math.max(0, t - 1));
      await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUserId);
      return;
    }

    // optimistic
    setMine(reaction);
    setCounts((c) => {
      const next = { ...c };
      if (wasMine) next[wasMine] = Math.max(0, (next[wasMine] ?? 1) - 1);
      next[reaction] = (next[reaction] ?? 0) + 1;
      return next;
    });
    if (!wasMine) setTotal((t) => t + 1);

    // upsert reaction: pk is (post_id, user_id), so update reaction if row exists, else insert
    const { error } = await supabase
      .from("post_likes")
      .upsert(
        { post_id: postId, user_id: currentUserId, reaction },
        { onConflict: "post_id,user_id" },
      );
    if (error) {
      toast.error(error.message);
      void load();
      return;
    }
    if (!wasMine && postAuthorId !== currentUserId) {
      await supabase.rpc("notify_user", {
        _user_id: postAuthorId,
        _type: "like",
        _post_id: postId,
      });
      void pushToUser({
        data: {
          userId: postAuthorId,
          title: "New reaction",
          body: `Someone reacted ${REACTIONS.find((r) => r.key === reaction)?.emoji ?? "👍"} to your post`,
          url: `/p/${postId}`,
          tag: `react:${postId}`,
        },
      }).catch(() => {});
    }
  }

  const mineMeta = REACTIONS.find((r) => r.key === mine);
  const topReactions = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="relative">
      <button
        type="button"
        data-feed-react
        onClick={() => pick(mine ?? "like")}
        onContextMenu={(e) => {
          e.preventDefault();
          setShowPicker((s) => !s);
        }}
        onDoubleClick={() => setShowPicker(true)}
        className={
          "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition hover:bg-muted " +
          (mine ? "text-primary" : "text-muted-foreground")
        }
        aria-label={mine ? `Reacted ${mineMeta?.label}` : "React"}
      >
        <span className="text-base leading-none">{mineMeta?.emoji ?? "👍"}</span>
        {topReactions.length > 0 ? (
          <span className="flex items-center gap-0.5 tabular-nums">
            {topReactions.map(([k]) => {
              const meta = REACTIONS.find((r) => r.key === k);
              return meta ? (
                <span key={k} className="text-sm leading-none">
                  {meta.emoji}
                </span>
              ) : null;
            })}
            <span className="ml-1">{total}</span>
          </span>
        ) : (
          <span>React</span>
        )}
      </button>
      <button
        type="button"
        aria-label="Choose reaction"
        onClick={() => setShowPicker((s) => !s)}
        className="ml-0.5 inline-flex h-8 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <span className="text-xs">▾</span>
      </button>

      {showPicker ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} aria-hidden />
          <div className="absolute bottom-full left-0 z-50 mb-1 flex items-center gap-1 rounded-full border border-border bg-popover p-1 shadow-lg">
            {REACTIONS.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => pick(r.key)}
                title={r.label}
                className={
                  "flex h-9 w-9 items-center justify-center rounded-full text-xl transition motion-safe:hover:scale-125 " +
                  (mine === r.key ? "bg-primary/15" : "hover:bg-muted")
                }
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
