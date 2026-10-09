/**
 * Event Director server reads and roster mutations.
 *
 * Everything an organizer needs to answer "what needs my attention right now?"
 * — event structure, registration state, money, checklist, staff — aggregated
 * server-side and permission-checked as the signed-in user. No admin client:
 * RLS plus an explicit owner/co-director check gates every row.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DirectorEvent, DirectorRegistrationCounts } from "@/lib/director-alerts";
import { DIRECTOR_LIMITS } from "@/lib/director-queries";
import { buildEventKit, emptyCounts, daysUntil, type EventKit } from "@/lib/director-kit";

export type DirectorCockpit = {
  events: DirectorEvent[];
  counts: { tournaments: number; leagues: number; clubs: number; drafts: number };
  leagues: {
    id: string;
    name: string;
    slug: string;
    status: string;
    startDate: string | null;
    players: number;
    /** Next scheduled night (today or later), so a season shows its real play dates. */
    nextNight: { date: string; startTime: string | null; week: number } | null;
  }[];
  /** A league night you run that plays today. */
  hostingLeagueToday: { id: string; name: string; slug: string } | null;
};

export type DirectorEventOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startDate: string;
  role: "owner" | "co_td";
};

export type DirectorRegistrationRow = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  pdgaNumber: string | null;
  divisionId: string | null;
  divisionName: string | null;
  status: string;
  paymentStatus: string;
  entryFeeCents: number;
  createdAt: string;
  notes: string | null;
};

export type DirectorRegistrationsPage = {
  rows: DirectorRegistrationRow[];
  total: number;
  page: number;
  pageSize: number;
  totals: DirectorRegistrationCounts & { feesCollectedCents: number; feesOutstandingCents: number };
};

