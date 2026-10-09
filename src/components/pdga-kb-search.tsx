import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, MapPin, ExternalLink, Trophy, Calendar, Users, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  kbSearchCourses,
  kbSearchPlayers,
  kbSearchEvents,
  type KbCourse,
  type KbPlayer,
  type KbEvent,
} from "@/lib/pdga-kb-lookup.functions";

type Kind = "courses" | "players" | "events";

type Props = {
  defaultTab?: Kind;
  compact?: boolean;
  onCourse?: (c: KbCourse) => void;
  onPlayer?: (p: KbPlayer) => void;
  onEvent?: (e: KbEvent) => void;
};

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function PdgaKbSearch({
  defaultTab = "courses",
  compact,
  onCourse,
  onPlayer,
  onEvent,
}: Props) {
  const [tab, setTab] = useState<Kind>(defaultTab);
  const [q, setQ] = useState("");
  const term = useDebounced(q);

  const runCourses = useServerFn(kbSearchCourses);
  const runPlayers = useServerFn(kbSearchPlayers);
  const runEvents = useServerFn(kbSearchEvents);

  const courses = useQuery({
    queryKey: ["kb-courses", term],
    queryFn: () => runCourses({ data: { q: term, limit: compact ? 8 : 20 } }),
    enabled: tab === "courses",
    staleTime: 30_000,
  });
  const players = useQuery({
    queryKey: ["kb-players", term],
    queryFn: () => runPlayers({ data: { q: term, limit: compact ? 8 : 20 } }),
    enabled: tab === "players",
    staleTime: 30_000,
  });
  const events = useQuery({
    queryKey: ["kb-events", term],
    queryFn: () => runEvents({ data: { q: term, limit: compact ? 8 : 20 } }),
    enabled: tab === "events",
    staleTime: 30_000,
  });

  const active = tab === "courses" ? courses : tab === "players" ? players : events;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Database className="h-3.5 w-3.5" />
        <span>PDGA Knowledge Base — courses, players, events curated from pdga.com</span>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Kind)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="courses">
            <MapPin className="mr-1.5 h-3.5 w-3.5" />
            Courses
          </TabsTrigger>
          <TabsTrigger value="players">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Players
          </TabsTrigger>
          <TabsTrigger value="events">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            Events
          </TabsTrigger>
        </TabsList>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              tab === "courses"
                ? "Search PDGA courses by name, city, or state…"
                : tab === "players"
                  ? "Search by name or PDGA #…"
                  : "Search events by name, host, or city…"
            }
            className="pl-9"
          />
        </div>

        <TabsContent value="courses" className="mt-3">
          <ResultList loading={courses.isLoading} empty={(courses.data ?? []).length === 0}>
            {(courses.data ?? []).map((c) => (
              <KbRow
                key={c.id}
                title={c.name}
                subtitle={[
                  [c.city, c.state].filter(Boolean).join(", "),
                  c.hole_count ? `${c.hole_count} holes` : null,
                  c.designer,
                ]
                  .filter(Boolean)
                  .join(" • ")}
                href={c.pdga_url}
                onSelect={onCourse ? () => onCourse(c) : undefined}
              />
            ))}
          </ResultList>
        </TabsContent>

        <TabsContent value="players" className="mt-3">
          <ResultList loading={players.isLoading} empty={(players.data ?? []).length === 0}>
            {(players.data ?? []).map((p) => (
              <KbRow
                key={p.id}
                title={`${p.name} · #${p.pdga_number}`}
                subtitle={[
                  p.rating ? `${p.rating} rating` : null,
                  p.class,
                  [p.city, p.state].filter(Boolean).join(", "),
                  p.career_wins ? `${p.career_wins} wins` : null,
                ]
                  .filter(Boolean)
                  .join(" • ")}
                href={p.pdga_url}
                icon={<Trophy className="h-3.5 w-3.5 text-amber-500" />}
                onSelect={onPlayer ? () => onPlayer(p) : undefined}
              />
            ))}
          </ResultList>
        </TabsContent>

        <TabsContent value="events" className="mt-3">
          <ResultList loading={events.isLoading} empty={(events.data ?? []).length === 0}>
            {(events.data ?? []).map((e) => (
              <KbRow
                key={e.id}
                title={e.name}
                subtitle={[
                  e.tier ? `Tier ${e.tier}` : null,
                  e.start_date,
                  [e.city, e.state].filter(Boolean).join(", "),
                  e.host_club,
                ]
                  .filter(Boolean)
                  .join(" • ")}
                href={e.pdga_url}
                onSelect={onEvent ? () => onEvent(e) : undefined}
              />
            ))}
          </ResultList>
        </TabsContent>
      </Tabs>

      {active.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {(active.error as Error).message}
        </div>
      ) : null}
    </div>
  );
}

function ResultList({
  loading,
  empty,
  children,
}: {
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  if (loading)
    return (
      <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
        Searching the PDGA knowledge base…
      </div>
    );
  if (empty)
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        No matches yet. Try a different search — the KB grows as super admins seed regions.
      </div>
    );
  return (
    <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
      {children}
    </div>
  );
}

function KbRow({
  title,
  subtitle,
  href,
  icon,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  href?: string | null;
  icon?: React.ReactNode;
  onSelect?: () => void;
}) {
  const body = (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate font-medium">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          pdga.com <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className="block w-full text-left">
        {body}
      </button>
    );
  }
  return body;
}
