import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type DuplicateCourseMatch = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  slug: string | null;
  hole_count: number | null;
  layout_count: number | null;
  match_reason: string | null;
};

/**
 * Live duplicate check for the course builder. Calls the shared
 * find_duplicate_courses lookup so the same match rules used by the database
 * guard are surfaced before the player spends time drawing holes.
 */
export function DuplicateCourseWarning({
  name,
  city,
  state,
  lat,
  lng,
  excludeId,
}: {
  name: string;
  city?: string;
  state?: string;
  lat?: number | null;
  lng?: number | null;
  excludeId?: string;
}) {
  const [matches, setMatches] = useState<DuplicateCourseMatch[]>([]);
  const trimmed = name.trim();

  useEffect(() => {
    if (trimmed.length < 4) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("find_duplicate_courses", {
        _name: trimmed,
        _city: city?.trim() || undefined,
        _state: state?.trim() || undefined,
        _lat: typeof lat === "number" ? lat : undefined,
        _lng: typeof lng === "number" ? lng : undefined,
        _exclude_id: excludeId ?? undefined,
      });
      if (cancelled) return;
      setMatches(error ? [] : ((data ?? []) as DuplicateCourseMatch[]));
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed, city, state, lat, lng, excludeId]);

  if (!matches.length) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
        <AlertTriangle className="h-4 w-4" />
        {matches.length === 1
          ? "This course is already in the library"
          : "Possible matches already in the library"}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Add your layout to the existing course so scores, ratings, and reviews stay together.
      </p>
      <ul className="mt-2 space-y-1.5">
        {matches.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {[m.city, m.state].filter(Boolean).join(", ") || "Location not recorded"}
                {" · "}
                {(m.layout_count ?? 0) > 0
                  ? `${m.layout_count} layout${(m.layout_count ?? 0) === 1 ? "" : "s"} ready for scoring`
                  : "No scoring layout yet"}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to="/courses/$courseId"
                params={{ courseId: m.id }}
                className="rounded-md border border-input px-2 py-1 text-xs hover:bg-muted"
              >
                View course
              </Link>
              <Link
                to="/courses/$courseId/edit"
                params={{ courseId: m.id }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                <Pencil className="h-3 w-3" />
                {(m.layout_count ?? 0) > 0 ? "Edit layout" : "Build layout"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
