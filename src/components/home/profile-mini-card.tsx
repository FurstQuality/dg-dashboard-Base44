import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, type ProfileRow } from "@/lib/current-user";
import { useUserProgress } from "@/hooks/use-progress";
import { Flame, Trophy, Sparkles } from "lucide-react";

/**
 * Compact profile card for the home left rail.
 * Target height ~140px. Full-card link to /me.
 */
export function ProfileMiniCard({ profile }: { profile: ProfileRow | null }) {
  const { progress } = useUserProgress(profile?.id);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="h-8 bg-gradient-to-r from-primary/30 via-primary/15 to-accent/25" />
      <div className="-mt-6 flex items-center gap-3 px-3 pb-2 pt-0">
        <Link to="/me" aria-label="Open profile" className="shrink-0">
          <Avatar className="h-12 w-12 border-4 border-card ring-1 ring-border">
            {profile?.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt={`${profile?.display_name ?? "Player"} avatar`}
              />
            ) : null}
            <AvatarFallback>{initials(profile?.display_name)}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="mt-6 min-w-0 flex-1">
          <Link to="/me" className="block truncate text-sm font-semibold hover:underline">
            {profile?.display_name ?? "Player"}
          </Link>
          <p className="text-[11px] text-muted-foreground">
            @{profile?.username ?? "player"}
            {profile?.pdga_number ? (
              <>
                <br />
                PDGA #{profile.pdga_number}
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3">
        <Link
          to="/stats"
          className="rounded-lg border border-border bg-background/60 py-1.5 text-center hover:bg-muted"
        >
          <div className="flex items-center justify-center gap-1 text-primary">
            <Trophy className="h-3 w-3" />
            <span className="text-sm font-semibold tabular-nums">
              {profile?.pdga_rating ?? "—"}
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">Rating</div>
        </Link>
        <Link
          to="/challenges"
          className="rounded-lg border border-border bg-background/60 py-1.5 text-center hover:bg-muted"
        >
          <div className="flex items-center justify-center gap-1 text-amber-500">
            <Sparkles className="h-3 w-3" />
            <span className="text-sm font-semibold tabular-nums">Lv {progress?.level ?? 0}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">Level</div>
        </Link>
        <Link
          to="/challenges"
          className="rounded-lg border border-border bg-background/60 py-1.5 text-center hover:bg-muted"
        >
          <div className="flex items-center justify-center gap-1 text-orange-500">
            <Flame className="h-3 w-3" />
            <span className="text-sm font-semibold tabular-nums">{progress?.streak_days ?? 0}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">Streak</div>
        </Link>
      </div>
    </div>
  );
}
