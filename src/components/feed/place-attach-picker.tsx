import { useEffect, useMemo, useState } from "react";
import { MapPin, Trophy, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export type AttachedPlace = {
  kind: "course" | "event";
  id: string;
  name: string;
  location: string | null;
  detail: string | null;
};

/**
 * Lets a player attach a real course (check-ins, aces) or a tournament
 * (tournament posts) to a feed post so the card links to verified data
 * instead of free-text.
 */
export function PlaceAttachPicker({
  mode,
  value,
  onChange,
}: {
  mode: "course" | "event" | "league";
  value: AttachedPlace | null;
  onChange: (next: AttachedPlace | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AttachedPlace[]>([]);
  const [loading, setLoading] = useState(false);

  const placeholder = useMemo(
    () =>
      mode === "course"
        ? "Search courses by name or city"
        : mode === "league"
          ? "Search leagues by name"
          : "Search tournaments by name",
    [mode],
  );

  useEffect(() => {
    const term = query.trim();
    if (value || term.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        if (mode === "course") {
          const { data } = await supabase
            .from("courses")
            .select("id, name, city, state, hole_count")
            .eq("moderation_status", "approved")
            .or(`name.ilike.%${term}%,city.ilike.%${term}%`)
            .order("name", { ascending: true })
            .limit(8);
          if (cancelled) return;
          setResults(
            (data ?? []).map((c) => ({
              kind: "course" as const,
              id: c.id,
              name: c.name,
              location: [c.city, c.state].filter(Boolean).join(", ") || null,
              detail: c.hole_count ? `${c.hole_count} holes` : null,
            })),
          );
        } else if (mode === "league") {
          const { data } = await supabase
            .from("leagues")
            .select("id, name, season, start_date")
            .ilike("name", `%${term}%`)
            .order("start_date", { ascending: false })
            .limit(8);
          if (cancelled) return;
          setResults(
            (data ?? []).map((l) => ({
              kind: "event" as const,
              id: l.id,
              name: l.name,
              location: l.season ?? null,
              detail: l.start_date
                ? `League · starts ${new Date(`${l.start_date}T12:00:00`).toLocaleDateString()}`
                : "League",
            })),
          );
        } else {
          const { data } = await supabase
            .from("tournaments")
            .select("id, name, location, start_date")
            .ilike("name", `%${term}%`)
            .order("start_date", { ascending: false })
            .limit(8);
          if (cancelled) return;
          setResults(
            (data ?? []).map((t) => ({
              kind: "event" as const,
              id: t.id,
              name: t.name,
              location: t.location ?? null,
              detail: t.start_date
                ? new Date(`${t.start_date}T12:00:00`).toLocaleDateString()
                : null,
            })),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, mode, value]);

  const Icon = mode === "course" ? MapPin : Trophy;

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{value.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[value.location, value.detail].filter(Boolean).join(" · ") || "Attached"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Remove attachment"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-2">
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-7 flex-1 bg-transparent text-xs outline-none"
          aria-label={placeholder}
        />
      </div>
      {loading ? (
        <div className="px-1 pt-2 text-xs text-muted-foreground">Searching…</div>
      ) : results.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setQuery("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-muted"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {[r.location, r.detail].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 ? (
        <div className="px-1 pt-2 text-xs text-muted-foreground">
          {mode === "course"
            ? "No matching courses yet — you can still type a location above."
            : "No matching events yet."}
        </div>
      ) : null}
    </div>
  );
}
