import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronDown,
  Info,
  Link2,
  RefreshCw,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { listRecentIngestJobs } from "@/lib/data-connectors.functions";
import { ReviewNeededPanel } from "@/components/import/review-needed-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type DataHealth = {
  rounds: {
    total: number;
    verified: number;
    scraped: number;
    manual: number;
    needs_review: number;
  };
  events: {
    total: number;
    verified: number;
    scraped: number;
    manual: number;
    upcoming: number;
  };
};

/**
 * Data coverage widgets: per-source round counts, source-trust breakdown, and
 * the rounds-needing-review queue. Lives on StatLink so stats and their data
 * quality sit together.
 *
 * The round-count tile follows the Round Source switcher: PDGA rounds show on
 * PDGA, UDisc rounds on UDisc, DGD rounds on DG Dashboard — never all at once.
 */
export function DataHealthWidgets({
  source = "pdga",
}: {
  source?: "pdga" | "udisc" | "chainlink";
}) {
  const { user } = useSession();

  const ingestQ = useQuery({
    queryKey: ["data-health", "ingest"],
    queryFn: () => listRecentIngestJobs(),
  });

  const trackerQ = useQuery({
    enabled: !!user,
    queryKey: ["data-health", "trackers", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("tracker_groups")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", user!.id);
      return count ?? 0;
    },
  });

  // Scheduled events follow the same source switcher as rounds: PDGA-sanctioned
  // listings on PDGA, imported UDisc events on UDisc, events created here on DGD.
  const eventSources: (
    | "disc_golf_scene"
    | "league"
    | "manual"
    | "pdga"
    | "tournament"
    | "udisc"
  )[] =
    source === "udisc"
      ? ["udisc"]
      : source === "chainlink"
        ? ["tournament", "league", "manual"]
        : ["pdga", "disc_golf_scene"];

  const calendarQ = useQuery({
    enabled: !!user,
    queryKey: ["data-health", "calendar", user?.id, source],
    queryFn: async () => {
      const uid = user!.id;
      const today = new Date().toISOString().slice(0, 10);
      const base = () =>
        supabase
          .from("scheduled_events")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .in("source", eventSources);
      const [all, upcoming, finished] = await Promise.all([
        base(),
        base().gte("starts_on", today),
        base().lt("starts_on", today),
      ]);
      return {
        total: all.count ?? 0,
        upcoming: upcoming.count ?? 0,
        finished: finished.count ?? 0,
      };
    },
  });

  const healthQ = useQuery({
    enabled: !!user,
    queryKey: ["data-health", "summary", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_data_health");
      if (error) throw error;
      return data as unknown as DataHealth;
    },
    staleTime: 30_000,
  });

  const sourceCountsQ = useQuery({
    enabled: !!user,
    queryKey: ["data-health", "source-counts", user?.id],
    queryFn: async () => {
      const uid = user!.id;
      const ext = (src: "pdga" | "udisc") =>
        supabase
          .from("external_rounds")
          .select("*", { count: "exact", head: true })
          .eq("user_id", uid)
          .eq("source", src);
      const [pdga, pdgaRated, pdgaInWindow, udisc, udiscRated, dgd] = await Promise.all([
        ext("pdga"),
        ext("pdga").not("round_rating", "is", null),
        ext("pdga").eq("included", true),
        ext("udisc"),
        ext("udisc").not("round_rating", "is", null),
        supabase.from("rounds").select("*", { count: "exact", head: true }).eq("created_by", uid),
      ]);
      return {
        pdga: pdga.count ?? 0,
        pdgaRated: pdgaRated.count ?? 0,
        pdgaInWindow: pdgaInWindow.count ?? 0,
        udisc: udisc.count ?? 0,
        udiscRated: udiscRated.count ?? 0,
        dgd: dgd.count ?? 0,
      };
    },
    staleTime: 30_000,
  });

  const health = healthQ.data;
  const counts = sourceCountsQ.data;
  const ingestCount = (health?.rounds.needs_review ?? 0) + (ingestQ.data?.jobs?.length ?? 0);
  const calendar = calendarQ.data;
  const undated = Math.max(
    0,
    (calendar?.total ?? 0) - (calendar?.upcoming ?? 0) - (calendar?.finished ?? 0),
  );

  const eventTile =
    source === "udisc"
      ? {
          label: "UDisc events on your calendar",
          note: "Events you imported from UDisc — not a count of events you played.",
        }
      : source === "chainlink"
        ? {
            label: "DGD events on your calendar",
            note: "Tournaments and leagues you created or joined here in DG Dashboard.",
          }
        : {
            label: "PDGA events you're signed up for",
            note: "PDGA-sanctioned events and Disc Golf Scene registrations on your calendar — not every event you've ever played.",
          };

  const roundTile =
    source === "udisc"
      ? {
          label: "UDisc rounds imported",
          value: counts?.udisc ?? 0,
          note: "Every scorecard you've imported from a UDisc CSV export, casual and competitive.",
          detail: counts
            ? `${counts.udiscRated.toLocaleString()} carry a round rating · imported rounds never change your PDGA rating`
            : null,
        }
      : source === "chainlink"
        ? {
            label: "DGD rounds scored here",
            value: counts?.dgd ?? 0,
            note: "Every round you scored in DG Dashboard, including practice and casual play.",
            detail: "Only singles stroke play counts toward your DGD Rating.",
          }
        : {
            label: "PDGA rated rounds",
            value: counts?.pdga ?? 0,
            note: "All-time rounds PDGA has published for your player page — sanctioned play only.",
            detail: counts
              ? `${counts.pdgaRated.toLocaleString()} have an official round rating · ${counts.pdgaInWindow.toLocaleString()} fall inside your current rating window`
              : null,
          };

  return (
    <div className="space-y-4">
      {/* Round counts stay strictly separated by source: PDGA = sanctioned
          rated rounds, UDisc = imported scorecards, DGD = rounds scored here.
          Only the selected source's count shows, so the tile always matches
          the rest of the tab. */}
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          What we hold for you from the source selected above. Each number says exactly what it
          counts — nothing here is an estimate.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label={roundTile.label}
            value={roundTile.value}
            icon={Upload}
            note={roundTile.note}
            detail={roundTile.detail}
          />
          <StatTile
            label={eventTile.label}
            value={calendar?.total ?? 0}
            icon={CalendarDays}
            note={eventTile.note}
            detail={
              calendar
                ? `${calendar.upcoming.toLocaleString()} still to play · ${calendar.finished.toLocaleString()} finished${undated > 0 ? ` · ${undated.toLocaleString()} without a set date` : ""}`
                : null
            }
          />
          <StatTile
            label="Crew trackers you own"
            value={trackerQ.data ?? 0}
            icon={Users}
            note="Groups of players you follow, so you can see their rounds and results."
            detail="Trackers you were added to by someone else aren't counted here."
          />
        </div>
      </div>

      <ReviewNeededPanel />
    </div>
  );
}

