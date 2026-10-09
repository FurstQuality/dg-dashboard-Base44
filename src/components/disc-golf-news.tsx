import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Newspaper, PlayCircle, Radio, Trophy } from "lucide-react";
import { getDiscGolfNews, type NewsItem } from "@/lib/disc-golf-news.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "";
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function useNews() {
  const load = useServerFn(getDiscGolfNews);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    const key = "dg-news-cache-v2";
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) setItems(JSON.parse(cached));
    } catch {
      // ignore
    }
    load()
      .then((data) => {
        if (!alive) return;
        setItems(data);
        try {
          sessionStorage.setItem(key, JSON.stringify(data));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!alive) return;
        setItems((prev) => prev ?? []);
      });
    return () => {
      alive = false;
    };
  }, [load]);
  return items;
}

type Filter = "all" | "article" | "video";

export function DiscGolfNewsFeed() {
  const items = useNews();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "all") return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radio className="h-4 w-4" />
          </div>
          <div>
            <div className="font-display text-base font-semibold">Disc Golf Now</div>
            <div className="text-[11px] text-muted-foreground">
              Live news, coverage, and tournament buzz
            </div>
          </div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border text-[11px]">
          {(["all", "video", "article"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "px-2.5 py-1 font-medium capitalize transition-colors",
                filter === k
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {k === "all" ? "All" : k === "video" ? "Videos" : "Articles"}
            </button>
          ))}
        </div>
      </div>

      {filtered === null ? (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          News feeds are unreachable right now. Try again in a bit.
        </div>
      ) : (
        <div className="scrollbar-none flex gap-3 flex-wrap p-4">
          {filtered.slice(0, 12).map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </div>
      )}
    </section>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const Icon = item.kind === "video" ? PlayCircle : Newspaper;
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-border bg-background transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted">
            <Icon className="h-10 w-10 text-muted-foreground/50" />
          </div>
        )}
        <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          <Icon className="h-3 w-3" /> {item.kind === "video" ? "Watch" : "Read"}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
          {item.source} · {timeAgo(item.publishedAt)}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-primary">
          {item.title}
        </h3>
        {item.summary ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{item.summary}</p>
        ) : null}
      </div>
    </a>
  );
}

export function DiscGolfNewsWidget() {
  const items = useNews();
  const [tab, setTab] = useState<"latest" | "video">("latest");

  const filtered = useMemo(() => {
    if (!items) return null;
    if (tab === "video") return items.filter((i) => i.kind === "video").slice(0, 5);
    return items.slice(0, 6);
  }, [items, tab]);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 pt-3 pb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Trophy className="h-4 w-4 text-primary" /> Around the sport
        </div>
        <div className="flex gap-1 text-[10px]">
          {(["latest", "video"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "rounded-md px-2 py-0.5 font-medium transition-colors",
                tab === k
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "latest" ? "Latest" : "Videos"}
            </button>
          ))}
        </div>
      </div>

      {filtered === null ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-4 text-xs text-muted-foreground">Feeds unreachable.</div>
      ) : (
        <ul className="divide-y divide-border/60">
          {filtered.map((n) => (
            <li key={n.id}>
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
              >
                {n.thumbnail ? (
                  <img
                    src={n.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
                    {n.kind === "video" ? (
                      <PlayCircle className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Newspaper className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-xs font-medium leading-snug">{n.title}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {n.source} · {timeAgo(n.publishedAt)}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border/60 p-2">
        <Button variant="ghost" size="sm" className="w-full justify-center text-xs" asChild>
          <a
            href="https://www.pdga.com/tour"
            target="_blank"
            rel="noopener noreferrer"
          >
            Live tournaments <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}
