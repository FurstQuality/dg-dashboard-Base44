import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateRegistrationCheckIn,
  normalizePlayerCode,
  parseScanPayload,
  resolveCheckInWindow,
  type CheckInMethod,
} from "@/lib/checkin-rules";

/* ------------------------------------------------------------------ */
/* Shared shapes                                                       */
/* ------------------------------------------------------------------ */

export type CheckInTargetKind = "tournament" | "league_event";

export type PlayerPass = {
  playerCode: string;
  qrToken: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  pdgaNumber: string | null;
  events: PlayerPassEvent[];
};

export type PlayerPassEvent = {
  kind: CheckInTargetKind | "league";
  id: string;
  name: string;
  date: string;
  status: string;
  paymentStatus: string | null;
  divisionName: string | null;
  checkedInAt: string | null;
  checkInOpen: boolean;
  checkInNote: string | null;
  slug: string | null;
};

export type CheckInStation = {
  kind: CheckInTargetKind;
  id: string;
  /** League this night belongs to, so event pages can show only their own desk. */
  leagueId?: string | null;
  name: string;
  date: string;
  subtitle: string;
  checkInOpen: boolean;
  checkInNote: string | null;
};

export type CheckInBoardRow = {
  userId: string;
  registrationId: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  pdgaNumber: string | null;
  divisionName: string | null;
  status: string;
  paymentStatus: string | null;
  checkedInAt: string | null;
  checkInMethod: string | null;
};

export type CheckInBoard = {
  station: CheckInStation;
  rows: CheckInBoardRow[];
  totals: { expected: number; checkedIn: number; remaining: number; unpaid: number };
};

export type ScanResult = {
  outcome: "checked_in" | "already" | "blocked" | "not_registered";
  message: string;
  player: {
    userId: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
    pdgaNumber: string | null;
  } | null;
  row: CheckInBoardRow | null;
};

const targetSchema = z.object({
  kind: z.enum(["tournament", "league_event"]),
  id: z.string().uuid(),
});

type Target = z.infer<typeof targetSchema>;

type Client = { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

/* ------------------------------------------------------------------ */
/* Permission + station helpers                                        */
/* ------------------------------------------------------------------ */

async function loadTournamentStation(
  supabase: Client,
  id: string,
): Promise<{ station: CheckInStation; tournamentId: string }> {
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, slug, start_date, end_date, check_in_opens, location")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That event no longer exists.");
  const win = resolveCheckInWindow({
    checkInOpens: data.check_in_opens,
    startDate: data.start_date,
    endDate: data.end_date,
    now: new Date(),
  });
  return {
    tournamentId: data.id,
    station: {
      kind: "tournament",
      id: data.id,
      name: data.name,
      date: data.start_date,
      subtitle: data.location ?? "Tournament",
      checkInOpen: win.isOpen,
      checkInNote: win.reason,
    },
  };
}

async function loadLeagueEventStation(
  supabase: Client,
  id: string,
): Promise<{ station: CheckInStation; leagueId: string }> {
  const { data, error } = await supabase
    .from("league_events")
    .select("id, name, week_number, event_date, league_id, leagues(id, name, slug)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That league night no longer exists.");
  const win = resolveCheckInWindow({ startDate: data.event_date, now: new Date() });
  const leagueName = data.leagues?.name ?? "League";
  return {
    leagueId: data.league_id,
    station: {
      kind: "league_event",
      id: data.id,
      name: data.name ?? `Week ${data.week_number}`,
      date: data.event_date,
      subtitle: leagueName,
      checkInOpen: win.isOpen,
      checkInNote: win.reason,
    },
  };
}

