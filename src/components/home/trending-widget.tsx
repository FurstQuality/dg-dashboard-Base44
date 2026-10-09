import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, Hash, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

export type TrendingRow = {
  body: string | null;
  course_name: string | null;
  like_count: number | null;
  comment_count: number | null;
};

export type TrendingResult = {
  tags: { tag: string; count: number }[];
  courses: { name: string; count: number }[];
};

/**
 * Pure aggregation over recent posts — kept separate from fetching so it can be tested.
 * Tags come from hashtags in post bodies; courses from tagged course names.
 */
export function computeTrending(rows: TrendingRow[], limit = 5): TrendingResult {
  const tagCounts = new Map<string, number>();
  const courseCounts = new Map<string, number>();

  for (const row of rows) {
    const weight = 1 + Math.min(5, (row.like_count ?? 0) + (row.comment_count ?? 0));
    for (const match of (row.body ?? "").matchAll(/#([a-z0-9_]{2,30})/gi)) {
      const tag = match[1].toLowerCase();
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + weight);
    }
    const course = row.course_name?.trim();
    if (course) courseCounts.set(course, (courseCounts.get(course) ?? 0) + weight);
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);

  return {
    tags: rank(tagCounts).map(([tag, count]) => ({ tag, count })),
    courses: rank(courseCounts).map(([name, count]) => ({ name, count })),
  };
}

/** Right-rail widget: what the community is talking about and playing this week. */
export function TrendingWidget() {
  const [data, setData] = useState<TrendingResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("posts")
      .select("body, course_name, like_count, comment_count")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data: rows }) => {
        if (cancelled) return;
        setData(computeTrending((rows ?? []) as TrendingRow[]));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null) return <Skeleton className="h-32 w-full rounded-2xl" />;
  if (data.tags.length === 0 && data.courses.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Flame className="h-3.5 w-3.5" /> Trending this week
      </h3>
      <p className="mb-2 text-[12px] leading-snug text-muted-foreground">
        Hashtags and courses mentioned most in feed posts from the last seven days, weighted by
        likes and comments.
      </p>
      {data.tags.length ? (
        <ul className="space-y-1">
          {data.tags.map((t) => (
            <li key={t.tag}>
              <Link
                to="/tag/$tag"
                params={{ tag: t.tag }}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
              >
                <Hash className="h-3.5 w-3.5 text-primary" />
                <span className="truncate">{t.tag}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {data.courses.length ? (
        <>
          <h4 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Courses in play
          </h4>
          <ul className="space-y-1">
            {data.courses.map((c) => (
              <li key={c.name} className="flex items-center gap-1.5 px-1.5 py-0.5 text-sm">
                <MapPin className="h-3.5 w-3.5 text-accent" />
                <span className="truncate">{c.name}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
