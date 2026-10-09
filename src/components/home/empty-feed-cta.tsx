import { Link } from "@tanstack/react-router";
import { UserPlus, Building2, Map } from "lucide-react";

/**
 * Compact horizontal empty-state for a quiet personal feed.
 * Rendered above discovery content, never as the full page.
 */
export function EmptyFeedCta() {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-card to-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Your personal feed is quiet.</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Follow players, clubs, courses, and tournaments to see more here.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link
            to="/friends"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-xs font-medium hover:bg-muted"
          >
            <UserPlus className="h-3.5 w-3.5 text-primary" />
            Find players
          </Link>
          <Link
            to="/community"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-xs font-medium hover:bg-muted"
          >
            <Building2 className="h-3.5 w-3.5 text-purple-500" />
            Local clubs
          </Link>
          <Link
            to="/course-book"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background/60 px-2.5 text-xs font-medium hover:bg-muted"
          >
            <Map className="h-3.5 w-3.5 text-emerald-500" />
            Nearby courses
          </Link>
        </div>
      </div>
    </div>
  );
}