/** Throws unless the caller directs (or staffs) the event behind the target. */
async function assertCanManageTarget(
  supabase: Client,
  userId: string,
  target: Target,
): Promise<CheckInStation> {
  // Check-in is the event.check_in job (owners, co-TDs and check-in staff hold it).
  if (target.kind === "tournament") {
    const { station } = await loadTournamentStation(supabase, target.id);
    const { data: ok } = await supabase.rpc("event_has_capability", {
      _kind: "tournament", _event: target.id, _user: userId, _cap: "event.check_in",
    });
    if (!ok) throw new Error("Only event staff with the check-in job can run check-in.");
    return station;
  }
  const { station, leagueId } = await loadLeagueEventStation(supabase, target.id);
  const { data: ok } = await supabase.rpc("event_has_capability", {
    _kind: "league", _event: leagueId, _user: userId, _cap: "event.check_in",
  });
  if (!ok) throw new Error("Only league staff with the check-in job can run check-in.");
  return station;
}

async function hydrateProfiles(supabase: Client, ids: string[]) {
  if (ids.length === 0) return new Map<string, any>();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, pdga_number")
    .in("id", ids);
  return new Map<string, any>((data ?? []).map((p: any) => [p.id, p]));
}

function profileRow(profile: any, userId: string) {
  return {
    displayName: profile?.display_name ?? profile?.username ?? "Player",
    username: profile?.username ?? userId.slice(0, 8),
    avatarUrl: profile?.avatar_url ?? null,
    pdgaNumber: profile?.pdga_number ? String(profile.pdga_number) : null,
  };
}

/* ------------------------------------------------------------------ */
/* Player pass                                                         */
/* ------------------------------------------------------------------ */

export const getMyPlayerPass = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlayerPass> => {
    const { supabase, userId } = context;
    // qr_token is a check-in secret: it is column-revoked from anon/authenticated
    // so no one can enumerate other players' passes. Read it through the service
    // role client, scoped to the signed-in user's own row only.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("player_code, qr_token, username, display_name, avatar_url, pdga_number")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new Error("We couldn't load your player pass. Try again in a moment.");

    const now = new Date();
    const horizon = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [tourns, leagues] = await Promise.all([
      supabase
        .from("tournament_registrations")
        .select(
          "id, status, payment_status, checked_in_at, tournament_id, tournament_divisions(name), tournaments(id, name, slug, start_date, end_date, check_in_opens)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("league_registrations")
        .select(
          "id, status, payment_status, league_id, league_divisions(name), leagues(id, name, slug, start_date, end_date)",
        )
        .eq("user_id", userId)
        .limit(40),
    ]);

    const events: PlayerPassEvent[] = [];

    for (const r of (tourns.data ?? []) as any[]) {
      const t = r.tournaments;
      if (!t || t.end_date < horizon) continue;
      const win = resolveCheckInWindow({
        checkInOpens: t.check_in_opens,
        startDate: t.start_date,
        endDate: t.end_date,
        now,
      });
      events.push({
        kind: "tournament",
        id: t.id,
        name: t.name,
        date: t.start_date,
        status: r.status,
        paymentStatus: r.payment_status,
        divisionName: r.tournament_divisions?.name ?? null,
        checkedInAt: r.checked_in_at ?? null,
        checkInOpen: win.isOpen,
        checkInNote: win.reason,
        slug: t.slug ?? null,
      });
    }

    for (const r of (leagues.data ?? []) as any[]) {
      const l = r.leagues;
      if (!l) continue;
      events.push({
        kind: "league",
        id: l.id,
        name: l.name,
        date: l.start_date ?? new Date().toISOString().slice(0, 10),
        status: r.status ?? "confirmed",
        paymentStatus: r.payment_status ?? null,
        divisionName: r.league_divisions?.name ?? null,
        checkedInAt: null,
        checkInOpen: true,
        checkInNote: null,
        slug: l.slug ?? null,
      });
    }

    events.sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      playerCode: profile.player_code,
      qrToken: profile.qr_token,
      ...profileRow(profile, userId),
      events,
    };
  });

