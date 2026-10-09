import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { matchesOmnisearch } from "@/lib/omnisearch";
import {
  Sparkles,
  CheckCircle2,
  Coins,
  Target,
  Clock,
  TrendingUp,
  Trophy,
  Lock,
  Search,
  Users,
  Hammer,
  Flag,
  Medal,
  Award,
  Crown,
  Star,
  Flame,
  ListOrdered,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TIER_STYLES, CATEGORY_LABEL, levelProgress, levelTitle } from "@/lib/gamification-utils";
import { toast } from "sonner";
import { getProgressHub, type ProgressHubData } from "@/lib/progress-hub.functions";
import { PROGRESS_STALE, progressKeys } from "@/lib/progress-queries";

/**
 * Progress hub shown inside a player's profile: level & XP, badges, the
 * Trophy Shelf of real PDGA finishes, community rankings, and — for your own
 * profile — the active quest rotation.
 */
export function ProgressHub({
  username,
  displayName,
}: {
  username: string;
  displayName?: string | null;
}) {
  const fetchHub = useServerFn(getProgressHub);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: progressKeys.hub(username),
    queryFn: () => fetchHub({ data: { username } }),
    staleTime: PROGRESS_STALE.hub,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center"
      >
        <p className="text-sm font-semibold">We couldn't load these trophies</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Nothing was lost — the badges and finishes just didn't come through.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Try again
        </Button>
      </div>
    );
  }

  const isSelf = data.isSelf;
  const who = isSelf ? "you" : (displayName ?? `@${username}`);

  return (
    <div className="space-y-8">
      <OverviewPanel data={data} who={who} />

      {isSelf ? (
        <HubSection icon={Target} title="Quests">
          <QuestsPanel />
        </HubSection>
      ) : null}

      <HubSection icon={Award} title="Badges">
        <BadgesPanel data={data} />
      </HubSection>

      <HubSection icon={Crown} title="Trophy shelf">
        <TrophyShelf data={data} />
      </HubSection>

      <HubSection icon={ListOrdered} title="Rankings">
        <RankingsPanel />
      </HubSection>
    </div>
  );
}

function HubSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Trophy;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 border-b border-border pb-2 font-display text-lg font-semibold">
        <Icon className="h-5 w-5 text-primary" /> {title}
      </h3>
      {children}
    </section>
  );
}


/* ─────────────────────────────── Overview ─────────────────────────────── */

function OverviewPanel({ data, who }: { data: ProgressHubData; who: string }) {
  const { progress, counts, isSelf } = data;

  if (!progress) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        This player keeps their level and XP private.
      </div>
    );
  }

  const lp = levelProgress(progress.xp);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-primary/40 bg-primary/15 text-2xl font-bold tabular-nums text-primary">
            {lp.level}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Level {lp.level} · {progress.title || levelTitle(lp.level)}
            </div>
            <div className="mt-0.5 text-lg font-semibold">{progress.xp.toLocaleString()} XP</div>
            <div className="mt-2">
              <Progress value={lp.pct} className="h-2" />
              <div className="mt-1 flex justify-between text-[11px] tabular-nums text-muted-foreground">
                <span>
                  {lp.into} / {lp.span} to Lv {lp.level + 1}
                </span>
                <span>{Math.round(lp.pct)}%</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isSelf ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
                <div className="flex items-center gap-1 text-amber-500">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="text-lg font-bold tabular-nums">{progress.coins}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Coins
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-center">
              <div className="flex items-center gap-1 text-orange-500">
                <Flame className="h-3.5 w-3.5" />
                <span className="text-lg font-bold tabular-nums">{progress.streak_days}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Day streak
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Award}
          label="Badges"
          value={`${counts.badgesEarned} / ${counts.badgesTotal}`}
          sub="In-app achievements unlocked"
          tint="text-primary border-primary/30 bg-primary/10"
        />
        <StatCard
          icon={Target}
          label={isSelf ? "Active quests" : "Quests completed"}
          value={(isSelf ? counts.questsActive : counts.questsDone).toString()}
          sub={isSelf ? `${counts.questsDone} completed all-time` : "All-time quest finishes"}
          tint="text-sky-500 border-sky-500/30 bg-sky-500/10"
        />
        <StatCard
          icon={Flag}
          label="Rounds logged"
          value={counts.rounds.toString()}
          sub="Every round levels you up"
          tint="text-emerald-500 border-emerald-500/30 bg-emerald-500/10"
        />
        <StatCard
          icon={Crown}
          label="PDGA wins"
          value={counts.wins.toString()}
          sub="Sanctioned event 1st places"
          tint="text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
        />
      </div>

      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How progression works</p>
        <p className="mt-1">
          Rounds, hosted events, course builds, and community activity all earn XP for {who}. XP
          raises the level, unlocks badges, and progresses quests. Real PDGA finishes fill the Trophy
          Shelf automatically once a PDGA number is linked.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof Trophy;
  label: string;
  value: string;
  sub: string;
  tint: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${tint}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}
