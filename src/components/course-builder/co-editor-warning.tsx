import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Peer = { userId: string; name: string };

/** Shows a notice when another signed-in player has the same course open in the builder. */
export function CoEditorWarning({
  courseId,
  userId,
  name,
}: {
  courseId?: string;
  userId?: string;
  name?: string;
}) {
  const [peers, setPeers] = useState<Peer[]>([]);

  useEffect(() => {
    if (!courseId || !userId) return;
    const channel = supabase.channel(`course-builder:${courseId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId: string; name: string }>();
        const others: Peer[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === userId) continue;
          const m = metas[0];
          if (m) others.push({ userId: key, name: m.name || "Another player" });
        }
        setPeers(others);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ userId, name: name ?? "" });
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [courseId, userId, name]);

  if (peers.length === 0) return null;
  const who =
    peers.length === 1 ? peers[0].name : `${peers[0].name} and ${peers.length - 1} other${peers.length > 2 ? "s" : ""}`;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-sm text-foreground"
    >
      <Users className="h-4 w-4 shrink-0 text-warning" />
      <span>
        {who} {peers.length === 1 ? "is" : "are"} editing this course right now. Changes may overlap — check before you save.
      </span>
    </div>
  );
}