export const rotateMyQrToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ qrToken: string }> => {
    const { userId } = context;
    // Rotating the pass writes and reads the qr_token secret, which is revoked
    // from anon/authenticated — go through the service role client, restricted
    // to the caller's own row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ qr_token: null as unknown as string })
      .eq("id", userId)
      .select("qr_token")
      .maybeSingle();
    if (error) throw error;
    if (!data?.qr_token) throw new Error("We couldn't refresh your code. Try again.");
    return { qrToken: data.qr_token };
  });

/* ------------------------------------------------------------------ */
/* Director stations + board                                           */
/* ------------------------------------------------------------------ */

export const getCheckInStations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CheckInStation[]> => {
    const { supabase, userId } = context;
    const today = new Date();
    const from = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [owned, staffed, leagues] = await Promise.all([
      supabase
        .from("tournaments")
        .select("id, name, slug, start_date, end_date, check_in_opens, location")
        .eq("owner_id", userId)
        .gte("end_date", from)
        .order("start_date")
        .limit(40),
      supabase.from("tournament_staff").select("tournament_id").eq("user_id", userId).limit(60),
      supabase
        .from("leagues")
        .select("id, name, league_events(id, name, week_number, event_date)")
        .eq("owner_id", userId)
        .limit(30),
    ]);

    const seen = new Set<string>();
    const stations: CheckInStation[] = [];
    const now = new Date();

    const pushTournament = (t: any) => {
      if (seen.has(t.id)) return;
      seen.add(t.id);
      const win = resolveCheckInWindow({
        checkInOpens: t.check_in_opens,
        startDate: t.start_date,
        endDate: t.end_date,
        now,
      });
      stations.push({
        kind: "tournament",
        id: t.id,
        name: t.name,
        date: t.start_date,
        subtitle: t.location ?? "Tournament",
        checkInOpen: win.isOpen,
        checkInNote: win.reason,
      });
    };

    for (const t of (owned.data ?? []) as any[]) pushTournament(t);

    const staffIds = ((staffed.data ?? []) as any[])
      .map((s) => s.tournament_id)
      .filter((id: string) => !seen.has(id));
    if (staffIds.length) {
      const { data } = await supabase
        .from("tournaments")
        .select("id, name, slug, start_date, end_date, check_in_opens, location")
        .in("id", staffIds)
        .gte("end_date", from)
        .order("start_date");
      for (const t of (data ?? []) as any[]) pushTournament(t);
    }

    for (const l of (leagues.data ?? []) as any[]) {
      for (const e of (l.league_events ?? []) as any[]) {
        if (e.event_date < from) continue;
        const win = resolveCheckInWindow({ startDate: e.event_date, now });
        stations.push({
          kind: "league_event",
          id: e.id,
          leagueId: l.id,
          name: e.name ?? `Week ${e.week_number}`,
          date: e.event_date,
          subtitle: l.name,
          checkInOpen: win.isOpen,
          checkInNote: win.reason,
        });
      }
    }

    return stations.sort((a, b) => (a.date < b.date ? -1 : 1));
  });

