/**
 * Compact link clusters that expose every relevant pdga.com destination for an
 * event or player. Dropped anywhere we display an event or player entity so
 * users can jump straight to results, live scoring, ratings, or career history
 * without hunting through the PDGA site.
 *
 * Design intent: dense but readable, matches the tracker's operational tone.
 * Never renders bare id numbers — link labels describe the destination.
 */
import { ExternalLink, Radio, Trophy, BarChart3, Users, Activity, History } from "lucide-react";
import {
  pdgaEventUrl,
  pdgaEventResultsUrl,
  pdgaEventStatsUrl,
  pdgaLiveScoringUrl,
  pdgaEventRegistrationUrl,
  pdgaPlayerUrl,
  pdgaPlayerRatingsUrl,
  pdgaPlayerStatsUrl,
  pdgaPlayerCareerUrl,
} from "@/lib/pdga-links";

type LinkItem = { href: string; label: string; icon: React.ReactNode };

function LinkRow({ items, label }: { items: LinkItem[]; label?: string }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {label ? (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      ) : null}
      {items.map((it, i) => (
        <a
          key={i}
          href={it.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-foreground/80 hover:text-primary hover:border-primary/60 transition-colors"
          title={`Open ${it.label} on pdga.com`}
        >
          {it.icon}
          <span>{it.label}</span>
          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
        </a>
      ))}
    </div>
  );
}

/**
 * Event link cluster. `live` toggles a Live Scoring pill; pass true for
 * events that are in-progress right now to make the affordance discoverable.
 */
export function PdgaEventLinks({
  eventRef,
  live = false,
  label = "PDGA",
  className,
}: {
  eventRef: string | null | undefined;
  live?: boolean;
  label?: string | null;
  className?: string;
}) {
  const evUrl = pdgaEventUrl(eventRef);
  if (!evUrl) return null;
  const items: LinkItem[] = [
    { href: evUrl, label: "Event", icon: <Trophy className="h-2.5 w-2.5" /> },
  ];
  const liveUrl = pdgaLiveScoringUrl(eventRef);
  if (live && liveUrl) {
    items.push({
      href: liveUrl,
      label: "Live scoring",
      icon: <Radio className="h-2.5 w-2.5 text-red-500" />,
    });
  }
  const results = pdgaEventResultsUrl(eventRef);
  if (results)
    items.push({ href: results, label: "Results", icon: <BarChart3 className="h-2.5 w-2.5" /> });
  const reg = pdgaEventRegistrationUrl(eventRef);
  if (reg) items.push({ href: reg, label: "Field", icon: <Users className="h-2.5 w-2.5" /> });
  const stats = pdgaEventStatsUrl(eventRef);
  if (stats)
    items.push({ href: stats, label: "Stats", icon: <Activity className="h-2.5 w-2.5" /> });
  return (
    <div className={className}>
      <LinkRow items={items} label={label ?? undefined} />
    </div>
  );
}

/**
 * Player link cluster. Adds ratings history and career events alongside the
 * bare profile — critical for verifying tracker data and rating projections.
 */
export function PdgaPlayerLinks({
  pdgaNumber,
  label = "PDGA",
  className,
}: {
  pdgaNumber: string | number | null | undefined;
  label?: string | null;
  className?: string;
}) {
  const profile = pdgaPlayerUrl(pdgaNumber);
  if (!profile) return null;
  const items: LinkItem[] = [
    { href: profile, label: `#${pdgaNumber}`, icon: <ExternalLink className="h-2.5 w-2.5" /> },
  ];
  const ratings = pdgaPlayerRatingsUrl(pdgaNumber);
  if (ratings)
    items.push({ href: ratings, label: "Ratings", icon: <Activity className="h-2.5 w-2.5" /> });
  const stats = pdgaPlayerStatsUrl(pdgaNumber);
  if (stats)
    items.push({ href: stats, label: "Stats", icon: <BarChart3 className="h-2.5 w-2.5" /> });
  const career = pdgaPlayerCareerUrl(pdgaNumber);
  if (career)
    items.push({ href: career, label: "Career", icon: <History className="h-2.5 w-2.5" /> });
  return (
    <div className={className}>
      <LinkRow items={items} label={label ?? undefined} />
    </div>
  );
}