/* ─────────────────────────────── Quests ─────────────────────────────── */

type C = {
  id: string;
  key: string;
  title: string;
  description: string;
  kind: "daily" | "weekly" | "seasonal";
  goal_target: number;
  xp_reward: number;
  coin_reward: number;
  ends_at: string | null;
};

function formatCountdown(ends: string | null): string | null {
  if (!ends) return null;
  const diff = new Date(ends).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${mins}m left`;
}

function QuestsPanel() {
  const { user } = useSession();
  const questsQ = useQuery({
    queryKey: progressKeys.quests(user?.id),
    staleTime: PROGRESS_STALE.quests,
    queryFn: async (): Promise<{
      challenges: C[];
      progressMap: Record<string, { progress: number; completed: boolean }>;
    }> => {
      const { data, error } = await supabase
        .from("challenges")
        .select(
          "id, key, title, description, kind, goal_target, xp_reward, coin_reward, ends_at, starts_at, active",
        )
        .eq("active", true)
        .order("kind");
      if (error) throw error;
      const now = new Date();
      const filtered = (data ?? []).filter(
        (c) =>
          (!c.ends_at || new Date(c.ends_at) > now) &&
          (!c.starts_at || new Date(c.starts_at) <= now),
      ) as C[];
      const map: Record<string, { progress: number; completed: boolean }> = {};
      if (user?.id && filtered.length) {
        const { data: prog } = await supabase
          .from("user_challenge_progress")
          .select("challenge_id, progress, completed_at")
          .eq("user_id", user.id)
          .in(
            "challenge_id",
            filtered.map((c) => c.id),
          );
        prog?.forEach(
          (p) => (map[p.challenge_id] = { progress: p.progress, completed: !!p.completed_at }),
        );
      }
      return { challenges: filtered, progressMap: map };
    },
  });
  const challenges = questsQ.data?.challenges ?? [];
  const progressMap = questsQ.data?.progressMap ?? {};
  const loading = questsQ.isPending;

  const grouped = useMemo(
    () => ({
      daily: challenges.filter((c) => c.kind === "daily"),
      weekly: challenges.filter((c) => c.kind === "weekly"),
      seasonal: challenges.filter((c) => c.kind === "seasonal"),
    }),
    [challenges],
  );

  const summary = useMemo(() => {
    let done = 0,
      inProgress = 0,
      xpAvail = 0,
      xpEarned = 0;
    challenges.forEach((c) => {
      const p = progressMap[c.id];
      xpAvail += c.xp_reward;
      if (p?.completed) {
        done += 1;
        xpEarned += c.xp_reward;
      } else if ((p?.progress ?? 0) > 0) inProgress += 1;
    });
    return { total: challenges.length, done, inProgress, xpAvail, xpEarned };
  }, [challenges, progressMap]);

  const summaryPct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {!loading && summary.total > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Completed</div>
            <div className="mt-1 flex items-baseline gap-1 tabular-nums">
              <span className="text-2xl font-semibold">{summary.done}</span>
              <span className="text-sm text-muted-foreground">/ {summary.total}</span>
            </div>
            <Progress value={summaryPct} className="mt-2 h-1.5" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">In progress</div>
            <div className="mt-1 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-sky-500" />
              <span className="text-2xl font-semibold tabular-nums">{summary.inProgress}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Keep chipping away</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">XP earned</div>
            <div className="mt-1 flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-2xl font-semibold tabular-nums">
                {summary.xpEarned.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Locked in this rotation</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Still on the table
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-amber-500" />
              <span className="text-2xl font-semibold tabular-nums">
                {(summary.xpAvail - summary.xpEarned).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">XP left to grab</div>
          </div>
        </div>
      ) : null}

      {(["daily", "weekly", "seasonal"] as const).map((k) => (
        <section key={k} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {k} quests{grouped[k].length ? ` · ${grouped[k].length}` : ""}
          </h4>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          ) : grouped[k].length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No active {k} quests right now. Fresh goals rotate in automatically.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {grouped[k].map((c) => {
                const p = progressMap[c.id];
                const current = Math.min(p?.progress ?? 0, c.goal_target);
                const pct = p ? Math.min(100, (p.progress / c.goal_target) * 100) : 0;
                const done = p?.completed ?? false;
                const countdown = formatCountdown(c.ends_at);
                return (
                  <div
                    key={c.id}
                    className={
                      "rounded-xl border p-4 transition " +
                      (done
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-border bg-card hover:border-primary/40")
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{c.title}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{c.description}</div>
                      </div>
                      {done ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" /> Done
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground tabular-nums">
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs tabular-nums">
                        <span className="text-muted-foreground">Progress</span>
                        <span>
                          {current}/{c.goal_target}
                        </span>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> +{c.xp_reward} XP
                      </span>
                      {c.coin_reward > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Coins className="h-3.5 w-3.5 text-amber-500" /> +{c.coin_reward}
                        </span>
                      ) : null}
                      {countdown ? (
                        <span className="ml-auto inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" /> {countdown}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

    </div>
  );
}

/* ─────────────────────────────── Badges ─────────────────────────────── */

/** Copy a shareable line for one badge to the clipboard. */
async function shareBadge(a: ProgressHubData["badges"][number]) {
  const text = `I just unlocked "${a.name}" (${a.tier}) on DG Dashboard — ${a.description}`;
  const url = typeof window === "undefined" ? "" : window.location.href;
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title: a.name, text, url });
      return;
    }
    await navigator.clipboard.writeText(`${text} ${url}`.trim());
    toast.success("Badge copied — paste it anywhere you like.");
  } catch {
    toast.error("Couldn't share that badge just now. Try again in a moment.");
  }
}

const TIER_ORDER = ["bronze", "silver", "gold", "platinum"] as const;
const TIERS: readonly ("all" | (typeof TIER_ORDER)[number])[] = ["all", ...TIER_ORDER];

function BadgesPanel({ data }: { data: ProgressHubData }) {
  const items = data.badges;
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<(typeof TIERS)[number]>("all");
  const [showLocked, setShowLocked] = useState(data.isSelf);

  const stats = useMemo(() => {
    const total = items.length;
    const earned = items.filter((a) => a.earned_at).length;
    const xp = items.reduce((s, a) => (a.earned_at ? s + (a.xp_reward ?? 0) : s), 0);
    const byTier: Record<string, { earned: number; total: number }> = {};
    TIER_ORDER.forEach((t) => (byTier[t] = { earned: 0, total: 0 }));
    items.forEach((a) => {
      const t = byTier[a.tier];
      if (!t) return;
      t.total += 1;
      if (a.earned_at) t.earned += 1;
    });
    return { total, earned, xp, byTier };
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((a) => {
      if (!showLocked && !a.earned_at) return false;
      if (tierFilter !== "all" && a.tier !== tierFilter) return false;
      return matchesOmnisearch(a, q);
    });
  }, [items, query, tierFilter, showLocked]);

  const grouped = useMemo(() => {
    const g: Record<string, ProgressHubData["badges"]> = {};
    filtered.forEach((a) => {
      (g[a.category] ??= []).push(a);
    });
    return g;
  }, [filtered]);

  const recent = useMemo(
    () =>
      items
        .filter((a) => a.earned_at)
        .sort((a, b) => (a.earned_at! < b.earned_at! ? 1 : -1))
        .slice(0, 6),
    [items],
  );

  /** Where this badge sits in its category ladder — real counts, no guessing. */
  const ladder = useMemo(() => {
    const m = new Map<string, { earned: number; total: number }>();
    items.forEach((a) => {
      const k = `${a.category}:${a.tier}`;
      const cur = m.get(k) ?? { earned: 0, total: 0 };
      cur.total += 1;
      if (a.earned_at) cur.earned += 1;
      m.set(k, cur);
    });
    return m;
  }, [items]);

  const completionPct = stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) : 0;

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Award className="mx-auto mb-2 h-8 w-8 opacity-60" />
        <p className="font-medium text-foreground">No badges to show</p>
        <p className="mt-1">This player keeps their badge case private.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Overall</div>
          <div className="mt-1 flex items-baseline gap-1 tabular-nums">
            <span className="text-2xl font-semibold">{stats.earned}</span>
            <span className="text-sm text-muted-foreground">/ {stats.total}</span>
          </div>
          <Progress value={completionPct} className="mt-2 h-1.5" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            XP from badges
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-2xl font-semibold tabular-nums">
              {stats.xp.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">From unlocked trophies</div>
        </div>
        {TIER_ORDER.slice(2).map((t) => {
          const b = stats.byTier[t];
          const pct = b.total > 0 ? Math.round((b.earned / b.total) * 100) : 0;
          return (
            <div key={t} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{t}</div>
                <span
                  className={
                    "rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wide " +
                    (TIER_STYLES[t] ?? "")
                  }
                >
                  {pct}%
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                <span className="text-2xl font-semibold">{b.earned}</span>
                <span className="text-sm text-muted-foreground">/ {b.total}</span>
              </div>
              <Progress value={pct} className="mt-2 h-1.5" />
            </div>
          );
        })}
      </div>

      {recent.length ? (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Recently earned
          </div>
          <div className="flex gap-2 flex-wrap pb-1">
            {recent.map((a) => (
              <div
                key={a.key}
                className="min-w-[180px] shrink-0 rounded-lg border border-border p-2.5"
              >
                <div className="truncate text-xs font-semibold">{a.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(a.earned_at as string).toLocaleDateString()} · +{a.xp_reward} XP
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search badges…"
            className="pl-9"
            aria-label="Search badges"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTierFilter(t)}
              className={
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition " +
                (tierFilter === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={(e) => setShowLocked(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Show locked
        </label>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing matches those filters. Try clearing your search or showing locked badges.
        </div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => {
          const catEarned = list.filter((a) => a.earned_at).length;
          return (
            <section key={cat}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABEL[cat] ?? cat}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {catEarned} / {list.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {list.map((a) => {
                  const earnedAt = a.earned_at;
                  const earned = !!earnedAt;
                  return (
                    <div
                      key={a.key}
                      className={
                        "relative rounded-xl border p-4 transition " +
                        (earned
                          ? "border-border bg-card hover:border-primary/40"
                          : "border-dashed border-border bg-muted/30 opacity-70")
                      }
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={
                            "grid h-11 w-11 place-items-center rounded-lg border " +
                            (earned
                              ? (TIER_STYLES[a.tier] ?? "")
                              : "bg-muted text-muted-foreground border-border")
                          }
                        >
                          {earned ? <Trophy className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{a.name}</div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {a.description}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide">
                            <span
                              className={
                                "rounded-full border px-1.5 py-0.5 " + (TIER_STYLES[a.tier] ?? "")
                              }
                            >
                              {a.tier}
                            </span>
                            <span className="text-muted-foreground">+{a.xp_reward} XP</span>
                            {earned && earnedAt ? (
                              <span className="normal-case tracking-normal text-emerald-600">
                                Unlocked {new Date(earnedAt).toLocaleDateString()}
                              </span>
                            ) : null}
                          </div>
                          {!earned ? (
                            <p className="mt-1.5 text-[11px] normal-case tracking-normal text-muted-foreground">
                              {(() => {
                                const l = ladder.get(`${a.category}:${a.tier}`);
                                if (!l) return "Not earned yet";
                                return `${l.earned} of ${l.total} ${a.tier} ${CATEGORY_LABEL[a.category] ?? a.category} badges earned`;
                              })()}
                            </p>
                          ) : null}
                          {earned && data.isSelf ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-1.5 h-7 px-2 text-[11px]"
                              onClick={() => void shareBadge(a)}
                            >
                              Share this badge
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

/* ─────────────────────────────── Trophy Shelf ─────────────────────────────── */

type Finish = ProgressHubData["trophies"][number];

const MEDAL_STYLES: Record<number, string> = {
  1: "bg-gradient-to-br from-yellow-400/30 to-yellow-600/10 border-yellow-500/50 text-yellow-500",
  2: "bg-gradient-to-br from-slate-300/25 to-slate-500/10 border-slate-400/50 text-slate-300",
  3: "bg-gradient-to-br from-amber-600/25 to-amber-800/10 border-amber-700/50 text-amber-600",
};

function TrophyShelf({ data }: { data: ProgressHubData }) {
  const rows = data.trophies;

  if (!data.pdgaLinked) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Crown className="mx-auto mb-2 h-8 w-8 opacity-60" />
        <p className="font-medium text-foreground">
          {data.isSelf
            ? "Link your PDGA number to unlock your Trophy Shelf"
            : "No PDGA record linked to this profile"}
        </p>
        <p className="mt-1">
          {data.isSelf
            ? "We'll pull every sanctioned podium finish from your PDGA record — wins, 2nds, and 3rds across every tier you've competed in."
            : "Once a PDGA number is linked and public, sanctioned podium finishes show up here."}
        </p>
        {data.isSelf ? (
          <Button asChild className="mt-4" size="sm">
            <Link to="/settings">Link PDGA number</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const wins = rows.filter((f) => f.place === 1);
  const seconds = rows.filter((f) => f.place === 2);
  const thirds = rows.filter((f) => f.place === 3);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <Crown className="mx-auto mb-2 h-8 w-8 opacity-60" />
        <p className="font-medium text-foreground">No podium finishes yet</p>
        <p className="mt-1">
          Wins, 2nds, and 3rds from sanctioned PDGA events show up here as the record grows. In-app
          tournament and league wins appear here once results are finalized.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <ShelfStat
          icon={Crown}
          label="Wins"
          value={wins.length}
          tint="text-yellow-500 border-yellow-500/40 bg-yellow-500/10"
        />
        <ShelfStat
          icon={Medal}
          label="Silvers"
          value={seconds.length}
          tint="text-slate-300 border-slate-400/40 bg-slate-400/10"
        />
        <ShelfStat
          icon={Star}
          label="Bronzes"
          value={thirds.length}
          tint="text-amber-600 border-amber-700/40 bg-amber-700/10"
        />
      </div>
      <TrophyGroup
        title="Wins"
        icon={Crown}
        finishes={wins}
        emptyLabel="The first sanctioned win will land here."
      />
      <TrophyGroup
        title="Podiums"
        icon={Medal}
        finishes={[...seconds, ...thirds]}
        emptyLabel="Podium finishes (2nd–3rd) will land here."
      />
      <p className="rounded-lg border border-dashed border-border/50 bg-muted/30 p-3 text-[11px] text-muted-foreground">
        Trophies are pulled from the linked PDGA record (place 1–3 in sanctioned events). In-app
        tournaments and leagues also appear here once TDs finalize results.
      </p>
    </div>
  );
}

function ShelfStat({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Crown;
  label: string;
  value: number;
  tint: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${tint}`}>
      <Icon className="h-6 w-6" />
      <div>
        <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function TrophyGroup({
  title,
  icon: Icon,
  finishes,
  emptyLabel,
}: {
  title: string;
  icon: typeof Crown;
  finishes: Finish[];
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">· {finishes.length}</span>
      </div>
      {finishes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {finishes.map((f, i) => {
            const dateLabel = f.event_date
              ? new Date(f.event_date + "T00:00:00").toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })
              : "—";
            const placeStyle =
              f.place === 1 ? MEDAL_STYLES[1] : f.place === 2 ? MEDAL_STYLES[2] : MEDAL_STYLES[3];
            return (
              <li
                key={(f.event_ref ?? "") + f.event_name + i}
                className="flex items-center gap-3 p-3"
              >
                <div
                  className={
                    "grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-xs font-bold tabular-nums " +
                    placeStyle
                  }
                >
                  {f.place}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{f.event_name}</span>
                    {f.tier ? (
                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                        {f.tier}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dateLabel}
                    {f.division ? ` · ${f.division}` : ""}
                    {f.field_size ? ` · field of ${f.field_size}` : ""}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
/* ─────────────────────────────── Rankings ─────────────────────────────── */

type Profile = { id: string; username: string; display_name: string; avatar_url: string | null };
type Row = { user_id: string; label: string; sub?: string; profile?: Profile | null };

async function hydrateProfiles(ids: string[]): Promise<Map<string, Profile>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", ids);
  return new Map((data ?? []).map((p) => [p.id, p as Profile]));
}

const RANKING_BOARDS = [
  { key: "xp", label: "All-time XP", icon: Sparkles },
  { key: "week", label: "This week", icon: Sparkles },
  { key: "rounds", label: "Rounds", icon: Flag },
  { key: "aces", label: "Aces", icon: Target },
  { key: "community", label: "Community", icon: Users },
  { key: "builders", label: "Builders", icon: Hammer },
] as const;

function RankingsPanel() {
  const [board, setBoard] = useState<(typeof RANKING_BOARDS)[number]["key"]>("xp");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
        {RANKING_BOARDS.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBoard(b.key)}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition " +
                (board === b.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-3.5 w-3.5" /> {b.label}
            </button>
          );
        })}
      </div>
      {board === "xp" ? <XpBoard mode="all" /> : null}
      {board === "week" ? <XpBoard mode="week" /> : null}
      {board === "rounds" ? <RoundsBoard /> : null}
      {board === "aces" ? <AcesBoard /> : null}
      {board === "community" ? <CommunityBoard /> : null}
      {board === "builders" ? <BuildersBoard /> : null}
    </div>
  );
}


function XpBoard({ mode }: { mode: "all" | "week" }) {
  const { user } = useSession();
  const q = useQuery({
    queryKey: progressKeys.xpBoard(mode),
    staleTime: PROGRESS_STALE.boards,
    queryFn: async (): Promise<Row[]> => {
      let req = supabase.from("user_progress").select("user_id, xp, level, title, updated_at");
      if (mode === "week") {
        const since = new Date(Date.now() - 7 * 86400_000).toISOString();
        req = req.gt("updated_at", since);
      }
      const { data, error } = await req.order("xp", { ascending: false }).limit(50);
      if (error) throw error;
      const progress = data ?? [];
      const profMap = await hydrateProfiles(progress.map((r) => r.user_id));
      return progress.map((r) => ({
        user_id: r.user_id,
        label: `${r.xp.toLocaleString()} XP`,
        sub: mode === "all" ? `Lv ${r.level} · ${r.title}` : "Active this week",
        profile: profMap.get(r.user_id) ?? null,
      }));
    },
  });
  return (
    <BoardList
      rows={q.data ?? (q.isError ? [] : null)}
      currentUserId={user?.id}
      emptyLabel={
        q.isError
          ? "This board didn't load — try switching tabs and back."
          : "Quiet on the leaderboard for now — log a round to get things moving."
      }
    />
  );
}

function RoundsBoard() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: progressKeys.roundsBoard(),
    staleTime: PROGRESS_STALE.boards,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("progress_rounds_leaderboard", { _limit: 50 });
      if (error) throw error;
      const rowsIn = (data ?? []) as { user_id: string; total: number }[];
      const profMap = await hydrateProfiles(rowsIn.map((r) => r.user_id));
      return rowsIn.map((r) => ({
        user_id: r.user_id,
        label: `${r.total} round${Number(r.total) === 1 ? "" : "s"}`,
        sub: "Rounds logged",
        profile: profMap.get(r.user_id) ?? null,
      }));
    },
  });
  return (
    <BoardList
      rows={q.data ?? (q.isError ? [] : null)}
      currentUserId={user?.id}
      emptyLabel={
        q.isError
          ? "This board didn't load — try switching tabs and back."
          : "No rounds logged yet — start a round to get on the board."
      }
    />
  );
}

