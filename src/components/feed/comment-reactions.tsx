import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const OPTIONS = [
  { key: "like", emoji: "👍" },
  { key: "fire", emoji: "🔥" },
  { key: "laugh", emoji: "😂" },
] as const;

type Row = { comment_id: string; user_id: string; reaction: string };

/** Small reaction control under a comment. Counts load with the thread. */
export function CommentReactions({
  commentId,
  currentUserId,
  seed,
}: {
  commentId: string;
  currentUserId: string | null;
  seed?: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(seed ?? []);

  useEffect(() => {
    if (seed) setRows(seed);
  }, [seed]);

  const mine = currentUserId ? rows.find((r) => r.user_id === currentUserId)?.reaction : undefined;
  const total = rows.length;

  async function react(reaction: string) {
    if (!currentUserId) return toast.error("Sign in to react");
    if (commentId.startsWith("temp-")) return;
    const previous = rows;
    if (mine === reaction) {
      setRows(rows.filter((r) => r.user_id !== currentUserId));
      const { error } = await supabase
        .from("comment_likes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", currentUserId);
      if (error) setRows(previous);
      return;
    }
    setRows([
      ...rows.filter((r) => r.user_id !== currentUserId),
      { comment_id: commentId, user_id: currentUserId, reaction },
    ]);
    const { error } = await supabase
      .from("comment_likes")
      .upsert(
        { comment_id: commentId, user_id: currentUserId, reaction },
        { onConflict: "comment_id,user_id" },
      );
    if (error) {
      setRows(previous);
      toast.error("That reaction didn't stick.");
    }
  }

  const shown = [...new Set(rows.map((r) => r.reaction))].slice(0, 3);

  return (
    <div className="mt-1 flex items-center gap-1">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => void react(o.key)}
          aria-label={`React ${o.emoji}`}
          className={
            "rounded-full px-1.5 text-sm leading-none transition hover:bg-muted " +
            (mine === o.key ? "bg-primary/15" : "opacity-60 hover:opacity-100")
          }
        >
          {o.emoji}
        </button>
      ))}
      {total > 0 ? (
        <span className="ml-0.5 text-[11px] tabular-nums text-muted-foreground">
          {shown.join("")} {total}
        </span>
      ) : null}
    </div>
  );
}
