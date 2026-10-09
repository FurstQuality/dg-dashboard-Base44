/**
 * The one event picker every Director desk uses. A director with a long history
 * of events can type to find one instead of scrolling a capped list, and the
 * search runs in the database so events beyond the first page are still
 * reachable.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getDirectorEvents } from "@/lib/director.functions";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export function useDirectorEventOptions(
  userId: string | null | undefined,
  search: string,
) {
  const fetchEvents = useServerFn(getDirectorEvents);
  const term = useDebouncedValue(search.trim(), 250);
  return useQuery({
    queryKey: directorKeys.events(userId, term),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchEvents({ data: term ? { search: term } : {} }),
  });
}

export function DirectorEventPicker({
  id,
  userId,
  value,
  onChange,
  allLabel,
  placeholder = "Pick one of your events",
}: {
  id: string;
  userId: string | null | undefined;
  /** Selected event id, or "all" when allLabel is provided. */
  value: string;
  onChange: (value: string) => void;
  /** When set, the list gets an "all events" entry with this label. */
  allLabel?: string;
  placeholder?: string;
}) {
  const [term, setTerm] = useState("");
  const query = useDirectorEventOptions(userId, term);
  const events = query.data ?? [];
  const selectedMissing = useMemo(
    () => !!value && value !== "all" && !events.some((e) => e.id === value),
    [events, value],
  );

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div className="sticky top-0 z-10 bg-popover p-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Search your events"
              className="h-8 pl-7 text-sm"
              aria-label="Search your events"
            />
          </div>
        </div>
        {allLabel ? <SelectItem value="all">{allLabel}</SelectItem> : null}
        {events.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
        {/* Keeps the current selection valid while a search narrows the list. */}
        {selectedMissing ? (
          <SelectItem value={value}>Selected event</SelectItem>
        ) : null}
        {query.isSuccess && events.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {term ? "No events match that search." : "No events yet."}
          </p>
        ) : null}
      </SelectContent>
    </Select>
  );
}
