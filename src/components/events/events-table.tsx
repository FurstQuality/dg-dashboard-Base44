import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EventRegisterButton } from "@/components/events/event-register-button";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import { SeriesNote, SeriesLink } from "@/components/events/series-note";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_COLUMNS,
  KIND_META,
  SOURCE_META,
  fmtWhen,
  type ColumnKey,
  type Density,
  type SortKey,
  type UnifiedRow,
} from "./events-types";

interface EventsTableProps {
  rows: UnifiedRow[];
  columns: ColumnKey[];
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  density: Density;
}

/** Sort keys the table header buttons cycle through per column. */
const SORT_MAP: Record<ColumnKey, { asc: SortKey; desc: SortKey } | null> = {
  name: { asc: "name_asc", desc: "name_desc" },
  date: { asc: "date_asc", desc: "date_desc" },
  tier: { asc: "tier_asc", desc: "tier_desc" },
  source: { asc: "source_asc", desc: "source_asc" },
  location: { asc: "location_asc", desc: "location_asc" },
  kind: null,
  bucket: null,
  divisions: null,
  status: null,
  crew: null,
};

function SortHeader({
  column,
  label,
  sort,
  onSortChange,
}: {
  column: ColumnKey;
  label: string;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}) {
  const map = SORT_MAP[column];
  if (!map) return <>{label}</>;
  const active = sort === map.asc || sort === map.desc;
  const dir: "asc" | "desc" | null = sort === map.asc ? "asc" : sort === map.desc ? "desc" : null;
  return (
    <button
      type="button"
      onClick={() => onSortChange(dir === "asc" ? map.desc : map.asc)}
      className="flex items-center gap-1 text-left font-semibold text-muted-foreground hover:text-foreground"
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )
      ) : (
        <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
      )}
    </button>
  );
}

function BucketPill({ bucket, tier }: { bucket: UnifiedRow["bucket"]; tier: string | null }) {
  if (bucket === "sanctioned") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-black">
        PDGA {tier ?? "sanctioned"}
      </span>
    );
  }
  if (bucket === "casual") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white">
        Casual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
      Unsanctioned
    </span>
  );
}

export function EventsTable({ rows, columns, sort, onSortChange, density }: EventsTableProps) {
  const on = (c: ColumnKey) => columns.includes(c);
  const cellCls = density === "compact" ? "py-1.5" : "py-2.5";

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {ALL_COLUMNS.filter((c) => on(c.key)).map((c) => (
              <TableHead key={c.key} className="whitespace-nowrap text-xs uppercase tracking-wide">
                <SortHeader
                  column={c.key}
                  label={c.label}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              </TableHead>
            ))}
            <TableHead className="whitespace-nowrap text-xs uppercase tracking-wide">
              Sign up
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isExternal = !r.linkTo && !!r.external_url;
            const NameCell = (
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 font-medium text-foreground">{r.title}</span>
                {isExternal ? (
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : null}
              </div>
            );
            return (
              <TableRow key={r.id} className="hover:bg-accent/40">
                {on("name") && (
                  <TableCell className={`${cellCls} min-w-[220px] max-w-[380px]`}>
                    {isExternal ? (
                      <a
                        href={r.external_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block hover:text-primary"
                      >
                        {NameCell}
                      </a>
                    ) : r.linkTo ? (
                      <Link
                        to={r.linkTo.to as never}
                        params={(r.linkTo.params ?? {}) as never}
                        className="block hover:text-primary"
                      >
                        {NameCell}
                      </Link>
                    ) : (
                      NameCell
                    )}
                    {r.series ? (
                      <span className="mt-0.5 flex flex-wrap items-center gap-2">
                        <SeriesNote series={r.series} />
                        <SeriesLink series={r.series} />
                      </span>
                    ) : null}
                  </TableCell>
                )}
                {on("kind") && (
                  <TableCell className={cellCls}>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${KIND_META[r.kind].tone}`}
                    >
                      {KIND_META[r.kind].label}
                    </span>
                  </TableCell>
                )}
                {on("source") && (
                  <TableCell className={cellCls}>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SOURCE_META[r.source].tone}`}
                    >
                      {SOURCE_META[r.source].short}
                    </span>
                  </TableCell>
                )}
                {on("bucket") && (
                  <TableCell className={cellCls}>
                    <BucketPill bucket={r.bucket} tier={r.tier} />
                  </TableCell>
                )}
                {on("date") && (
                  <TableCell
                    className={`${cellCls} whitespace-nowrap text-sm text-muted-foreground`}
                  >
                    {fmtWhen(r)}
                  </TableCell>
                )}
                {on("location") && (
                  <TableCell className={`${cellCls} max-w-[220px] text-sm`}>
                    <span className="line-clamp-1 text-muted-foreground">
                      {r.location ?? <span className="italic">Location unconfirmed</span>}
                    </span>
                  </TableCell>
                )}
                {on("tier") && (
                  <TableCell className={`${cellCls} text-sm`}>
                    {r.tier ? (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold">
                        {r.tier === "UNS" ? "Unsanctioned" : r.tier}
                      </span>
                    ) : r.source === "pdga" ? (
                      <span className="text-xs italic text-muted-foreground">Tier unconfirmed</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not PDGA sanctioned</span>
                    )}
                  </TableCell>
                )}
                {on("divisions") && (
                  <TableCell className={`${cellCls} max-w-[260px]`}>
                    {r.divisions.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {r.divisions.slice(0, 4).map((d) => (
                          <span
                            key={d}
                            className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase"
                          >
                            {d}
                          </span>
                        ))}
                        {r.divisions.length > 4 ? (
                          <span className="text-[10px] text-muted-foreground">
                            +{r.divisions.length - 4}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                )}
                {on("status") && (
                  <TableCell className={cellCls}>
                    {r.status ? (
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {r.status.replace(/_/g, " ")}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                {on("crew") && (
                  <TableCell className={`${cellCls} text-sm`}>
                    {r.crew_count && r.crew_count > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <Users className="h-3 w-3" />
                        {r.crew_count}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className={`${cellCls} whitespace-nowrap`}>
                  <div className="flex items-center gap-1">
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
                      className="h-7 px-2 text-xs"
                      label="Track this event"
                    />
                    {r.register ? <EventRegisterButton row={r} /> : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
