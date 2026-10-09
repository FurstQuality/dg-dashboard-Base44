/**
 * Portfolio-wide Event Director read: every tournament and league the signed-in
 * organizer runs, rolled up into sign-ups, money, prep progress, recaps, and
 * the venue feedback that tells them whether the events were any good.
 *
 * RLS plus an explicit owner filter gates every row — no admin client.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PortfolioEventKind = "tournament" | "league";

export type PortfolioEvent = {
  id: string;
  kind: PortfolioEventKind;
  name: string;
  slug: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  courseName: string | null;
  signups: number;
  capacity: number | null;
  checkedIn: number;
  feesCollectedCents: number;
  feesOutstandingCents: number;
  prepDone: number;
  prepTotal: number;
  sanctioned: boolean;
  /** League nights or tournament rounds on the calendar. */
  dates: number;
};

export type PortfolioReview = {
  id: string;
  courseName: string;
  rating: number;
  body: string | null;
  createdAt: string;
};

export type PortfolioIssue = {
  id: string;
  courseName: string;
  kind: string;
  description: string | null;
  status: string;
  confirmCount: number;
  createdAt: string;
};

export type DirectorPortfolio = {
  totals: {
    events: number;
    tournaments: number;
    leagues: number;
    upcoming: number;
    signups: number;
    signupsLast30: number;
    checkedIn: number;
    feesCollectedCents: number;
    feesOutstandingCents: number;
    prepDone: number;
    prepTotal: number;
  };
  upcoming: PortfolioEvent[];
  recaps: PortfolioEvent[];
  reviews: PortfolioReview[];
  issues: PortfolioIssue[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export const getDirectorPortfolio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DirectorPortfolio> => {
    const { supabase, userId } = context;
    const today = day(new Date());
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [tRows, lRows] = await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id, name, slug, status, start_date, end_date, max_players, entry_fee_cents, course_id, pdga_sanctioned",
        )
        .eq("owner_id", userId)
        .order("start_date", { ascending: false })
        .limit(100),
      supabase
        .from("leagues")
        .select(
          "id, name, slug, status, start_date, end_date, entry_fee_cents, course_id, pdga_sanctioned",
        )
        .eq("owner_id", userId)
        .order("start_date", { ascending: false })
        .limit(100),
    ]);

    const tournaments = tRows.data ?? [];
    const leagues = lRows.data ?? [];
    const tIds = tournaments.map((t) => t.id);
    const lIds = leagues.map((l) => l.id);
    const courseIds = [
      ...new Set(
        [...tournaments, ...leagues].map((e) => e.course_id).filter((v): v is string => !!v),
      ),
    ];

    const none = <T>() => Promise.resolve({ data: [] as T[] });

    const [tRegs, tDivs, tChecks, tRounds, lRegs, lChecks, lEvents, lCheckins, courses] =
      await Promise.all([
        tIds.length
          ? supabase
              .from("tournament_registrations")
              .select("tournament_id, status, payment_status, division_id, created_at")
              .in("tournament_id", tIds)
          : none<{
              tournament_id: string;
              status: string;
              payment_status: string;
              division_id: string | null;
              created_at: string;
            }>(),
        tIds.length
          ? supabase
              .from("tournament_divisions")
              .select("id, tournament_id, entry_fee_cents")
              .in("tournament_id", tIds)
          : none<{ id: string; tournament_id: string; entry_fee_cents: number | null }>(),
        tIds.length
          ? supabase
              .from("tournament_checklist_items")
              .select("tournament_id, done")
              .in("tournament_id", tIds)
          : none<{ tournament_id: string; done: boolean }>(),
        tIds.length
          ? supabase.from("tournament_rounds").select("tournament_id").in("tournament_id", tIds)
          : none<{ tournament_id: string }>(),
        lIds.length
          ? supabase
              .from("league_registrations")
              .select("league_id, status, created_at")
              .in("league_id", lIds)
          : none<{ league_id: string; status: string; created_at: string }>(),
        lIds.length
          ? supabase.from("league_checklist_items").select("league_id, done").in("league_id", lIds)
          : none<{ league_id: string; done: boolean }>(),
        lIds.length
          ? supabase
              .from("league_events")
              .select("league_id, event_date, course_id")
              .in("league_id", lIds)
          : none<{ league_id: string; event_date: string; course_id: string | null }>(),
        lIds.length
          ? supabase.from("league_event_checkins").select("league_id, paid").in("league_id", lIds)
          : none<{ league_id: string; paid: boolean }>(),
        courseIds.length
          ? supabase.from("courses").select("id, name").in("id", courseIds)
          : none<{ id: string; name: string }>(),
      ]);

    const courseName = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
    const divisionFee = new Map(
      (tDivs.data ?? []).map((d) => [d.id, d.entry_fee_cents ?? 0] as const),
    );

    let signupsLast30 = 0;

    const tournamentEvents: PortfolioEvent[] = tournaments.map((t) => {
      const regs = (tRegs.data ?? []).filter((r) => r.tournament_id === t.id);
      let collected = 0;
      let outstanding = 0;
      let checkedIn = 0;
      let signups = 0;
      for (const r of regs) {
        if (r.status === "withdrawn") continue;
        signups += 1;
        if (r.created_at >= since30) signupsLast30 += 1;
        if (r.status === "checked_in") checkedIn += 1;
        const fee =
          (r.division_id ? divisionFee.get(r.division_id) : undefined) ?? t.entry_fee_cents ?? 0;
        if (r.payment_status === "paid") collected += fee;
        else if (r.payment_status === "unpaid") outstanding += fee;
      }
      const checks = (tChecks.data ?? []).filter((c) => c.tournament_id === t.id);
      return {
        id: t.id,
        kind: "tournament",
        name: t.name,
        slug: t.slug,
        status: t.status,
        startDate: t.start_date,
        endDate: t.end_date,
        courseName: t.course_id ? (courseName.get(t.course_id) ?? null) : null,
        signups,
        capacity: t.max_players ?? null,
        checkedIn,
        feesCollectedCents: collected,
        feesOutstandingCents: outstanding,
        prepDone: checks.filter((c) => c.done).length,
        prepTotal: checks.length,
        sanctioned: !!t.pdga_sanctioned,
        dates: (tRounds.data ?? []).filter((r) => r.tournament_id === t.id).length,
      };
    });

    const leagueEvents: PortfolioEvent[] = leagues.map((l) => {
      const regs = (lRegs.data ?? []).filter((r) => r.league_id === l.id);
      const active = regs.filter((r) => r.status !== "withdrawn");
      for (const r of active) if (r.created_at >= since30) signupsLast30 += 1;
      const checkins = (lCheckins.data ?? []).filter((c) => c.league_id === l.id);
      const fee = l.entry_fee_cents ?? 0;
      const checks = (lChecks.data ?? []).filter((c) => c.league_id === l.id);
      const nights = (lEvents.data ?? []).filter((e) => e.league_id === l.id);
      return {
        id: l.id,
        kind: "league",
        name: l.name,
        slug: l.slug,
        status: l.status,
        startDate: l.start_date,
        endDate: l.end_date,
        courseName: l.course_id ? (courseName.get(l.course_id) ?? null) : null,
        signups: active.length,
        capacity: null,
        checkedIn: checkins.length,
        feesCollectedCents: checkins.filter((c) => c.paid).length * fee,
        feesOutstandingCents: checkins.filter((c) => !c.paid).length * fee,
        prepDone: checks.filter((c) => c.done).length,
        prepTotal: checks.length,
        sanctioned: !!(l as { pdga_sanctioned?: boolean | null }).pdga_sanctioned,
        dates: nights.length,
      };
    });

    const all = [...tournamentEvents, ...leagueEvents];
    const isUpcoming = (e: PortfolioEvent) => (e.endDate ?? e.startDate ?? today) >= today;
    const byDateAsc = (a: PortfolioEvent, b: PortfolioEvent) =>
      (a.startDate ?? "").localeCompare(b.startDate ?? "");

    const upcoming = all.filter(isUpcoming).sort(byDateAsc);
    const recaps = all
      .filter((e) => !isUpcoming(e))
      .sort((a, b) => byDateAsc(b, a))
      .slice(0, 6);

    const [reviewRows, issueRows] = await Promise.all([
      courseIds.length
        ? supabase
            .from("course_reviews")
            .select("id, course_id, rating, body, created_at")
            .in("course_id", courseIds)
            .order("created_at", { ascending: false })
            .limit(8)
        : none<{
            id: string;
            course_id: string;
            rating: number;
            body: string | null;
            created_at: string;
          }>(),
      courseIds.length
        ? supabase
            .from("course_reports")
            .select("id, course_id, kind, description, status, confirm_count, created_at")
            .in("course_id", courseIds)
            .in("status", ["open", "confirmed"])
            .order("created_at", { ascending: false })
            .limit(8)
        : none<{
            id: string;
            course_id: string;
            kind: string;
            description: string | null;
            status: string;
            confirm_count: number | null;
            created_at: string;
          }>(),
    ]);

    return {
      totals: {
        events: all.length,
        tournaments: tournamentEvents.length,
        leagues: leagueEvents.length,
        upcoming: upcoming.length,
        signups: all.reduce((n, e) => n + e.signups, 0),
        signupsLast30,
        checkedIn: all.reduce((n, e) => n + e.checkedIn, 0),
        feesCollectedCents: all.reduce((n, e) => n + e.feesCollectedCents, 0),
        feesOutstandingCents: all.reduce((n, e) => n + e.feesOutstandingCents, 0),
        prepDone: all.reduce((n, e) => n + e.prepDone, 0),
        prepTotal: all.reduce((n, e) => n + e.prepTotal, 0),
      },
      upcoming: upcoming.slice(0, 8),
      recaps,
      reviews: (reviewRows.data ?? []).map((r) => ({
        id: r.id,
        courseName: courseName.get(r.course_id) ?? "Your venue",
        rating: r.rating ?? 0,
        body: r.body,
        createdAt: r.created_at,
      })),
      issues: (issueRows.data ?? []).map((r) => ({
        id: r.id,
        courseName: courseName.get(r.course_id) ?? "Your venue",
        kind: r.kind,
        description: r.description,
        status: r.status,
        confirmCount: r.confirm_count ?? 0,
        createdAt: r.created_at,
      })),
    };
  });