export const getCheckInBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckInBoard> => {
    const { supabase, userId } = context;
    const station = await assertCanManageTarget(supabase as Client, userId, data);

    if (data.kind === "tournament") {
      const { data: regs, error } = await supabase
        .from("tournament_registrations")
        .select(
          "id, user_id, status, payment_status, checked_in_at, check_in_method, tournament_divisions(name)",
        )
        .eq("tournament_id", data.id)
        .order("created_at");
      if (error) throw error;
      const list = (regs ?? []) as any[];
      const profiles = await hydrateProfiles(
        supabase as Client,
        list.map((r) => r.user_id),
      );
      const rows: CheckInBoardRow[] = list.map((r) => ({
        userId: r.user_id,
        registrationId: r.id,
        ...profileRow(profiles.get(r.user_id), r.user_id),
        divisionName: r.tournament_divisions?.name ?? null,
        status: r.status,
        paymentStatus: r.payment_status,
        checkedInAt: r.checked_in_at ?? null,
        checkInMethod: r.check_in_method ?? null,
      }));
      const expected = rows.filter((r) => r.status !== "withdrawn").length;
      const checkedIn = rows.filter((r) => r.status === "checked_in").length;
      return {
        station,
        rows,
        totals: {
          expected,
          checkedIn,
          remaining: Math.max(0, expected - checkedIn),
          unpaid: rows.filter((r) => r.paymentStatus === "unpaid" && r.status !== "withdrawn")
            .length,
        },
      };
    }

    const { leagueId } = await loadLeagueEventStation(supabase as Client, data.id);
    const [regs, checkins] = await Promise.all([
      supabase
        .from("league_registrations")
        .select("id, user_id, status, payment_status, league_divisions(name)")
        .eq("league_id", leagueId),
      supabase
        .from("league_event_checkins")
        .select("user_id, checked_in_at, check_in_method, paid")
        .eq("league_event_id", data.id),
    ]);
    const list = (regs.data ?? []) as any[];
    const checkinMap = new Map<string, any>(
      ((checkins.data ?? []) as any[]).map((c) => [c.user_id, c]),
    );
    // Someone may be checked in without a season registration (walk-up).
    const extraIds = [...checkinMap.keys()].filter((id) => !list.some((r) => r.user_id === id));
    const profiles = await hydrateProfiles(supabase as Client, [
      ...list.map((r) => r.user_id),
      ...extraIds,
    ]);

    const rows: CheckInBoardRow[] = [
      ...list.map((r) => {
        const c = checkinMap.get(r.user_id);
        return {
          userId: r.user_id,
          registrationId: r.id,
          ...profileRow(profiles.get(r.user_id), r.user_id),
          divisionName: r.league_divisions?.name ?? null,
          status: c ? "checked_in" : (r.status ?? "confirmed"),
          paymentStatus: c?.paid ? "paid" : (r.payment_status ?? null),
          checkedInAt: c?.checked_in_at ?? null,
          checkInMethod: c?.check_in_method ?? null,
        };
      }),
      ...extraIds.map((id) => {
        const c = checkinMap.get(id);
        return {
          userId: id,
          registrationId: null,
          ...profileRow(profiles.get(id), id),
          divisionName: null,
          status: "checked_in",
          paymentStatus: c?.paid ? "paid" : null,
          checkedInAt: c?.checked_in_at ?? null,
          checkInMethod: c?.check_in_method ?? null,
        };
      }),
    ];

    const expected = rows.filter((r) => r.status !== "withdrawn").length;
    const checkedIn = rows.filter((r) => r.checkedInAt).length;
    return {
      station,
      rows,
      totals: {
        expected,
        checkedIn,
        remaining: Math.max(0, expected - checkedIn),
        unpaid: rows.filter((r) => r.paymentStatus === "unpaid").length,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Check-in actions                                                    */
/* ------------------------------------------------------------------ */

async function writeTournamentCheckIn(
  supabase: Client,
  opts: {
    tournamentId: string;
    registrationId: string;
    actorId: string;
    method: CheckInMethod;
    fromStatus: string;
  },
) {
  const { error } = await supabase
    .from("tournament_registrations")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      checked_in_by: opts.actorId,
      check_in_method: opts.method,
    })
    .eq("id", opts.registrationId);
  if (error) throw error;
  await supabase.from("registration_audit").insert({
    tournament_id: opts.tournamentId,
    registration_id: opts.registrationId,
    actor_id: opts.actorId,
    action: `check_in_${opts.method}`,
    from_value: opts.fromStatus,
    to_value: "checked_in",
  });
}

async function checkInOnTarget(
  supabase: Client,
  actorId: string,
  target: Target,
  station: CheckInStation,
  playerId: string,
  method: CheckInMethod,
  override: boolean,
): Promise<ScanResult> {
  const profiles = await hydrateProfiles(supabase, [playerId]);
  const player = { userId: playerId, ...profileRow(profiles.get(playerId), playerId) };

  if (target.kind === "tournament") {
    const { data: reg } = await supabase
      .from("tournament_registrations")
      .select("id, status, payment_status, checked_in_at, check_in_method, tournament_divisions(name)")
      .eq("tournament_id", target.id)
      .eq("user_id", playerId)
      .maybeSingle();

    if (!reg) {
      return {
        outcome: "not_registered",
        message: "This player isn't registered for this event yet.",
        player,
        row: null,
      };
    }

    const verdict = evaluateRegistrationCheckIn(
      { status: reg.status, checkedInAt: reg.checked_in_at },
      { windowOpen: station.checkInOpen, override },
    );

    if (verdict.outcome === "checked_in") {
      await writeTournamentCheckIn(supabase, {
        tournamentId: target.id,
        registrationId: reg.id,
        actorId,
        method,
        fromStatus: reg.status,
      });
    }

    const row: CheckInBoardRow = {
      ...player,
      registrationId: reg.id,
      divisionName: (reg as any).tournament_divisions?.name ?? null,
      status: verdict.outcome === "blocked" ? reg.status : "checked_in",
      paymentStatus: reg.payment_status,
      checkedInAt:
        verdict.outcome === "blocked" ? reg.checked_in_at : (reg.checked_in_at ?? new Date().toISOString()),
      checkInMethod: verdict.outcome === "blocked" ? reg.check_in_method : method,
    };

    return {
      outcome: verdict.outcome,
      message: verdict.outcome === "checked_in" ? "Checked in." : verdict.message,
      player,
      row,
    };
  }

  const { leagueId } = await loadLeagueEventStation(supabase, target.id);
  const [{ data: existing }, { data: reg }] = await Promise.all([
    supabase
      .from("league_event_checkins")
      .select("id, checked_in_at, check_in_method, paid")
      .eq("league_event_id", target.id)
      .eq("user_id", playerId)
      .maybeSingle(),
    supabase
      .from("league_registrations")
      .select("id, status, payment_status, league_divisions(name)")
      .eq("league_id", leagueId)
      .eq("user_id", playerId)
      .maybeSingle(),
  ]);

  if (reg?.status === "withdrawn") {
    return {
      outcome: "blocked",
      message: "This player withdrew from the league.",
      player,
      row: null,
    };
  }

  if (existing) {
    return {
      outcome: "already",
      message: "Already checked in tonight.",
      player,
      row: {
        ...player,
        registrationId: reg?.id ?? null,
        divisionName: (reg as any)?.league_divisions?.name ?? null,
        status: "checked_in",
        paymentStatus: existing.paid ? "paid" : (reg?.payment_status ?? null),
        checkedInAt: existing.checked_in_at,
        checkInMethod: existing.check_in_method,
      },
    };
  }

  if (!station.checkInOpen && !override) {
    return { outcome: "blocked", message: "Check-in isn't open for this league night.", player, row: null };
  }

  const { error } = await supabase.from("league_event_checkins").insert({
    league_event_id: target.id,
    league_id: leagueId,
    user_id: playerId,
    checked_in_by: actorId,
    check_in_method: method,
    paid: reg?.payment_status === "paid" || reg?.payment_status === "waived",
  });
  if (error) throw error;

  return {
    outcome: "checked_in",
    message: reg ? "Checked in." : "Checked in as a walk-up.",
    player,
    row: {
      ...player,
      registrationId: reg?.id ?? null,
      divisionName: (reg as any)?.league_divisions?.name ?? null,
      status: "checked_in",
      paymentStatus: reg?.payment_status ?? null,
      checkedInAt: new Date().toISOString(),
      checkInMethod: method,
    },
  };
}

export const scanCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target: targetSchema,
        identifier: z.string().min(3).max(200),
        method: z.enum(["scan", "manual"]).default("scan"),
        override: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const { supabase, userId } = context;
    const station = await assertCanManageTarget(supabase as Client, userId, data.target);

    const raw = parseScanPayload(data.identifier);
    const { data: playerId } = await supabase.rpc("resolve_player_identifier", {
      _identifier: raw,
    });
    const resolved =
      playerId ??
      (
        await supabase.rpc("resolve_player_identifier", {
          _identifier: normalizePlayerCode(raw),
        })
      ).data;

    if (!resolved) {
      return {
        outcome: "blocked",
        message: "We couldn't match that code to a player. Try their player code instead.",
        player: null,
        row: null,
      };
    }

    return checkInOnTarget(
      supabase as Client,
      userId,
      data.target,
      station,
      resolved as string,
      data.method,
      data.override,
    );
  });

