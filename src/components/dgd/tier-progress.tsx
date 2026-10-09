/** Phase 9 — Tier progress + career panel, read from stored Tier state (never computed in the browser). */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CATEGORY_LABEL, CATEGORY_MAX, TIER_LABEL, type Category, type Tier } from "@/lib/dgd-tier/engine";
import { DgdBadge, TIER_EXPLAINER } from "./dgd-badge";

type TierRow = {
  current_tier: Tier; highest_tier_earned: Tier; tier_score: number; tier_version: string; tier_earned_at: string;
  categories: Record<Category, number | { points: number }>;
  career: Record<string, any>;
  next_tier: { tier: Tier; score_needed: number; score_reached: boolean; requirements: { key: string; label: string; met: boolean }[] } | null;
};

export function useTierState(userId: string | null | undefined) {
  return useQuery({
    queryKey: ["dgd-tier-state", userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_tier_state", { _user: userId });
      if (error) throw error;
      return ((Array.isArray(data) ? data[0] : data) ?? null) as TierRow | null;
    },
  });
}

const CREDENTIAL_LABEL: Record<string, string> = {
  PDGA_OFFICIAL: "PDGA Official", TOURNAMENT_DIRECTOR: "Tournament Director", LEAGUE_DIRECTOR: "League Director",
  COURSE_STEWARD: "Course Steward", CLUB_ORGANIZER: "Club Organizer", COURSE_DESIGNER: "Course Designer",
};

export function CredentialChips({ credentials }: { credentials?: string[] | null }) {
  if (!credentials?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {credentials.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">
          <CheckCircle2 className="h-3 w-3 text-success" aria-hidden /> {CREDENTIAL_LABEL[c] ?? c}
        </span>
      ))}
    </div>
  );
}

const CAREER_ROWS: { key: string; label: string; source: string }[] = [
  { key: "years_active", label: "Years active", source: "Since your first verified round" },
  { key: "verified_rounds", label: "Verified rounds", source: "PDGA, UDisc and DG Dashboard rounds, duplicates removed" },
  { key: "events_played", label: "Events played", source: "Unique PDGA events, leagues and tournaments" },
  { key: "unique_courses", label: "Unique courses", source: "Courses, not layouts" },
  { key: "events_directed", label: "Events directed", source: "Completed tournaments you ran in DG Dashboard" },
  { key: "leagues_organized", label: "Leagues organized", source: "Active or completed leagues you own" },
  { key: "courses_stewarded", label: "Courses stewarded", source: "Verified course steward credential" },
  { key: "community_contributions", label: "Community contributions", source: "Points from approved course and community contributions" },
];

export function CareerPanel({ career }: { career: Record<string, any> }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {CAREER_ROWS.map((r) => (
        <div key={r.key} title={r.source} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{r.label}</dt>
          <dd className="text-base font-semibold tabular-nums">{career?.[r.key] ?? 0}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Statboard card: badge, category progress, next-tier requirements, and the Rating vs Tier explanation. */
export function TierProgressCard({ userId, rating }: { userId: string | null | undefined; rating: number | null }) {
  const q = useTierState(userId);
  const t = q.data;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="DGD Tier">
      <div className="flex flex-wrap items-start gap-4">
        <DgdBadge tier={t?.current_tier} rating={rating} size="lg" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-semibold">DGD Tier{t ? ` · ${TIER_LABEL[t.current_tier]}` : ""}</h3>
          <p className="text-sm text-muted-foreground">{TIER_EXPLAINER}</p>
          {!t && !q.isLoading ? <p className="text-sm text-muted-foreground">Your Tier is being worked out from your verified history. Everyone starts at Green.</p> : null}
          {t ? <CredentialChips credentials={t.career?.credentials} /> : null}
        </div>
      </div>
      {t ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Experience & contribution · {Math.round(t.tier_score)}/100</h4>
            <ul className="space-y-2">
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => {
                const raw = t.categories?.[c] ?? 0;
                const v = { points: typeof raw === "number" ? raw : raw.points, max: CATEGORY_MAX[c] };
                const pct = v.max ? Math.min(100, (v.points / v.max) * 100) : 0;
                return (
                  <li key={c}>
                    <div className="flex justify-between text-sm"><span>{CATEGORY_LABEL[c]}</span><span className="tabular-nums text-muted-foreground">{Math.round(v.points)}/{v.max}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            {t.next_tier ? (
              <>
                <h4 className="mb-2 text-sm font-semibold">Progress to {TIER_LABEL[t.next_tier.tier]}</h4>
                <p className="mb-2 text-sm text-muted-foreground">
                  {t.next_tier.score_reached ? `${TIER_LABEL[t.next_tier.tier]} score reached.` : `${Math.max(0, Math.ceil(t.next_tier.score_needed - t.tier_score))} more points needed.`}
                  {t.next_tier.requirements.some((r) => !r.met) ? " Requirements still open below." : ""}
                </p>
                <ul className="space-y-1.5">
                  {t.next_tier.requirements.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 text-sm">
                      {r.met ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> : <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />}
                      <span className={r.met ? "" : "text-muted-foreground"}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-sm text-muted-foreground">Gold is the highest Tier. Thanks for everything you give to the sport.</p>}
          </div>
          <div className="lg:col-span-2">
            <h4 className="mb-2 text-sm font-semibold">Career</h4>
            <CareerPanel career={t.career} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
