import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { profileKeys } from "@/lib/profile-queries";
import { BarChart3, Check, Settings2, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMyPrefs, saveMyPrefs } from "@/lib/platform-config.functions";
import type { PrivacyPrefs } from "@/lib/platform-config";
import {
  STAT_HIGHLIGHTS,
  STAT_HIGHLIGHT_LIMIT,
  type StatHighlightGroup,
  type StatHighlightKey,
} from "@/lib/stat-highlights";
import type { PlayerProfileData } from "@/lib/player-profile.functions";

type Highlight = { value: string; caption?: string | null; trend?: "up" | "down" | null };

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

/** Resolves each highlight from the profile payload the server already filtered. */
function resolveHighlight(key: StatHighlightKey, data: PlayerProfileData): Highlight | null {
  const s = data.stats;
  const h = data.highlights;
  const sc = data.scoring;

  switch (key) {
    case "currentRating": {
      const value = data.pdga?.current_rating ?? data.profile.pdga_rating ?? s.avg_rating;
      if (value == null) return null;
      return {
        value: String(value),
        caption: data.pdga?.current_rating != null ? "Official PDGA" : "DGD average",
      };
    }
    case "avgRating":
      return s.avg_rating == null ? null : { value: String(s.avg_rating), caption: "Rated rounds" };
    case "bestRound":
      return h.best_round
        ? { value: String(h.best_round.rating), caption: h.best_round.course_name }
        : s.best_rating != null
          ? { value: String(s.best_rating), caption: "Best rated round" }
          : null;
    case "ratingTrend": {
      if (data.form.delta == null || data.form.last5_avg == null) return null;
      const delta = Math.round(data.form.delta);
      return {
        value: `${delta > 0 ? "+" : ""}${delta}`,
        caption: `Last 5 avg ${Math.round(data.form.last5_avg)}`,
        trend: delta >= 0 ? "up" : "down",
      };
    }
    case "ratedRounds":
      return s.pdga_rounds > 0
        ? { value: s.pdga_rounds.toLocaleString(), caption: "PDGA rated" }
        : null;
    case "roundsPlayed":
      return s.total_rounds > 0
        ? { value: s.total_rounds.toLocaleString(), caption: "All sources" }
        : null;
    case "birdieRate":
      return sc ? { value: pct(sc.birdie_rate), caption: `${sc.holes} holes` } : null;
    case "parRate":
      return sc ? { value: pct(sc.par_rate), caption: `${sc.holes} holes` } : null;
    case "bogeyRate":
      return sc ? { value: pct(sc.bogey_rate), caption: `${sc.holes} holes` } : null;
    case "scoringAvg":
      return sc
        ? {
            value: `${sc.avg_to_par_per_hole > 0 ? "+" : ""}${sc.avg_to_par_per_hole.toFixed(2)}`,
            caption: "To par per hole",
          }
        : null;
    case "aces":
      return s.aces > 0 ? { value: String(s.aces), caption: "Career" } : null;
    case "eventsPlayed":
      return s.events_played > 0
        ? { value: String(s.events_played), caption: "Tournaments & leagues" }
        : null;
    case "wins":
      return s.wins > 0 ? { value: String(s.wins), caption: "First place" } : null;
    case "top10s":
      return s.top_10s > 0 ? { value: String(s.top_10s), caption: "Top ten finishes" } : null;
    case "bestFinish":
      return h.best_finish
        ? {
            value: `#${h.best_finish.place}`,
            caption: h.best_finish.event_name,
          }
        : null;
    case "hottestStretch":
      return h.hottest_stretch == null
        ? null
        : { value: String(Math.round(h.hottest_stretch)), caption: "Best run of rounds" };
    case "coursesPlayed":
      return h.courses_played > 0
        ? { value: String(h.courses_played), caption: "Different courses" }
        : null;
    case "statesPlayed":
      return h.states_played > 0 ? { value: String(h.states_played), caption: "States" } : null;
    default:
      return null;
  }
}

const GROUP_ORDER: StatHighlightGroup[] = ["Rating", "Scoring", "Competition", "Travel"];