export const checkInPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target: targetSchema,
        playerId: z.string().uuid(),
        override: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const { supabase, userId } = context;
    const station = await assertCanManageTarget(supabase as Client, userId, data.target);
    return checkInOnTarget(
      supabase as Client,
      userId,
      data.target,
      station,
      data.playerId,
      "manual",
      data.override,
    );
  });

export const selfCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<ScanResult> => {
    const { supabase, userId } = context;
    const station =
      data.kind === "tournament"
        ? (await loadTournamentStation(supabase as Client, data.id)).station
        : (await loadLeagueEventStation(supabase as Client, data.id)).station;
    return checkInOnTarget(supabase as Client, userId, data, station, userId, "self", false);
  });

export const undoCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ target: targetSchema, playerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await assertCanManageTarget(supabase as Client, userId, data.target);

    if (data.target.kind === "tournament") {
      const { data: reg } = await supabase
        .from("tournament_registrations")
        .select("id, status")
        .eq("tournament_id", data.target.id)
        .eq("user_id", data.playerId)
        .maybeSingle();
      if (!reg) throw new Error("That player isn't on this roster.");
      const { error } = await supabase
        .from("tournament_registrations")
        .update({
          status: "confirmed",
          checked_in_at: null,
          checked_in_by: null,
          check_in_method: null,
        })
        .eq("id", reg.id);
      if (error) throw error;
      await supabase.from("registration_audit").insert({
        tournament_id: data.target.id,
        registration_id: reg.id,
        actor_id: userId,
        action: "undo_check_in",
        from_value: reg.status,
        to_value: "confirmed",
      });
      return { ok: true };
    }

    const { error } = await supabase
      .from("league_event_checkins")
      .delete()
      .eq("league_event_id", data.target.id)
      .eq("user_id", data.playerId);
    if (error) throw error;
    return { ok: true };
  });

