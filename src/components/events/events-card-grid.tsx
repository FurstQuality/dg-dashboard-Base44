import { Link } from "@tanstack/react-router";
import {
  Calendar as CalIcon,
  ExternalLink,
  HeartHandshake,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SeriesNote, SeriesLink } from "@/components/events/series-note";
import { EventRegisterButton } from "@/components/events/event-register-button";
import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import {
  KIND_META,
  SOURCE_META,
  fmtDate,
  fmtWhen,
  type Density,
  type UnifiedRow,
} from "./events-types";

const KIND_ICONS = { tournament: Trophy, league: CalIcon, casual: HeartHandshake } as const;

interface EventsCardGridProps {
  rows: UnifiedRow[];
  density: Density;
}

export function EventsCardGrid({ rows, density }: EventsCardGridProps) {
  const gridCls =
    density === "compact"
      ? "grid gap-3 grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      : "grid gap-4 grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  return (
    <div className={gridCls}>
      {rows.map((r) => (
        <div key={r.id} className="flex h-full flex-col">
          <EventCard row={r} density={density} />
          {r.series ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <SeriesLink series={r.series} />
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1 pt-0.5">
            {r.register ? <EventRegisterButton row={r} /> : null}
            <TrackEventButton
              event={{
                eventRef: `${r.source}-${r.id}`,
                name: r.title,
                eventDate: r.start_date,
                location: r.location,
                tier: r.tier,
                url: r.external_url ?? null,
              }}
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              label="Track"
            />
            {r.start_date ? (
              <AddToCalendarButton
                event={{
                  id: r.id,
                  title: r.title,
                  source: r.source,
                  start_date: r.start_date,
                  end_date: r.end_date,
                  location: r.location,
                  tier: r.tier,
                  external_url: r.external_url ?? null,
                }}
                size="icon"
                variant="secondary"
                className="h-7 w-7"
                ariaLabel={`Add ${r.title} to your calendar`}
              />
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function EventCard({ row, density }: { row: UnifiedRow; density: Density }) {
  const kindMeta = KIND_META[row.kind];
  const KindIcon = KIND_ICONS[row.kind];
  const srcMeta = SOURCE_META[row.source];
  const isExternal = !row.linkTo && !!row.external_url;
  const compact = density === "compact";

  const inner = (
    <>
      <div className={`relative bg-muted ${compact ? "aspect-[16/6]" : "aspect-[16/8]"}`}>
        {row.cover_url ? (
          <img
            src={row.cover_url}
            alt={row.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <FallbackArt kind={row.kind} />
        )}
      </div>
      <div className={compact ? "flex-1 p-3" : "flex-1 p-3.5"}>
        <div className="mb-1 flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${kindMeta.tone}`}
          >
            <KindIcon className="h-2.5 w-2.5" />
            {kindMeta.label}
          </span>
          <span className="ml-auto truncate text-xs text-muted-foreground">
            {[
              row.bucket === "sanctioned" ? (row.tier ? `PDGA ${row.tier}` : "PDGA") : row.bucket === "casual" ? "Casual" : row.tier,
              srcMeta.short,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <div className="line-clamp-2 text-[15px] font-semibold leading-snug group-hover:text-primary">
          {row.title}
          {isExternal ? (
            <ExternalLink className="ml-1 inline h-3 w-3 text-muted-foreground" />
          ) : null}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <CalIcon className="h-3.5 w-3.5" />
          {fmtWhen(row)}
        </div>
        {row.series ? <SeriesNote series={row.series} className="mt-0.5 flex" /> : null}
        {/* An unknown venue is said out loud rather than left blank, so nobody
            reads the gap as "no travel required". */}
        <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">
            {row.location ?? <span className="italic">Location unconfirmed</span>}
          </span>
        </div>
        {!compact && (row.crew_count || row.divisions.length > 0) ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {row.crew_count && row.crew_count > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                <Users className="h-3 w-3" /> {row.crew_count} friends
              </span>
            ) : null}
            {row.divisions.slice(0, 2).map((d) => (
              <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-[12px] uppercase">
                {d}
              </span>
            ))}
            {row.divisions.length > 2 ? (
              <span className="text-[10px] text-muted-foreground">+{row.divisions.length - 2}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );

  const cls =
    "group flex h-full flex-col text-left overflow-hidden rounded-2xl bg-card ring-1 ring-border/50 transition duration-200 hover:-translate-y-0.5 hover:ring-primary/40 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none";

  if (isExternal) {
    return (
      <a href={row.external_url!} target="_blank" rel="noopener noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  if (row.linkTo) {
    return (
      <Link to={row.linkTo.to as never} params={(row.linkTo.params ?? {}) as never} className={cls}>
        {inner}
      </Link>
    );
  }
  // Fallback: still make it a clickable link to the events library filtered by this title.
  return (
    <Link to="/events" search={{ q: row.title } as never} className={cls}>
      {inner}
    </Link>
  );
}

/** Branded fallback when an event has no cover: a disc flight arc over
 *  faint contour lines, tinted by event type. Decorative only. */
function FallbackArt({ kind }: { kind: UnifiedRow["kind"] }) {
  const tone = kind === "league" ? "text-primary" : kind === "casual" ? "text-success" : "text-warning";
  const KindIcon = KIND_ICONS[kind];
  return (
    <div className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-muted to-background ${tone}`}>
      <svg aria-hidden viewBox="0 0 200 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {[18, 34, 50, 66, 82].map((y) => (
          <path key={y} d={`M0 ${y} C 50 ${y - 10}, 120 ${y + 12}, 200 ${y - 4}`} fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
        ))}
        <path d="M16 84 C 70 10, 140 8, 182 46" fill="none" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
        <circle cx="182" cy="46" r="4" fill="currentColor" fillOpacity="0.7" />
      </svg>
      <KindIcon className="absolute bottom-2 left-2.5 h-5 w-5 opacity-70" />
    </div>
  );
}