function AcesBoard() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: progressKeys.acesBoard(),
    staleTime: PROGRESS_STALE.boards,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("progress_aces_leaderboard", { _limit: 50 });
      if (error) throw error;
      const rowsIn = (data ?? []) as { user_id: string; total: number }[];
      const profMap = await hydrateProfiles(rowsIn.map((r) => r.user_id));
      return rowsIn.map((r) => ({
        user_id: r.user_id,
        label: `${r.total} ace${Number(r.total) === 1 ? "" : "s"}`,
        sub: "Career aces logged",
        profile: profMap.get(r.user_id) ?? null,
      }));
    },
  });
  return (
    <BoardList
      rows={q.data ?? (q.isError ? [] : null)}
      currentUserId={user?.id}
      emptyLabel={
        q.isError
          ? "This board didn't load — try switching tabs and back."
          : "No aces on the board yet — chains are waiting."
      }
    />
  );
}

function CommunityBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const { user } = useSession();
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("event_rsvps")
        .select("user_id, attended")
        .eq("attended", true);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => (counts[r.user_id] = (counts[r.user_id] ?? 0) + 1));
      const ids = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      const profMap = await hydrateProfiles(ids.map(([id]) => id));
      if (!alive) return;
      setRows(
        ids.map(([id, n]) => ({
          user_id: id,
          label: `${n} events`,
          sub: "Community events attended",
          profile: profMap.get(id) ?? null,
        })),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <BoardList
      rows={rows}
      currentUserId={user?.id}
      emptyLabel="No community events on the board yet — host a casual round or league night to kick it off."
    />
  );
}