export type DirectorStaffRow = {
  id: string;
  userId: string;
  role: string;
  notes: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type DirectorChecklistItem = {
  id: string;
  label: string;
  phase: string;
  done: boolean;
  sortOrder: number;
};

/* ------------------------------------------------------------------ */
/* Cockpit — the organizer's "what needs me" read                      */
/* ------------------------------------------------------------------ */
export const getDirectorCockpit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DirectorCockpit> => {
    const { supabase, userId } = context;
    // US Central calendar day, so evening events aren't already "tomorrow" in UTC.
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const [staffRows, ownedCount, leagueCount, clubCount, draftCount] = await Promise.all([
      supabase
        .from("tournament_staff")
        .select("tournament_id, role")
        .eq("user_id", userId)
        .eq("role", "co_td"),
      supabase
        .from("tournaments")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      supabase.from("leagues").select("id", { count: "exact", head: true }).eq("owner_id", userId),
      supabase
        .from("club_members")
        .select("club_id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("role", ["owner", "admin"]),
      supabase
        .from("content_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "draft"),
    ]);

    const coTdIds = (staffRows.data ?? []).map((r) => r.tournament_id);

    // Upcoming / live events first, then the most recent finished one for wrap-up.
    const upcoming = await supabase
      .from("tournaments")
      .select(
        "id, name, slug, status, start_date, end_date, location, course_id, layout_id, max_players, pdga_sanctioned, entry_fee_cents, owner_id",
      )
      .or(`owner_id.eq.${userId}${coTdIds.length ? `,id.in.(${coTdIds.join(",")})` : ""}`)
      .gte("end_date", todayIso)
      .order("start_date", { ascending: true })
      .limit(DIRECTOR_LIMITS.cockpitEvents);

    let rows = upcoming.data ?? [];
    if (rows.length === 0) {
      const recent = await supabase
        .from("tournaments")
        .select(
          "id, name, slug, status, start_date, end_date, location, course_id, layout_id, max_players, pdga_sanctioned, entry_fee_cents, owner_id",
        )
        .or(`owner_id.eq.${userId}${coTdIds.length ? `,id.in.(${coTdIds.join(",")})` : ""}`)
        .order("start_date", { ascending: false })
        .limit(2);
      rows = recent.data ?? [];
    }

    const ids = rows.map((r) => r.id);
    const courseIds = [...new Set(rows.map((r) => r.course_id).filter((v): v is string => !!v))];

    const [divisions, rounds, regs, checklist, staff, courses] = await Promise.all([
      ids.length
        ? supabase
            .from("tournament_divisions")
            .select("id, tournament_id, entry_fee_cents")
            .in("tournament_id", ids)
        : Promise.resolve({
            data: [] as { id: string; tournament_id: string; entry_fee_cents: number }[],
          }),
      ids.length
        ? supabase
            .from("tournament_rounds")
            .select("id, tournament_id, course_id, tee_time_start, shotgun_time")
            .in("tournament_id", ids)
        : Promise.resolve({
            data: [] as {
              id: string;
              tournament_id: string;
              course_id: string | null;
              tee_time_start: string | null;
              shotgun_time: string | null;
            }[],
          }),
      ids.length
        ? supabase
            .from("tournament_registrations")
            .select("id, tournament_id, status, payment_status, division_id")
            .in("tournament_id", ids)
        : Promise.resolve({
            data: [] as {
              id: string;
              tournament_id: string;
              status: string;
              payment_status: string;
              division_id: string | null;
            }[],
          }),
      ids.length
        ? supabase
            .from("tournament_checklist_items")
            .select("tournament_id, done")
            .in("tournament_id", ids)
        : Promise.resolve({ data: [] as { tournament_id: string; done: boolean }[] }),
      ids.length
        ? supabase.from("tournament_staff").select("tournament_id").in("tournament_id", ids)
        : Promise.resolve({ data: [] as { tournament_id: string }[] }),
      courseIds.length
        ? supabase.from("courses").select("id, name").in("id", courseIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const courseName = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
    const divisionFee = new Map((divisions.data ?? []).map((d) => [d.id, d.entry_fee_cents ?? 0]));

    const events: DirectorEvent[] = rows.map((t) => {
      const evDivisions = (divisions.data ?? []).filter((d) => d.tournament_id === t.id);
      const evRounds = (rounds.data ?? []).filter((r) => r.tournament_id === t.id);
      const evRegs = (regs.data ?? []).filter((r) => r.tournament_id === t.id);
      const evChecklist = (checklist.data ?? []).filter((c) => c.tournament_id === t.id);

      const counts = emptyCounts();
      let collected = 0;
      let outstanding = 0;
      for (const r of evRegs) {
        counts.total += 1;
        if (r.status === "pending") counts.pending += 1;
        if (r.status === "confirmed") counts.confirmed += 1;
        if (r.status === "waitlist") counts.waitlist += 1;
        if (r.status === "checked_in") counts.checkedIn += 1;
        if (r.status === "withdrawn") counts.withdrawn += 1;
        const fee =
          (r.division_id ? divisionFee.get(r.division_id) : undefined) ?? t.entry_fee_cents ?? 0;
        if (r.payment_status === "paid") {
          counts.paid += 1;
          collected += fee;
        } else if (r.payment_status === "unpaid" && r.status !== "withdrawn") {
          counts.unpaid += 1;
          outstanding += fee;
        }
      }

      const today = todayIso;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        startDate: t.start_date,
        endDate: t.end_date,
        location: t.location,
        courseId: t.course_id,
        layoutId: t.layout_id,
        courseName: t.course_id ? (courseName.get(t.course_id) ?? null) : null,
        maxPlayers: t.max_players,
        pdgaSanctioned: !!t.pdga_sanctioned,
        entryFeeCents: t.entry_fee_cents ?? 0,
        divisions: evDivisions.length,
        rounds: evRounds.length,
        roundsWithCourse: evRounds.filter((r) => !!r.course_id).length,
        roundsWithTeeTimes: evRounds.filter((r) => !!r.tee_time_start || !!r.shotgun_time).length,
        registrations: counts,
        feesCollectedCents: collected,
        feesOutstandingCents: outstanding,
        checklistDone: evChecklist.filter((c) => c.done).length,
        checklistTotal: evChecklist.length,
        staffCount: (staff.data ?? []).filter((s) => s.tournament_id === t.id).length,
        isLiveToday: t.start_date <= today && t.end_date >= today,
        daysOut: daysUntil(t.start_date),
      };
    });

    const leagueRows = await supabase
      .from("leagues")
      .select("id, name, slug, status, start_date")
      .eq("owner_id", userId)
      .order("start_date", { ascending: false })
      .limit(DIRECTOR_LIMITS.cockpitEvents);

    const leagueIds = (leagueRows.data ?? []).map((l) => l.id);
    let hostingLeagueToday: { id: string; name: string; slug: string } | null = null;
    const leagueRegs = leagueIds.length
      ? await supabase.from("league_registrations").select("league_id").in("league_id", leagueIds)
      : { data: [] as { league_id: string }[] };
    const upcomingNights = leagueIds.length
      ? await supabase
          .from("league_events")
          .select("league_id, event_date, start_time, week_number, status")
          .in("league_id", leagueIds)
          .gte("event_date", todayIso)
          .neq("status", "cancelled")
          .order("event_date", { ascending: true })
      : { data: [] as Array<{ league_id: string; event_date: string; start_time: string | null; week_number: number; status: string }> };
    const nextNight = new Map<string, { date: string; startTime: string | null; week: number }>();
    for (const n of upcomingNights.data ?? []) {
      if (!nextNight.has(n.league_id))
        nextNight.set(n.league_id, { date: n.event_date, startTime: n.start_time ?? null, week: n.week_number });
    }
    // A league night playing today counts as hosting today, like a tournament day.
    for (const l of leagueRows.data ?? []) {
      const n = nextNight.get(l.id);
      if (n && n.date.slice(0, 10) === todayIso && !events.some((e) => e.isLiveToday)) {
        hostingLeagueToday = { id: l.id, name: `${l.name} · Week ${n.week}`, slug: l.slug };
        break;
      }
    }

    return {
      hostingLeagueToday,
      events,
      counts: {
        tournaments: ownedCount.count ?? 0,
        leagues: leagueCount.count ?? 0,
        clubs: clubCount.count ?? 0,
        drafts: draftCount.count ?? 0,
      },
      leagues: (leagueRows.data ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        status: l.status,
        startDate: l.start_date,
        players: (leagueRegs.data ?? []).filter((r) => r.league_id === l.id).length,
        nextNight: nextNight.get(l.id) ?? null,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* Event picker — tournaments you can actually administer              */
/* ------------------------------------------------------------------ */
export const getDirectorEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ search: z.string().trim().max(80).optional() })
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DirectorEventOption[]> => {
    const { supabase, userId } = context;
    // Name search runs in the database so events past the option cap stay reachable.
    const term = data.search ? `%${data.search.replace(/[%_]/g, "")}%` : null;
    const ownedQuery = supabase
      .from("tournaments")
      .select("id, name, slug, status, start_date")
      .eq("owner_id", userId)
      .order("start_date", { ascending: false })
      .limit(DIRECTOR_LIMITS.eventOptions);
    const [owned, staff] = await Promise.all([
      term ? ownedQuery.ilike("name", term) : ownedQuery,
      supabase
        .from("tournament_staff")
        .select("tournament_id")
        .eq("user_id", userId)
        .eq("role", "co_td"),
    ]);
    const coIds = (staff.data ?? [])
      .map((s) => s.tournament_id)
      .filter((id) => !(owned.data ?? []).some((t) => t.id === id));
    const coQuery = supabase
      .from("tournaments")
      .select("id, name, slug, status, start_date")
      .in("id", coIds)
      .order("start_date", { ascending: false })
      .limit(DIRECTOR_LIMITS.eventOptions);
    const coRows = coIds.length
      ? await (term ? coQuery.ilike("name", term) : coQuery)
      : {
          data: [] as {
            id: string;
            name: string;
            slug: string;
            status: string;
            start_date: string;
          }[],
        };

    return [
      ...(owned.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        startDate: t.start_date,
        role: "owner" as const,
      })),
      ...(coRows.data ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        startDate: t.start_date,
        role: "co_td" as const,
      })),
    ].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  });

/* ------------------------------------------------------------------ */
/* Registrations desk                                                  */
/* ------------------------------------------------------------------ */
export const getDirectorRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournamentId: z.string().uuid().optional(),
        status: z.enum(["pending", "confirmed", "waitlist", "withdrawn", "checked_in"]).optional(),
        paid: z.enum(["paid", "unpaid", "refunded", "waived"]).optional(),
        search: z.string().max(80).optional(),
        page: z.number().int().min(0).max(200).default(0),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<DirectorRegistrationsPage> => {
    const { supabase, userId } = context;
    const pageSize = DIRECTOR_LIMITS.registrationsPage;

    const [owned, staff] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, entry_fee_cents")
        .eq("owner_id", userId)
        .limit(200),
      supabase
        .from("tournament_staff")
        .select("tournament_id")
        .eq("user_id", userId)
        .eq("role", "co_td"),
    ]);
    const coIds = (staff.data ?? []).map((s) => s.tournament_id);
    const coRows = coIds.length
      ? await supabase
          .from("tournaments")
          .select("id, name, entry_fee_cents")
          .in("id", coIds)
          .limit(200)
      : { data: [] as { id: string; name: string; entry_fee_cents: number }[] };

    const eventMap = new Map<string, { name: string; fee: number }>();
    for (const t of [...(owned.data ?? []), ...(coRows.data ?? [])]) {
      eventMap.set(t.id, { name: t.name, fee: t.entry_fee_cents ?? 0 });
    }
    let scopeIds = [...eventMap.keys()];
    if (data.tournamentId) scopeIds = scopeIds.filter((id) => id === data.tournamentId);
    if (scopeIds.length === 0) {
      return {
        rows: [],
        total: 0,
        page: data.page,
        pageSize,
        totals: { ...emptyCounts(), feesCollectedCents: 0, feesOutstandingCents: 0 },
      };
    }

    // Money/status totals are aggregated in the database so they stay exact at
    // any roster size instead of capping out on a client-side scan.
    const [divisions, totalsRes] = await Promise.all([
      supabase
        .from("tournament_divisions")
        .select("id, name, code, entry_fee_cents")
        .in("tournament_id", scopeIds),
      supabase.rpc("director_registration_totals", { _tournament_ids: scopeIds }),
    ]);

    const divMap = new Map((divisions.data ?? []).map((d) => [d.id, d]));
    const feeFor = (tournamentId: string, divisionId: string | null) =>
      (divisionId ? divMap.get(divisionId)?.entry_fee_cents : undefined) ??
      eventMap.get(tournamentId)?.fee ??
      0;

    const agg = Array.isArray(totalsRes.data) ? totalsRes.data[0] : totalsRes.data;
    const totals = {
      total: Number(agg?.total ?? 0),
      pending: Number(agg?.pending ?? 0),
      confirmed: Number(agg?.confirmed ?? 0),
      waitlist: Number(agg?.waitlist ?? 0),
      checkedIn: Number(agg?.checked_in ?? 0),
      withdrawn: Number(agg?.withdrawn ?? 0),
      paid: Number(agg?.paid ?? 0),
      unpaid: Number(agg?.unpaid ?? 0),
      feesCollectedCents: Number(agg?.fees_collected_cents ?? 0),
      feesOutstandingCents: Number(agg?.fees_outstanding_cents ?? 0),
    };

    // Player search resolves to ids first so the page query stays server-side.
    const q = data.search?.trim();
    let searchUserIds: string[] | null = null;
    if (q) {
      const like = `%${q.replace(/[%_,]/g, "")}%`;
      const { data: matches } = await supabase
        .from("profiles")
        .select("id")
        .or(`display_name.ilike.${like},username.ilike.${like},pdga_number.ilike.${like}`)
        .limit(DIRECTOR_LIMITS.registrationsSearchPlayers);
      searchUserIds = (matches ?? []).map((m) => m.id);
    }

    let pageQuery = supabase
      .from("tournament_registrations")
      .select(
        "id, tournament_id, user_id, division_id, status, payment_status, pdga_number, notes, created_at",
        {
          count: "exact",
        },
      )
      .in("tournament_id", scopeIds);
    if (data.status) pageQuery = pageQuery.eq("status", data.status);
    if (data.paid) pageQuery = pageQuery.eq("payment_status", data.paid);
    if (q) {
      const like = `%${q.replace(/[%_,]/g, "")}%`;
      const clauses = [`pdga_number.ilike.${like}`];
      if (searchUserIds && searchUserIds.length > 0)
        clauses.push(`user_id.in.(${searchUserIds.join(",")})`);
      pageQuery = pageQuery.or(clauses.join(","));
    }

    const start = data.page * pageSize;
    const { data: rows, count } = await pageQuery
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);

    const playerIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    const profiles = playerIds.length
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, pdga_number")
          .in("id", playerIds)
      : {
          data: [] as {
            id: string;
            username: string;
            display_name: string | null;
            avatar_url: string | null;
            pdga_number: string | null;
          }[],
        };
    const profMap = new Map((profiles.data ?? []).map((p) => [p.id, p]));

    const mapped: DirectorRegistrationRow[] = (rows ?? []).map((r) => {
      const p = profMap.get(r.user_id);
      const div = r.division_id ? divMap.get(r.division_id) : undefined;
      return {
        id: r.id,
        tournamentId: r.tournament_id,
        tournamentName: eventMap.get(r.tournament_id)?.name ?? "Event",
        userId: r.user_id,
        displayName: p?.display_name || p?.username || "Player",
        username: p?.username ?? null,
        avatarUrl: p?.avatar_url ?? null,
        pdgaNumber: r.pdga_number ?? p?.pdga_number ?? null,
        divisionId: r.division_id,
        divisionName: div ? div.code || div.name : null,
        status: r.status,
        paymentStatus: r.payment_status,
        entryFeeCents: feeFor(r.tournament_id, r.division_id),
        createdAt: r.created_at,
        notes: r.notes,
      };
    });

    return { rows: mapped, total: count ?? mapped.length, page: data.page, pageSize, totals };
  });