export function StatHighlightsCard({ data }: { data: PlayerProfileData }) {
  const selected = data.statHighlights;
  const [editing, setEditing] = useState(false);

  const tiles = useMemo(
    () =>
      selected
        .map((key) => {
          const meta = STAT_HIGHLIGHTS.find((s) => s.key === key);
          const value = resolveHighlight(key, data);
          return meta && value ? { meta, value } : null;
        })
        .filter((t): t is { meta: (typeof STAT_HIGHLIGHTS)[number]; value: Highlight } => !!t),
    [selected, data],
  );

  if (!data.isSelf && tiles.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">DG Statboard highlights</h3>
          </div>
          <div className="flex items-center gap-2">
            {data.isSelf && (
              <>
                <Button
                  size="sm"
                  variant={editing ? "default" : "outline"}
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Done
                    </>
                  ) : (
                    <>
                      <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Choose stats
                    </>
                  )}
                </Button>
                <Link to="/stats" className="text-sm text-primary hover:underline">
                  Open DG Statboard
                </Link>
              </>
            )}
          </div>
        </div>

        {tiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Pick the stats you want on your profile — they update as you log rounds.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tiles.map(({ meta, value }) => (
              <div key={meta.key} className="rounded-lg border p-3" title={meta.hint}>
                <div className="text-xs text-muted-foreground">{meta.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="font-display text-2xl font-semibold tabular-nums">
                    {value.value}
                  </span>
                  {value.trend === "up" && <TrendingUp className="h-4 w-4 text-primary" />}
                  {value.trend === "down" && (
                    <TrendingDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                {value.caption && (
                  <div className="truncate text-xs text-muted-foreground">{value.caption}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {data.isSelf && editing && <HighlightPicker data={data} selected={selected} />}
      </CardContent>
    </Card>
  );
}

export function HighlightPicker({
  data,
  selected,
}: {
  data: PlayerProfileData;
  selected: StatHighlightKey[];
}) {
  const qc = useQueryClient();
  const load = useServerFn(getMyPrefs);
  const save = useServerFn(saveMyPrefs);
  const [prefs, setPrefs] = useState<PrivacyPrefs | null>(null);
  const [picked, setPicked] = useState<StatHighlightKey[]>(selected);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load()
      .then((r) => {
        setPrefs(r.privacy);
        setPicked(r.privacy.statHighlights);
      })
      .catch(() => toast.error("We couldn't load your stat choices. Try again in a moment."));
  }, [load]);

  const toggle = (key: StatHighlightKey) =>
    setPicked((cur) => {
      if (cur.includes(key)) return cur.filter((k) => k !== key);
      if (cur.length >= STAT_HIGHLIGHT_LIMIT) {
        toast.error(`You can show up to ${STAT_HIGHLIGHT_LIMIT} stats at a time.`);
        return cur;
      }
      return [...cur, key];
    });

  async function onSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      // Re-read first: privacy settings can be edited alongside this picker, so
      // saving a mount-time snapshot would quietly undo those choices.
      const fresh = await load()
        .then((r) => r.privacy)
        .catch(() => prefs);
      await save({ data: { privacy: { ...fresh, statHighlights: picked } } });
      setPrefs({ ...fresh, statHighlights: picked });
      toast.success("Profile stats updated");
      await qc.invalidateQueries({ queryKey: profileKeys.player(data.profile.username) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Tick the stats other players see on your profile. Up to {STAT_HIGHLIGHT_LIMIT}.
        </p>
        <Badge variant="outline">
          {picked.length}/{STAT_HIGHLIGHT_LIMIT} shown
        </Badge>
      </div>
      <div className="mt-3 space-y-3">
        {GROUP_ORDER.map((group) => {
          const items = STAT_HIGHLIGHTS.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  const on = picked.includes(item.key);
                  const hasValue = resolveHighlight(item.key, data) != null;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => toggle(item.key)}
                      aria-pressed={on}
                      className={
                        "rounded-lg border p-2.5 text-left transition " +
                        (on ? "border-primary bg-primary/5" : "hover:border-primary/40")
                      }
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{item.label}</span>
                        {on && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {hasValue ? item.hint : "No data yet — it fills in as you play."}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => void onSave()} disabled={saving || !prefs}>
          {saving ? "Saving…" : "Save stat choices"}
        </Button>
      </div>
    </div>
  );
}
