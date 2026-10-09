import { useState } from "react";
import {
  Flag,
  Target,
  Trophy,
  Sparkles,
  TrendingUp,
  MapPin,
  Loader2,
  Send,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ProfileRow } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type PromptKey = "round" | "aces" | "achievement" | "rating" | "home_course" | "streak";

type PromptDef = {
  key: PromptKey;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

type Draft = {
  key: PromptKey;
  type: "text" | "ace" | "roundcard" | "checkin";
  body: string;
  location: string | null;
  courseName?: string | null;
  scoreData?: Record<string, unknown> | null;
};

const PROMPTS: PromptDef[] = [
  {
    key: "round",
    title: "Latest round",
    subtitle: "Auto-fills score & rating",
    icon: Flag,
    tone: "bg-emerald-500/15 text-emerald-600",
  },
  {
    key: "aces",
    title: "Ace challenge",
    subtitle: "Show your ace count",
    icon: Target,
    tone: "bg-rose-500/15 text-rose-600",
  },
  {
    key: "achievement",
    title: "Latest trophy",
    subtitle: "Show off a win",
    icon: Trophy,
    tone: "bg-amber-500/15 text-amber-600",
  },
  {
    key: "rating",
    title: "Rating check-in",
    subtitle: "Progress toward your goal",
    icon: TrendingUp,
    tone: "bg-blue-500/15 text-blue-600",
  },
  {
    key: "home_course",
    title: "Home course",
    subtitle: "Check in & tag it",
    icon: MapPin,
    tone: "bg-purple-500/15 text-purple-600",
  },
  {
    key: "streak",
    title: "Play streak",
    subtitle: "Days logged in a row",
    icon: Star,
    tone: "bg-orange-500/15 text-orange-600",
  },
];

export function QuickShareStrip({
  profile,
  onCreated,
}: {
  profile: ProfileRow | null;
  onCreated?: () => void;
}) {
  const [loading, setLoading] = useState<PromptKey | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [posting, setPosting] = useState(false);

  async function handleClick(key: PromptKey) {
    if (!profile?.id) {
      toast.error("Sign in to share.");
      return;
    }
    setLoading(key);
    try {
      const built = await buildDraft(key, profile);
      setDraft(built);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't build that post.");
    } finally {
      setLoading(null);
    }
  }

  async function submitDraft() {
    if (!draft || !profile?.id) return;
    if (!draft.body.trim()) {
      toast.error("Add a message before posting.");
      return;
    }
    setPosting(true);
    try {
      const { error } = await supabase.from("posts").insert({
        author_id: profile.id,
        type: draft.type,
        body: draft.body.trim(),
        location: draft.location ?? null,
        course_name: draft.courseName ?? null,
        score_data: (draft.scoreData ?? null) as never,
        media: [],
      });
      if (error) throw error;
      toast.success("Posted!");
      setDraft(null);
      onCreated?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "We couldn't post that. Give it another shot.",
      );
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Quick share
        </div>
        <span className="text-[10px] text-muted-foreground">
          One tap · Auto-filled from your stats
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PROMPTS.map((p) => {
          const Icon = p.icon;
          const isLoading = loading === p.key;
          return (
            <button
              key={p.key}
              onClick={() => handleClick(p.key)}
              disabled={isLoading || !profile}
              className={
                "group flex flex-col items-start gap-1 rounded-lg border border-border bg-background p-2.5 text-left transition " +
                "hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
              }
            >
              <div className={"grid h-7 w-7 place-items-center rounded-md " + p.tone}>
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="text-[13px] font-medium leading-tight">{p.title}</div>
              <div className="text-[10px] leading-tight text-muted-foreground">{p.subtitle}</div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Preview your post
            </DialogTitle>
            <DialogDescription>
              Auto-filled from your profile — tweak it before posting.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className="capitalize">
                  {draft.type === "roundcard" ? "Round card" : draft.type}
                </Badge>
                {draft.courseName ? (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="h-3 w-3" /> {draft.courseName}
                  </Badge>
                ) : null}
              </div>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={6}
                maxLength={2000}
              />
              <div className="text-[10px] text-muted-foreground">{draft.body.length}/2000</div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={posting}>
              Cancel
            </Button>
            <Button onClick={submitDraft} disabled={posting || !draft?.body.trim()}>
              {posting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

async function buildDraft(key: PromptKey, profile: ProfileRow): Promise<Draft> {
  switch (key) {
    case "round":
      return buildRoundDraft(profile);
    case "aces":
      return buildAcesDraft(profile);
    case "achievement":
      return buildAchievementDraft(profile);
    case "rating":
      return buildRatingDraft(profile);
    case "home_course":
      return buildHomeCourseDraft(profile);
    case "streak":
      return buildStreakDraft(profile);
  }
}

// -------- Latest round: merges DG Dashboard + UDisc + PDGA, keeps most recent --------
async function buildRoundDraft(profile: ProfileRow): Promise<Draft> {
  const [{ data: cl }, { data: ext }] = await Promise.all([
    supabase
      .from("round_ratings")
      .select(
        "total_strokes, score_to_par, holes_played, layout_hole_count, round_rating, course_id, created_at",
      )
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("external_rounds")
      .select(
        "source, course_name, layout_name, event_name, played_on, score, to_par, round_rating, created_at",
      )
      .eq("user_id", profile.id)
      .order("played_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const clRow = cl?.[0] ?? null;
  const extRow = ext?.[0] ?? null;
  const clTs = clRow ? new Date(clRow.created_at).getTime() : 0;
  const extTs = extRow ? new Date(extRow.played_on ?? extRow.created_at).getTime() : 0;

  if (!clRow && !extRow) {
    return {
      key: "round",
      type: "text",
      body: "Heading out for a round today ⛓️ Who's playing? Drop your home course in the comments.",
      location: null,
    };
  }

  // Prefer whichever timestamp is newer.
  if (clRow && clTs >= extTs) {
    let courseName: string | null = null;
    if (clRow.course_id) {
      const { data: c } = await supabase
        .from("courses")
        .select("name")
        .eq("id", clRow.course_id)
        .maybeSingle();
      courseName = c?.name ?? null;
    }
    const par = clRow.score_to_par ?? 0;
    const parText = par === 0 ? "even par" : par > 0 ? `+${par}` : `${par}`;
    const holes =
      clRow.holes_played != null &&
      clRow.layout_hole_count != null &&
      clRow.holes_played < clRow.layout_hole_count
        ? ` on ${clRow.holes_played} of ${clRow.layout_hole_count} holes`
        : "";
    const body =
      `Just wrapped a DG round${courseName ? ` at ${courseName}` : ""}! ${clRow.total_strokes} strokes (${parText})${holes}` +
      (clRow.round_rating ? ` — round rated ${clRow.round_rating}.` : ".") +
      ` Who's out playing today?`;
    return {
      key: "round",
      type: "roundcard",
      body,
      location: courseName,
      courseName,
      scoreData: {
        source: "chainlink",
        total_strokes: clRow.total_strokes,
        score_to_par: clRow.score_to_par,
        holes_played: clRow.holes_played,
        round_rating: clRow.round_rating,
      },
    };
  }

  // external round is newer (or the only one)
  const src = extRow!.source ?? "external";
  const sourceLabel = src === "pdga" ? "PDGA" : src === "udisc" ? "UDisc" : src;
  const par = extRow!.to_par ?? 0;
  const parText = par === 0 ? "even par" : par > 0 ? `+${par}` : `${par}`;
  const where = extRow!.event_name || extRow!.course_name || null;
  const body =
    `Just wrapped a ${sourceLabel} round${where ? ` at ${where}` : ""}! ${extRow!.score ?? "?"} strokes (${parText})` +
    (extRow!.round_rating ? ` — round rated ${extRow!.round_rating}.` : ".") +
    ` Who's out playing today?`;
  return {
    key: "round",
    type: "roundcard",
    body,
    location: where,
    courseName: extRow!.course_name ?? null,
    scoreData: {
      source: src,
      score: extRow!.score,
      to_par: extRow!.to_par,
      round_rating: extRow!.round_rating,
      layout: extRow!.layout_name,
      played_on: extRow!.played_on,
    },
  };
}

// -------- Ace challenge: profile ace count + favorite ace story --------
async function buildAcesDraft(profile: ProfileRow): Promise<Draft> {
  const { data: myRounds } = await supabase
    .from("rounds")
    .select("id")
    .eq("created_by", profile.id);
  const roundIds = (myRounds ?? []).map((r) => r.id);
  let chainAces = 0;
  if (roundIds.length > 0) {
    const { count } = await supabase
      .from("round_scores")
      .select("id", { count: "exact", head: true })
      .in("round_id", roundIds)
      .eq("strokes", 1);
    chainAces = count ?? 0;
  }
  const p = profile as { favorite_ace?: string | null; ace_count_manual?: number | null };
  const manual = p.ace_count_manual ?? 0;
  const total = Math.max(chainAces, manual, chainAces + (manual > chainAces ? 0 : 0));
  // If manual is set and higher than DG Dashboard count, prefer manual (career total).
  const acesText =
    manual && manual > chainAces
      ? `${manual} career aces (${chainAces} logged on DG Dashboard)`
      : `${chainAces} ace${chainAces === 1 ? "" : "s"} logged on DG Dashboard`;

  const fav = p.favorite_ace?.trim();
  const lines: string[] = [];
  if (chainAces > 0 || manual > 0) {
    lines.push(`🎯 Ace count: ${acesText} and counting.`);
    if (fav) lines.push(`Favorite ace: ${fav}`);
    lines.push(`Who has more? Drop your total in the comments.`);
  } else {
    lines.push(
      `Still chasing my first ace 🎯 ${fav ? `Closest so far: ${fav}` : "Drop your ace story below"} — who has the most on the feed?`,
    );
  }
  return {
    key: "aces",
    type: "text",
    body: lines.join("\n\n"),
    location: null,
    scoreData: {
      ace_count: total,
      chainlink_aces: chainAces,
      manual_aces: manual,
      favorite_ace: fav ?? null,
      challenge: "aces",
    },
  };
}

// -------- Latest trophy --------
async function buildAchievementDraft(profile: ProfileRow): Promise<Draft> {
  const { data } = await supabase
    .from("user_achievements")
    .select("achievement_key, earned_at, achievements(name, description, tier)")
    .eq("user_id", profile.id)
    .order("earned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ach =
    (data?.achievements as { name: string; description: string; tier: string } | null) ?? null;
  if (!ach) {
    return {
      key: "achievement",
      type: "text",
      body: `Chasing my next trophy on DG Dashboard 🏆 What achievement are you gunning for this month?`,
      location: null,
    };
  }
  const tierEmoji: Record<string, string> = {
    bronze: "🥉",
    silver: "🥈",
    gold: "🥇",
    platinum: "💎",
    legendary: "👑",
  };
  const emoji = tierEmoji[ach.tier] ?? "🏆";
  const earned = data?.earned_at ? new Date(data.earned_at).toLocaleDateString() : "";
  const body = `${emoji} Just unlocked "${ach.name}"${earned ? ` on ${earned}` : ""}! ${ach.description} What trophy are you chasing next?`;
  return {
    key: "achievement",
    type: "text",
    body,
    location: null,
    scoreData: { achievement_key: data?.achievement_key, tier: ach.tier },
  };
}

// -------- Rating check-in: current rating + nearest active goal --------
async function buildRatingDraft(profile: ProfileRow): Promise<Draft> {
  const [{ data: details }, { data: goals }] = await Promise.all([
    supabase.rpc("player_rating_details", { _user_id: profile.id }),
    supabase
      .from("user_goals")
      .select("title, metric, target, progress, deadline, completed_at")
      .eq("user_id", profile.id)
      .is("completed_at", null)
      .order("deadline", { ascending: true, nullsFirst: false })
      .limit(1),
  ]);
  const d = (details ?? {}) as {
    rating?: number | null;
    source?: string | null;
    used_rounds?: number | null;
    best_round?: number | null;
    official_pdga?: number | null;
  };
  const rating = d.rating ?? null;
  const label =
    d.source === "pdga_official" ? "PDGA" : d.source === "pdga" ? "PDGA-weighted" : "DG Dashboard";
  const goal = goals?.[0] ?? null;

  const lines: string[] = [];
  if (rating) {
    lines.push(
      `📈 Rating check-in: ${label} ${rating}${d.best_round ? ` (best round ${d.best_round})` : ""}.`,
    );
  } else {
    lines.push(`📈 Rating check-in — chasing that first rated round.`);
  }
  if (goal) {
    const isRating = /rating/i.test(goal.metric ?? "");
    if (isRating && rating && goal.target) {
      const gap = goal.target - rating;
      const dl = goal.deadline ? ` by ${new Date(goal.deadline).toLocaleDateString()}` : "";
      lines.push(
        gap > 0
          ? `Goal: ${goal.title} — need ${gap} more pts to hit ${goal.target}${dl}.`
          : `Goal crushed: ${goal.title} (${goal.target}) — sitting ${Math.abs(gap)} above target${dl}.`,
      );
    } else if (goal.target) {
      const prog = goal.progress ?? 0;
      const pct = Math.min(100, Math.round((prog / goal.target) * 100));
      lines.push(`Goal: ${goal.title} — ${prog}/${goal.target} (${pct}%).`);
    }
  } else {
    lines.push(`Grinding toward the next tier. Where's your rating at?`);
  }
  return {
    key: "rating",
    type: "text",
    body: lines.join(" "),
    location: null,
    scoreData: {
      rating,
      source: d.source,
      goal: goal?.title ?? null,
      target: goal?.target ?? null,
    },
  };
}

// -------- Home course --------
async function buildHomeCourseDraft(profile: ProfileRow): Promise<Draft> {
  const { data: myRounds } = await supabase
    .from("rounds")
    .select("course_id")
    .eq("created_by", profile.id)
    .not("course_id", "is", null);
  const counts = new Map<string, number>();
  for (const r of myRounds ?? []) {
    if (!r.course_id) continue;
    counts.set(r.course_id, (counts.get(r.course_id) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const [topId, plays] = top;
    const { data: course } = await supabase
      .from("courses")
      .select("name, city, state")
      .eq("id", topId)
      .maybeSingle();
    if (course) {
      const loc = [course.city, course.state].filter(Boolean).join(", ");
      const body = `Heading out to ${course.name}${loc ? ` (${loc})` : ""} — ${plays} round${plays === 1 ? "" : "s"} logged and counting. Who wants to join a card?`;
      return {
        key: "home_course",
        type: "checkin",
        body,
        location: course.name,
        courseName: course.name,
      };
    }
  }
  const home = (profile as { home_course?: string | null }).home_course ?? null;
  if (home) {
    return {
      key: "home_course",
      type: "checkin",
      body: `Home course check-in: ${home} 📍 Who wants to run a card this week?`,
      location: home,
      courseName: home,
    };
  }
  return {
    key: "home_course",
    type: "text",
    body: `Looking for a home course 📍 Drop your favorite local track in the comments — always down for a fresh layout.`,
    location: null,
  };
}

// -------- Play streak: distinct days across DG Dashboard + UDisc + PDGA --------
async function buildStreakDraft(profile: ProfileRow): Promise<Draft> {
  // Pull recent play dates from all three sources.
  const [{ data: cl }, { data: ext }] = await Promise.all([
    supabase
      .from("round_ratings")
      .select("created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(365),
    supabase
      .from("external_rounds")
      .select("source, played_on")
      .eq("user_id", profile.id)
      .order("played_on", { ascending: false })
      .limit(365),
  ]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const days = new Set<string>();
  const sources = new Set<string>();
  for (const r of cl ?? []) {
    if (!r.created_at) continue;
    days.add(dayKey(new Date(r.created_at)));
    sources.add("DG Dashboard");
  }
  for (const r of ext ?? []) {
    if (!r.played_on) continue;
    days.add(r.played_on);
    if (r.source === "pdga") sources.add("PDGA");
    else if (r.source === "udisc") sources.add("UDisc");
  }

  // Walk backward from today counting consecutive days present.
  let current = 0;
  const today = new Date();
  for (let i = 0; i < 400; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.has(dayKey(d))) current++;
    else if (i === 0)
      continue; // grace: allow starting yesterday
    else break;
  }

  // Longest streak across all recorded days.
  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: Date | null = null;
  for (const s of sorted) {
    const d = new Date(s);
    if (prev && d.getTime() - prev.getTime() === 86_400_000) run++;
    else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }

  const srcList = [...sources].join(" + ") || "DG Dashboard";
  const totalDays = days.size;
  const body =
    current >= 2
      ? `🔥 ${current}-day play streak going — logged rounds on ${srcList}. Longest run: ${longest} days across ${totalDays} total play days. Who's keeping their chain alive this week?`
      : longest >= 2
        ? `Kicking off a new streak today 🔥 Longest run so far: ${longest} days (${totalDays} total play days across ${srcList}). Who's playing this week?`
        : `Starting the streak today 🔥 Logged ${totalDays} play day${totalDays === 1 ? "" : "s"} on ${srcList}. Who's joining me this week?`;

  return {
    key: "streak",
    type: "text",
    body,
    location: null,
    scoreData: {
      current_streak: current,
      longest_streak: longest,
      total_play_days: totalDays,
      sources: [...sources],
    },
  };
}