export const mutateRegistrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        registrationIds: z.array(z.string().uuid()).min(1).max(200),
        action: z.enum([
          "confirm",
          "waitlist",
          "check_in",
          "withdraw",
          "mark_paid",
          "mark_unpaid",
          "waive_fee",
          "move_division",
        ]),
        divisionId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    const { supabase, userId } = context;

    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("id, tournament_id, status, payment_status, division_id")
      .in("id", data.registrationIds);
    if (!regs || regs.length === 0) return { updated: 0 };

    const eventIds = [...new Set(regs.map((r) => r.tournament_id))];
    // Checked together so a bulk action across several events is one round trip
    // wide, not one per event in sequence.
    const checks = await Promise.all(
      eventIds.map(async (id) => {
        const { data: ok } = await supabase.rpc("is_event_director", {
          _tournament: id,
          _user: userId,
        });
        return [id, !!ok] as const;
      }),
    );
    const allowed = new Set(checks.filter(([, ok]) => ok).map(([id]) => id));
    const targets = regs.filter((r) => allowed.has(r.tournament_id));
    if (targets.length === 0)
      throw new Error("You can only manage registrations for events you direct.");

    if (data.action === "move_division") {
      if (!data.divisionId) throw new Error("Pick a division to move players into.");
      const { data: div } = await supabase
        .from("tournament_divisions")
        .select("id, tournament_id")
        .eq("id", data.divisionId)
        .maybeSingle();
      if (!div || !allowed.has(div.tournament_id))
        throw new Error("That division belongs to a different event.");
      if (targets.some((t) => t.tournament_id !== div.tournament_id)) {
        throw new Error("Select players from a single event before moving divisions.");
      }
    }

    const patch: {
      status?: "pending" | "confirmed" | "waitlist" | "withdrawn" | "checked_in";
      payment_status?: "paid" | "unpaid" | "refunded" | "waived";
      division_id?: string;
      checked_in_at?: string | null;
      checked_in_by?: string | null;
      check_in_method?: string | null;
    } = {};
    let field: "status" | "payment_status" | "division_id" = "status";
    switch (data.action) {
      case "confirm":
        patch["status"] = "confirmed";
        break;
      case "waitlist":
        patch["status"] = "waitlist";
        break;
      case "check_in":
        patch["status"] = "checked_in";
        // Keep the desk and the on-site scanner writing identical metadata.
        patch["checked_in_at"] = new Date().toISOString();
        patch["checked_in_by"] = context.userId;
        patch["check_in_method"] = "manual";
        break;
      case "withdraw":
        patch["status"] = "withdrawn";
        patch["checked_in_at"] = null;
        patch["checked_in_by"] = null;
        patch["check_in_method"] = null;
        break;
      case "mark_paid":
        patch["payment_status"] = "paid";
        field = "payment_status";
        break;
      case "mark_unpaid":
        patch["payment_status"] = "unpaid";
        field = "payment_status";
        break;
      case "waive_fee":
        patch["payment_status"] = "waived";
        field = "payment_status";
        break;
      case "move_division":
        patch["division_id"] = data.divisionId!;
        field = "division_id";
        break;
    }

    const ids = targets.map((t) => t.id);
    const { error } = await supabase.from("tournament_registrations").update(patch).in("id", ids);
    if (error) throw error;

    await supabase.from("registration_audit").insert(
      targets.map((t) => ({
        tournament_id: t.tournament_id,
        registration_id: t.id,
        actor_id: userId,
        action: data.action,
        from_value:
          field === "status"
            ? t.status
            : field === "payment_status"
              ? t.payment_status
              : t.division_id,
        to_value: Object.values(patch)[0] ?? null,
      })),
    );

    return { updated: ids.length };
  });