export const markCheckInPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target: targetSchema,
        playerId: z.string().uuid(),
        paid: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    await assertCanManageTarget(supabase as Client, userId, data.target);

    if (data.target.kind === "tournament") {
      const { data: reg } = await supabase
        .from("tournament_registrations")
        .select("id, payment_status")
        .eq("tournament_id", data.target.id)
        .eq("user_id", data.playerId)
        .maybeSingle();
      if (!reg) throw new Error("That player isn't on this roster.");
      const next = data.paid ? "paid" : "unpaid";
      const { error } = await supabase
        .from("tournament_registrations")
        .update({ payment_status: next })
        .eq("id", reg.id);
      if (error) throw error;
      await supabase.from("registration_audit").insert({
        tournament_id: data.target.id,
        registration_id: reg.id,
        actor_id: userId,
        action: data.paid ? "mark_paid" : "mark_unpaid",
        from_value: reg.payment_status,
        to_value: next,
      });
      return { ok: true };
    }

    const { error } = await supabase
      .from("league_event_checkins")
      .update({ paid: data.paid })
      .eq("league_event_id", data.target.id)
      .eq("user_id", data.playerId);
    if (error) throw error;
    await supabase
      .from("league_registrations")
      .update({ payment_status: data.paid ? "paid" : "unpaid" })
      .eq("user_id", data.playerId)
      .eq("league_id", (await loadLeagueEventStation(supabase as Client, data.target.id)).leagueId);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* League registration                                                 */
