import * as React from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { tagPlayersOnPost } from "@/lib/post-tags.functions";
import {
  RoundShareDialog,
  type RoundShareSummary,
  type ShareVisibility,
} from "@/components/scoring/round-share-dialog";

type LoadedRound = {
  summary: RoundShareSummary;
  cardmateUserIds: string[];
};

/**
 * Post a completed round to the feed with friend tagging, from anywhere outside
 * the scorer (round history). Makes a skipped post-round share recoverable.
 */
export function RoundPostShareButton({
  roundId,
  layoutId,
  userId,
  courseName,
  className,
}: {
  roundId: string;
  layoutId: string | null;
  userId: string;
  courseName: string | null;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [loaded, setLoaded] = React.useState<LoadedRound | null>(null);
  const [text, setText] = React.useState("");
  const [visibility, setVisibility] = React.useState<ShareVisibility>("friends");
  const [tagIds, setTagIds] = React.useState<string[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [{ data: players }, { data: scores }, holesRes] = await Promise.all([
        supabase.from("round_players").select("id, user_id").eq("round_id", roundId),
        supabase
          .from("round_scores")
          .select("round_player_id, hole_number, strokes")
          .eq("round_id", roundId),
        layoutId
          ? supabase.from("holes").select("number, par").eq("layout_id", layoutId)
          : Promise.resolve({ data: [] as { number: number; par: number }[] }),
      ]);
      const parByHole = new Map(
        ((holesRes.data as { number: number; par: number }[] | null) ?? []).map((h) => [
          h.number,
          h.par,
        ]),
      );
      const rows = (players as { id: string; user_id: string | null }[] | null) ?? [];
      const mine = rows.find((p) => p.user_id === userId);
      const myScores = (
        (scores as { round_player_id: string; hole_number: number; strokes: number }[] | null) ?? []
      ).filter((s) => mine && s.round_player_id === mine.id);

      let total = 0;
      let toPar = 0;
      let birdies = 0;
      let bestHole: { number: number; to_par: number } | null = null;
      for (const s of myScores) {
        const par = parByHole.get(s.hole_number) ?? 3;
        const rel = s.strokes - par;
        total += s.strokes;
        toPar += rel;
        if (rel <= -1) birdies++;
        if (!bestHole || rel < bestHole.to_par) bestHole = { number: s.hole_number, to_par: rel };
      }

      const { data: rating } = await supabase
        .from("round_ratings")
        .select("round_rating")
        .eq("round_id", roundId)
        .eq("user_id", userId)
        .maybeSingle();

      const cardmates = rows
        .map((p) => p.user_id)
        .filter((id): id is string => !!id && id !== userId);

      setLoaded({
        summary: {
          courseName,
          total,
          toPar,
          holes: myScores.length,
          rating:
            (rating as { round_rating: number | null } | null)?.round_rating ?? null,
          birdies,
          bestHole,
        },
        cardmateUserIds: cardmates,
      });
      setTagIds(cardmates);
      setOpen(true);
    } catch (e) {
      toast.error("Couldn't load that round", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function share() {
    if (!loaded || sharing) return;
    setSharing(true);
    try {
      const { summary } = loaded;
      const { data: created, error } = await supabase
        .from("posts")
        .insert({
          author_id: userId,
          body: text.trim() || `Round at ${courseName || "the course"}.`,
          type: "roundcard",
          course_name: courseName,
          round_id: roundId,
          visibility,
          score_data: {
            total: summary.total,
            to_par: summary.toPar,
            rating: summary.rating,
            holes: summary.holes,
          },
          snapshot: {
            course_name: courseName,
            holes: summary.holes,
            total: summary.total,
            to_par: summary.toPar,
            rating: summary.rating,
            birdies: summary.birdies,
            best_hole: summary.bestHole,
          },
        })
        .select("id")
        .single();
      if (error) throw error;

      if (created?.id && tagIds.length) {
        try {
          await tagPlayersOnPost({ data: { postId: created.id, userIds: tagIds } });
        } catch (tagErr) {
          toast.message("Round posted, but tags didn't save", {
            description: (tagErr as Error).message,
          });
        }
      }
      toast.success("Round posted to your feed");
      setOpen(false);
    } catch (e) {
      toast.error("Couldn't post round", { description: (e as Error).message });
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        disabled={loading}
        title="Post round and tag friends"
        aria-label="Post round and tag friends"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void load();
        }}
      >
        <Share2 className="h-4 w-4" />
      </Button>
      <RoundShareDialog
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        summary={loaded?.summary ?? null}
        text={text}
        onTextChange={setText}
        visibility={visibility}
        onVisibilityChange={setVisibility}
        selectedIds={tagIds}
        onToggleId={(id) =>
          setTagIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
        }
        suggestedIds={loaded?.cardmateUserIds ?? []}
        sharing={sharing}
        onShare={share}
        onSkip={() => setOpen(false)}
      />
    </>
  );
}