/* ------------------------------------------------------------------ */
/* Event kit — tee signs, caddy guide, player pack source data         */
/* ------------------------------------------------------------------ */
export const getEventKit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tournamentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EventKit> => {
    const { supabase, userId } = context;
    const { data: ok } = await supabase.rpc("is_event_director", {
      _tournament: data.tournamentId,
      _user: userId,
    });
    if (!ok) throw new Error("You can only build kits for events you direct.");
    return buildEventKit(supabase, data.tournamentId);
  });

/* ------------------------------------------------------------------ */
/* Hosted leagues desk                                                 */
/* ------------------------------------------------------------------ */
export type HostedLeagueRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  season: string | null;
  dayOfWeek: number | null;
  startDate: string | null;
  endDate: string | null;
  format: string;
  eventType: string;
  players: number;
  weeks: number;
};

/** Every league the signed-in organizer owns, with sign-up and week counts. */
export const getHostedLeagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HostedLeagueRow[]> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("leagues")
      .select(
        "id, name, slug, status, season, day_of_week, start_date, end_date, format, event_type",
      )
      .eq("owner_id", userId)
      .order("start_date", { ascending: false })
      .limit(DIRECTOR_LIMITS.hostedLeagues);
    if (error) throw error;
    const leagues = data ?? [];
    const ids = leagues.map((l) => l.id);
    const players = new Map<string, number>();
    const weeks = new Map<string, number>();
    if (ids.length) {
      const [regs, events] = await Promise.all([
        supabase.from("league_registrations").select("league_id").in("league_id", ids),
        supabase.from("league_events").select("league_id").in("league_id", ids),
      ]);
      for (const r of regs.data ?? []) players.set(r.league_id, (players.get(r.league_id) ?? 0) + 1);
      for (const e of events.data ?? []) weeks.set(e.league_id, (weeks.get(e.league_id) ?? 0) + 1);
    }
    return leagues.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      status: l.status,
      season: l.season,
      dayOfWeek: l.day_of_week,
      startDate: l.start_date,
      endDate: l.end_date,
      format: l.format,
      eventType: l.event_type,
      players: players.get(l.id) ?? 0,
      weeks: weeks.get(l.id) ?? 0,
    }));
  });