function BuildersBoard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const { user } = useSession();
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("courses")
        .select("created_by")
        .eq("moderation_status", "approved");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        if (r.created_by) counts[r.created_by] = (counts[r.created_by] ?? 0) + 1;
      });
      const ids = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50);
      const profMap = await hydrateProfiles(ids.map(([id]) => id));
      if (!alive) return;
      setRows(
        ids.map(([id, n]) => ({
          user_id: id,
          label: `${n} courses`,
          sub: "Approved builds",
          profile: profMap.get(id) ?? null,
        })),
      );
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <BoardList
      rows={rows}
      currentUserId={user?.id}
      emptyLabel="No approved course builds yet — submit one to appear on this board."
    />
  );
}

const RANK_STYLES: Record<number, string> = MEDAL_STYLES;

function BoardList({
  rows,
  currentUserId,
  emptyLabel,
}: {
  rows: Row[] | null;
  currentUserId?: string;
  emptyLabel: string;
}) {
  if (rows === null)
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  const myRank = currentUserId ? rows.findIndex((r) => r.user_id === currentUserId) : -1;
  const myRow = myRank >= 0 ? rows[myRank] : null;
  return (
    <div className="space-y-3">
      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((r, i) => {
          const rank = i + 1;
          const isMe = r.user_id === currentUserId;
          return (
            <li
              key={r.user_id + i}
              className={"flex items-center gap-3 p-3 " + (isMe ? "bg-primary/5" : "")}
            >
              <div
                className={
                  "grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-sm font-bold tabular-nums " +
                  (RANK_STYLES[rank] ?? "border-border/50 text-muted-foreground")
                }
              >
                {rank <= 3 ? <Medal className="h-4 w-4" /> : rank}
              </div>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                {r.profile?.avatar_url ? (
                  <img
                    src={r.profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-xs font-semibold text-muted-foreground">
                    {r.profile?.display_name?.slice(0, 2).toUpperCase() ?? "??"}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {r.profile ? (
                  <Link
                    to="/u/$username"
                    params={{ username: r.profile.username }}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {r.profile.display_name}
                    {isMe ? " (you)" : ""}
                  </Link>
                ) : (
                  <div className="truncate text-sm font-medium">Player{isMe ? " (you)" : ""}</div>
                )}
                <div className="truncate text-xs text-muted-foreground">{r.sub}</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">{r.label}</div>
            </li>
          );
        })}
      </ol>
      {currentUserId && myRow == null ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          You're not in the top 50 on this board yet — keep going.
        </div>
      ) : myRow ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-center text-xs text-muted-foreground">
          Your rank: <span className="font-semibold text-foreground">#{myRank + 1}</span> ·{" "}
          {myRow.label}
        </div>
      ) : null}
    </div>
  );
}