/* ------------------------------------------------------------------ */

export type LeagueSignup = {
  leagueId: string;
  entryFeeCents: number;
  divisions: { id: string; name: string }[];
  registration: {
    id: string;
    status: string;
    paymentStatus: string;
    divisionId: string | null;
    divisionName: string | null;
  } | null;
  nights: {
    id: string;
    name: string;
    date: string;
    checkedInAt: string | null;
    checkInOpen: boolean;
    checkInNote: string | null;
  }[];
};

export const getLeagueSignup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<LeagueSignup> => {
    const { supabase, userId } = context;
    const now = new Date();
    const [league, divisions, reg, nights, checkins] = await Promise.all([
      supabase
        .from("leagues")
        .select("id, entry_fee_cents")
        .eq("id", data.leagueId)
        .maybeSingle(),
      supabase.from("league_divisions").select("id, name").eq("league_id", data.leagueId),
      supabase
        .from("league_registrations")
        .select("id, status, payment_status, division_id, league_divisions(name)")
        .eq("league_id", data.leagueId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("league_events")
        .select("id, name, week_number, event_date")
        .eq("league_id", data.leagueId)
        .order("week_number"),
      supabase
        .from("league_event_checkins")
        .select("league_event_id, checked_in_at")
        .eq("league_id", data.leagueId)
        .eq("user_id", userId),
    ]);

    const checkinMap = new Map<string, string>(
      ((checkins.data ?? []) as any[]).map((c) => [c.league_event_id, c.checked_in_at]),
    );

    return {
      leagueId: data.leagueId,
      entryFeeCents: league.data?.entry_fee_cents ?? 0,
      divisions: ((divisions.data ?? []) as any[]).map((d) => ({ id: d.id, name: d.name })),
      registration: reg.data
        ? {
            id: reg.data.id,
            status: reg.data.status ?? "confirmed",
            paymentStatus: reg.data.payment_status ?? "unpaid",
            divisionId: reg.data.division_id ?? null,
            divisionName: (reg.data as any).league_divisions?.name ?? null,
          }
        : null,
      nights: ((nights.data ?? []) as any[]).map((e) => {
        const win = resolveCheckInWindow({ startDate: e.event_date, now });
        return {
          id: e.id,
          name: e.name ?? `Week ${e.week_number}`,
          date: e.event_date,
          checkedInAt: checkinMap.get(e.id) ?? null,
          checkInOpen: win.isOpen,
          checkInNote: win.reason,
        };
      }),
    };
  });

export const registerForLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        leagueId: z.string().uuid(),
        divisionId: z.string().uuid().optional(),
        pdgaNumber: z.string().max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ status: string }> => {
    const { supabase, userId } = context;
    const { data: league } = await supabase
      .from("leagues")
      .select("id, status")
      .eq("id", data.leagueId)
      .maybeSingle();
    if (!league) throw new Error("That league no longer exists.");
    if (league.status === "cancelled") throw new Error("This league was cancelled.");

    const { data: existing } = await supabase
      .from("league_registrations")
      .select("id")
      .eq("league_id", data.leagueId)
      .eq("user_id", userId)
      .maybeSingle();

    const patch = {
      league_id: data.leagueId,
      user_id: userId,
      status: "confirmed" as const,
      division_id: data.divisionId ?? null,
      ...(data.pdgaNumber ? { pdga_number: data.pdgaNumber } : {}),
    };

    if (existing) {
      const { error } = await supabase
        .from("league_registrations")
        .update(patch)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("league_registrations").insert(patch);
      if (error) throw error;
    }
    return { status: "confirmed" };
  });

export const withdrawFromLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ leagueId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("league_registrations")
      .update({ status: "withdrawn" })
      .eq("league_id", data.leagueId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