/* ------------------------------------------------------------------ */
/* Staff roster                                                        */
/* ------------------------------------------------------------------ */
export const getDirectorStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tournamentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DirectorStaffRow[]> => {
    const { supabase, userId } = context;
    const { data: ok } = await supabase.rpc("is_event_director", {
      _tournament: data.tournamentId,
      _user: userId,
    });
    if (!ok) throw new Error("You can only view the crew for events you direct.");
    const { data: rows } = await supabase
      .from("tournament_staff")
      .select("id, user_id, role, notes")
      .eq("tournament_id", data.tournamentId)
      .limit(DIRECTOR_LIMITS.staff);
    const ids = (rows ?? []).map((r) => r.user_id);
    const profiles = ids.length
      ? await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", ids)
      : {
          data: [] as {
            id: string;
            username: string;
            display_name: string | null;
            avatar_url: string | null;
          }[],
        };
    const map = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => {
      const p = map.get(r.user_id);
      return {
        id: r.id,
        userId: r.user_id,
        role: r.role,
        notes: r.notes,
        displayName: p?.display_name || p?.username || "Player",
        username: p?.username ?? null,
        avatarUrl: p?.avatar_url ?? null,
      };
    });
  });

export const mutateStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournamentId: z.string().uuid(),
        action: z.enum(["add", "remove", "set_role"]),
        userId: z.string().uuid().optional(),
        staffId: z.string().uuid().optional(),
        role: z.enum(["co_td", "scorekeeper", "volunteer", "spotter", "media"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: t } = await supabase
      .from("tournaments")
      .select("id, owner_id")
      .eq("id", data.tournamentId)
      .maybeSingle();
    if (!t || t.owner_id !== userId)
      throw new Error("Only the event owner can change the staff roster.");

    if (data.action === "add") {
      if (!data.userId) throw new Error("Pick a player to add.");
      const { error } = await supabase.from("tournament_staff").upsert(
        {
          tournament_id: data.tournamentId,
          user_id: data.userId,
          role: data.role ?? "volunteer",
          created_by: userId,
        },
        { onConflict: "tournament_id,user_id" },
      );
      if (error) throw error;
    } else if (data.action === "remove") {
      if (!data.staffId) throw new Error("Pick a staff member to remove.");
      const { error } = await supabase
        .from("tournament_staff")
        .delete()
        .eq("id", data.staffId)
        .eq("tournament_id", data.tournamentId);
      if (error) throw error;
    } else {
      if (!data.staffId || !data.role) throw new Error("Pick a staff member and a role.");
      const { error } = await supabase
        .from("tournament_staff")
        .update({ role: data.role })
        .eq("id", data.staffId)
        .eq("tournament_id", data.tournamentId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const searchDirectorPlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ q: z.string().min(2).max(60) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const term = data.q.replace(/[%,]/g, "").trim();
    const { data: rows } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      .limit(DIRECTOR_LIMITS.staffSearch);
    return (rows ?? []).map((p) => ({
      id: p.id,
      username: p.username,
      displayName: p.display_name || p.username,
      avatarUrl: p.avatar_url,
    }));
  });

/* ------------------------------------------------------------------ */
/* Checklist                                                           */
/* ------------------------------------------------------------------ */
export const getDirectorChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tournamentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<DirectorChecklistItem[]> => {
    const { supabase, userId } = context;
    const { data: ok } = await supabase.rpc("is_event_director", {
      _tournament: data.tournamentId,
      _user: userId,
    });
    if (!ok) throw new Error("You can only view checklists for events you direct.");
    const { data: rows } = await supabase
      .from("tournament_checklist_items")
      .select("id, label, phase, done, sort_order")
      .eq("tournament_id", data.tournamentId)
      .order("sort_order", { ascending: true })
      .limit(60);
    return (rows ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      phase: r.phase,
      done: r.done,
      sortOrder: r.sort_order,
    }));
  });

