import { useEffect, useState } from "react";
import { Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Review = {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  profile?: { username: string; display_name: string; avatar_url: string | null };
};

function Stars({
  value,
  onChange,
  size = 20,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? "transition hover:scale-110" : "cursor-default"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={n <= value ? "fill-primary text-primary" : "text-muted-foreground"}
          />
        </button>
      ))}
    </div>
  );
}

export function CourseReviews({ courseId }: { courseId: string }) {
  const { user } = useSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("course_reviews")
      .select("id, user_id, rating, body, created_at")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false });
    const list = (data as Review[]) ?? [];
    if (list.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in(
          "id",
          list.map((r) => r.user_id),
        );
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      list.forEach((r) => (r.profile = map.get(r.user_id) as any));
    }
    setReviews(list);
    const mine = list.find((r) => r.user_id === user?.id);
    if (mine) {
      setRating(mine.rating);
      setBody(mine.body ?? "");
    }
  }

  useEffect(() => {
    load();
  }, [courseId, user?.id]);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const mine = reviews.find((r) => r.user_id === user?.id);

  async function submit() {
    if (!user) return toast.error("Sign in to review");
    if (rating < 1) return toast.error("Pick a star rating");
    setBusy(true);
    const { error } = await supabase
      .from("course_reviews")
      .upsert(
        { course_id: courseId, user_id: user.id, rating, body: body.trim() || null },
        { onConflict: "course_id,user_id" },
      );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(mine ? "Review updated" : "Review posted");
    load();
  }

  async function remove() {
    if (!mine) return;
    if (!confirm("Delete your review?")) return;
    await supabase.from("course_reviews").delete().eq("id", mine.id);
    setRating(0);
    setBody("");
    load();
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="font-semibold">Reviews</div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Stars value={Math.round(avg)} size={16} />
          <span>
            {avg ? avg.toFixed(1) : "—"} · {reviews.length}
          </span>
        </div>
      </div>

      {user ? (
        <div className="border-b border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">
              {mine ? "Update your review" : "Write a review"}
            </div>
            <Stars value={rating} onChange={setRating} />
          </div>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share what you loved (or didn't) about this course…"
            rows={3}
          />
          <div className="mt-2 flex justify-end gap-2">
            {mine ? (
              <Button variant="outline" size="sm" onClick={remove}>
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={submit}>
              {mine ? "Save" : "Post review"}
            </Button>
          </div>
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          No reviews on this course yet — share your take to help the next player show up prepared.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {reviews.map((r) => (
            <div key={r.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{r.profile?.display_name ?? "Player"}</div>
                <Stars value={r.rating} size={14} />
              </div>
              <div className="text-xs text-muted-foreground">
                @{r.profile?.username} · {new Date(r.created_at).toLocaleDateString()}
              </div>
              {r.body ? <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