/**
 * Collapsed information row explaining where each round and event came from.
 * Sits above the ratings explainer so both reference panels read the same way.
 */
export function DataSourceTrustPanel() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  const healthQ = useQuery({
    enabled: !!user,
    queryKey: ["data-health", "summary", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_data_health");
      if (error) throw error;
      return data as unknown as DataHealth;
    },
    staleTime: 30_000,
  });

  const health = healthQ.data;
  if (!health) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card className="border-border/70">
        <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-card px-4 py-3 text-left transition-colors hover:bg-muted/40">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold">Where your data comes from</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <p className="mb-3 text-xs leading-snug text-muted-foreground">
              Every round and event we hold for you across all sources (
              {(health.rounds.total + health.events.total).toLocaleString()} in total), grouped by
              how we got it. When two sources describe the same round, we keep the more trustworthy
              one.
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <TrustChip
                label="Official PDGA results"
                value={health.rounds.verified + health.events.verified}
                tone="verified"
              />
              <TrustChip
                label="Read from UDisc, Disc Golf Scene or a link you shared"
                value={health.rounds.scraped + health.events.scraped}
                tone="scraped"
              />
              <TrustChip
                label="Typed in by you"
                value={health.rounds.manual + health.events.manual}
                tone="manual"
              />
              {health.rounds.needs_review > 0 && (
                <TrustChip
                  label="Rounds waiting for you to confirm details"
                  value={health.rounds.needs_review}
                  tone="review"
                />
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  note,
  detail,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  /** One line saying exactly what the number counts. */
  note?: string;
  /** Optional breakdown of the same number. */
  detail?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">
        {value.toLocaleString()}
      </div>
      {note ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p> : null}
      {detail ? (
        <p className="mt-1 border-t border-border/60 pt-1 text-[11px] leading-snug text-muted-foreground">
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function TrustChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "verified" | "scraped" | "manual" | "review";
}) {
  const toneCls = {
    verified: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    scraped: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
    manual: "bg-muted text-muted-foreground border-border",
    review: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${toneCls}`}>
      <span className="font-semibold tabular-nums">{value.toLocaleString()}</span>
      <span className="opacity-80">{label}</span>
    </span>
  );
}