export const mutateChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        tournamentId: z.string().uuid(),
        action: z.enum(["add", "toggle", "remove", "seed_pdga_template"]),
        itemId: z.string().uuid().optional(),
        label: z.string().min(2).max(140).optional(),
        phase: z.string().max(40).optional(),
        done: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { data: ok } = await supabase.rpc("is_event_director", {
      _tournament: data.tournamentId,
      _user: userId,
    });
    if (!ok) throw new Error("You can only edit checklists for events you direct.");

    if (data.action === "add") {
      if (!data.label) throw new Error("Give the task a name.");
      const { error } = await supabase.from("tournament_checklist_items").insert({
        tournament_id: data.tournamentId,
        label: data.label,
        phase: data.phase ?? "prep",
        sort_order: Math.floor(Date.now() / 1000) % 100000,
      });
      if (error) throw error;
    } else if (data.action === "toggle") {
      if (!data.itemId) throw new Error("Pick a task.");
      const { error } = await supabase
        .from("tournament_checklist_items")
        .update({ done: data.done ?? true })
        .eq("id", data.itemId)
        .eq("tournament_id", data.tournamentId);
      if (error) throw error;
    } else if (data.action === "remove") {
      if (!data.itemId) throw new Error("Pick a task.");
      const { error } = await supabase
        .from("tournament_checklist_items")
        .delete()
        .eq("id", data.itemId)
        .eq("tournament_id", data.tournamentId);
      if (error) throw error;
    } else {
      const { pdgaChecklistTemplate } = await import("@/lib/director-kit");
      const { data: existing } = await supabase
        .from("tournament_checklist_items")
        .select("label")
        .eq("tournament_id", data.tournamentId);
      const have = new Set((existing ?? []).map((r) => r.label.toLowerCase()));
      const rows = pdgaChecklistTemplate()
        .filter((t) => !have.has(t.label.toLowerCase()))
        .map((t, i) => ({
          tournament_id: data.tournamentId,
          label: t.label,
          phase: t.phase,
          sort_order: i + 1,
        }));
      if (rows.length) {
        const { error } = await supabase.from("tournament_checklist_items").insert(rows);
        if (error) throw error;
      }
    }
    return { ok: true };
  });
