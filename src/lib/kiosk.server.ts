/**
 * Server-only kiosk logic: station loading, player lookup, and the check-in
 * writes the tablet performs on behalf of the signed-in director.
 */

import { resolveCheckInWindow, normalizePlayerCode, parseScanPayload } from "@/lib/checkin-rules";
import type { KioskPaymentMethod } from "@/lib/kiosk";
import { isPaidMethod } from "@/lib/kiosk";
import { allowsWalkUps, normalizeSignupType, type SignupType } from "@/lib/event-setup";

type Client = { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

export type KioskTarget = { kind: "tournament" | "league_event"; id: string };

export type KioskDivision = {
  id: string;
  name: string;
  code: string;
  entryFeeCents: number;
};

export type KioskStation = {
  kind: "tournament" | "league_event";
  id: string;
  name: string;
  subtitle: string;
  date: string;
  checkInOpen: boolean;
  checkInNote: string | null;
  divisions: KioskDivision[];
  leagueId: string | null;
  /** Stored sign-up mode, normalized. Pre-registration-only events take no walk-ups. */
  signupType: SignupType;
  /** False when the event is pre-registration only. */
  walkUpsAllowed: boolean;
};

export type KioskMatch = {
  found: boolean;
  userId: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  pdgaNumber: string | null;
  registered: boolean;
  divisionId: string | null;
  divisionName: string | null;
  paymentStatus: string | null;
  entryFeeCents: number | null;
  alreadyCheckedIn: boolean;
  message: string;
};

export type KioskCheckInResult = {
  outcome: "checked_in" | "already" | "blocked";
  message: string;
  displayName: string;
  divisionName: string | null;
  paid: boolean;
  amountDueCents: number;
};

/* ------------------------------------------------------------------ */
/* Station                                                             */
/* ------------------------------------------------------------------ */

async function divisionsForTournament(supabase: Client, tournamentId: string) {
  const { data } = await supabase
    .from("tournament_divisions")
    .select("id, name, code, entry_fee_cents, sort_order")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    entryFeeCents: d.entry_fee_cents ?? 0,
  }));
}

async function divisionsForLeague(supabase: Client, leagueId: string) {
  const { data } = await supabase
    .from("league_divisions")
    .select("id, name, code, entry_fee_cents, sort_order")
    .eq("league_id", leagueId)
    .order("sort_order");
  return ((data ?? []) as any[]).map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    entryFeeCents: d.entry_fee_cents ?? 0,
  }));
}

/** Loads the kiosk station, throwing unless the caller runs the event. */
export async function loadKioskStation(
  supabase: Client,
  userId: string,
  target: KioskTarget,
): Promise<KioskStation> {
  if (target.kind === "tournament") {
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id, name, start_date, end_date, check_in_opens, location, signup_type, registration_closes",
      )
      .eq("id", target.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("That event no longer exists.");

    const [director, staff] = await Promise.all([
      supabase.rpc("is_event_director", { _tournament: target.id, _user: userId }),
      supabase.rpc("is_tournament_staff", { _tournament: target.id, _user: userId }),
    ]);
    if (!director.data && !staff.data) {
      throw new Error("Only this event's director or staff can run a kiosk.");
    }

    const win = resolveCheckInWindow({
      checkInOpens: data.check_in_opens,
      startDate: data.start_date,
      endDate: data.end_date,
      now: new Date(),
    });
    return {
      kind: "tournament",
      id: data.id,
      name: data.name,
      subtitle: data.location ?? "Tournament",
      date: data.start_date,
      checkInOpen: win.isOpen,
      checkInNote: win.reason,
      divisions: await divisionsForTournament(supabase, data.id),
      leagueId: null,
      signupType: normalizeSignupType(data.signup_type, {
        registrationCloses: data.registration_closes,
      }),
      walkUpsAllowed: allowsWalkUps(data.signup_type, {
        registrationCloses: data.registration_closes,
      }),
    };
  }

  const { data, error } = await supabase
    .from("league_events")
    .select(
      "id, name, week_number, event_date, league_id, leagues(id, name, signup_type, registration_closes)",
    )
    .eq("id", target.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That league night no longer exists.");

  const { data: canManage } = await supabase.rpc("can_manage_league", {
    _league_id: data.league_id,
    _user: userId,
  });
  if (!canManage) throw new Error("Only this league's organizer can run a kiosk.");

  const win = resolveCheckInWindow({ startDate: data.event_date, now: new Date() });
  return {
    kind: "league_event",
    id: data.id,
    name: data.name ?? `Week ${data.week_number}`,
    subtitle: data.leagues?.name ?? "League night",
    date: data.event_date,
    checkInOpen: win.isOpen,
    checkInNote: win.reason,
    divisions: await divisionsForLeague(supabase, data.league_id),
    leagueId: data.league_id,
    signupType: normalizeSignupType(data.leagues?.signup_type, {
      registrationCloses: data.leagues?.registration_closes,
    }),
    walkUpsAllowed: allowsWalkUps(data.leagues?.signup_type, {
      registrationCloses: data.leagues?.registration_closes,
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

const NO_MATCH: KioskMatch = {
  found: false,
  userId: null,
  displayName: "",
  username: null,
  avatarUrl: null,
  pdgaNumber: null,
  registered: false,
  divisionId: null,
  divisionName: null,
  paymentStatus: null,
  entryFeeCents: null,
  alreadyCheckedIn: false,
  message: "We couldn't find an account with that. You can still check in with the form below.",
};

async function findProfile(supabase: Client, term: string) {
  const raw = parseScanPayload(term);
  const code = normalizePlayerCode(raw);

  // Player code / QR token first — the fast path at the table.
  const { data: byCode } = await supabase.rpc("resolve_player_identifier", { _identifier: raw });
  const resolved =
    byCode ?? (await supabase.rpc("resolve_player_identifier", { _identifier: code })).data;
  if (resolved) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, pdga_number")
      .eq("id", resolved as string)
      .maybeSingle();
    if (data) return data;
  }

  if (/^\d{3,8}$/.test(code)) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, pdga_number")
      .eq("pdga_number", Number(code))
      .limit(1);
    if ((data ?? []).length === 1) return (data as any[])[0];
  }

  const like = `%${raw.replace(/[%_]/g, "")}%`;
  const { data: byName } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, pdga_number")
    .or(`display_name.ilike.${like},username.ilike.${like}`)
    .limit(2);
  const list = (byName ?? []) as any[];
  return list.length === 1 ? list[0] : null;
}

/** Looks a player up and reports their standing at this event. */
export async function lookupKioskPlayer(
  supabase: Client,
  station: KioskStation,
  term: string,
): Promise<KioskMatch> {
  const profile = await findProfile(supabase, term);
  if (!profile) return NO_MATCH;

  const base = {
    found: true,
    userId: profile.id as string,
    displayName: (profile.display_name || profile.username || "Player") as string,
    username: (profile.username ?? null) as string | null,
    avatarUrl: (profile.avatar_url ?? null) as string | null,
    pdgaNumber: profile.pdga_number ? String(profile.pdga_number) : null,
  };

  if (station.kind === "tournament") {
    const { data: reg } = await supabase
      .from("tournament_registrations")
      .select("id, status, payment_status, division_id, checked_in_at, tournament_divisions(name)")
      .eq("tournament_id", station.id)
      .eq("user_id", profile.id)
      .maybeSingle();
    const division = station.divisions.find((d) => d.id === reg?.division_id) ?? null;
    return {
      ...base,
      registered: !!reg,
      divisionId: reg?.division_id ?? null,
      divisionName: reg?.tournament_divisions?.name ?? division?.name ?? null,
      paymentStatus: reg?.payment_status ?? null,
      entryFeeCents: division?.entryFeeCents ?? null,
      alreadyCheckedIn: reg?.status === "checked_in",
      message: reg ? "Confirm your division to finish check-in." : "You're not on the roster yet — pick a division to join as a walk-up.",
    };
  }

  const [{ data: reg }, { data: existing }] = await Promise.all([
    supabase
      .from("league_registrations")
      .select("id, status, payment_status, division_id, league_divisions(name)")
      .eq("league_id", station.leagueId)
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase
      .from("league_event_checkins")
      .select("id")
      .eq("league_event_id", station.id)
      .eq("user_id", profile.id)
      .maybeSingle(),
  ]);
  const division = station.divisions.find((d) => d.id === reg?.division_id) ?? null;
  return {
    ...base,
    registered: !!reg,
    divisionId: reg?.division_id ?? null,
    divisionName: reg?.league_divisions?.name ?? division?.name ?? null,
    paymentStatus: reg?.payment_status ?? null,
    entryFeeCents: division?.entryFeeCents ?? null,
    alreadyCheckedIn: !!existing,
    message: reg
      ? "Confirm your division to finish check-in."
      : "You're new to this league — pick a division to sign up tonight.",
  };
}

/* ------------------------------------------------------------------ */
/* Check-in                                                            */
/* ------------------------------------------------------------------ */

export type KioskCheckInArgs = {
  playerId: string;
  divisionId: string | null;
  paymentMethod: KioskPaymentMethod;
  saveDefaultDivision: boolean;
  allowWalkUps: boolean;
  allowPaymentCapture: boolean;
  override: boolean;
};

export async function kioskCheckIn(
  supabase: Client,
  actorId: string,
  station: KioskStation,
  args: KioskCheckInArgs,
): Promise<KioskCheckInResult> {
  // The event's sign-up mode wins over whatever the kiosk client sent.
  const walkUpsAllowed = args.allowWalkUps && station.walkUpsAllowed;
  const division = station.divisions.find((d) => d.id === args.divisionId) ?? null;
  const paid = args.allowPaymentCapture && isPaidMethod(args.paymentMethod);
  const fee = division?.entryFeeCents ?? 0;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", args.playerId)
    .maybeSingle();
  const displayName = profile?.display_name || profile?.username || "Player";

  if (!station.checkInOpen && !args.override) {
    return {
      outcome: "blocked",
      message: station.checkInNote ?? "Check-in isn't open for this event.",
      displayName,
      divisionName: division?.name ?? null,
      paid: false,
      amountDueCents: fee,
    };
  }

  if (args.saveDefaultDivision && division) {
    await supabase
      .from("profiles")
      .update({ preferred_division: division.code })
      .eq("id", args.playerId);
  }

  const now = new Date().toISOString();

  if (station.kind === "tournament") {
    const { data: reg } = await supabase
      .from("tournament_registrations")
      .select("id, status, payment_status")
      .eq("tournament_id", station.id)
      .eq("user_id", args.playerId)
      .maybeSingle();

    if (!reg) {
      if (!walkUpsAllowed) {
        return {
          outcome: "blocked",
          message: station.walkUpsAllowed
            ? "You're not on the roster — see the director to get added."
            : "This event is pre-registration only, so the field is closed. See the director.",
          displayName,
          divisionName: division?.name ?? null,
          paid: false,
          amountDueCents: fee,
        };
      }
      if (!division) throw new Error("Pick a division to check in as a walk-up.");
      const { data: created, error } = await supabase
        .from("tournament_registrations")
        .insert({
          tournament_id: station.id,
          user_id: args.playerId,
          division_id: division.id,
          status: "checked_in",
          payment_status: paid ? "paid" : "unpaid",
          checked_in_at: now,
          checked_in_by: actorId,
          check_in_method: "self",
          notes: `Kiosk walk-up (${args.paymentMethod})`,
        })
        .select("id")
        .maybeSingle();
      if (error) throw error;
      await supabase.from("registration_audit").insert({
        tournament_id: station.id,
        registration_id: created?.id ?? null,
        actor_id: actorId,
        action: "kiosk_walkup_check_in",
        from_value: null,
        to_value: "checked_in",
      });
      return {
        outcome: "checked_in",
        message: "You're in — good luck out there.",
        displayName,
        divisionName: division.name,
        paid,
        amountDueCents: paid ? 0 : fee,
      };
    }

    if (reg.status === "withdrawn") {
      return {
        outcome: "blocked",
        message: "This registration was withdrawn. See the director.",
        displayName,
        divisionName: division?.name ?? null,
        paid: false,
        amountDueCents: fee,
      };
    }

    const patch: Record<string, unknown> = {};
    if (division) patch.division_id = division.id;
    if (paid && reg.payment_status === "unpaid") patch.payment_status = "paid";

    if (reg.status === "checked_in") {
      if (Object.keys(patch).length) {
        await supabase.from("tournament_registrations").update(patch).eq("id", reg.id);
      }
      return {
        outcome: "already",
        message: "You're already checked in — you're all set.",
        displayName,
        divisionName: division?.name ?? null,
        paid: paid || reg.payment_status !== "unpaid",
        amountDueCents: paid || reg.payment_status !== "unpaid" ? 0 : fee,
      };
    }

    const { error } = await supabase
      .from("tournament_registrations")
      .update({
        ...patch,
        status: "checked_in",
        checked_in_at: now,
        checked_in_by: actorId,
        check_in_method: "self",
      })
      .eq("id", reg.id);
    if (error) throw error;
    await supabase.from("registration_audit").insert({
      tournament_id: station.id,
      registration_id: reg.id,
      actor_id: actorId,
      action: "kiosk_check_in",
      from_value: reg.status,
      to_value: "checked_in",
    });

    const settled = paid || reg.payment_status !== "unpaid";
    return {
      outcome: "checked_in",
      message: settled ? "You're in — good luck out there." : "You're in. Settle up with the director when you can.",
      displayName,
      divisionName: division?.name ?? null,
      paid: settled,
      amountDueCents: settled ? 0 : fee,
    };
  }

  // League night
  const leagueId = station.leagueId!;
  const { data: reg } = await supabase
    .from("league_registrations")
    .select("id, status, payment_status")
    .eq("league_id", leagueId)
    .eq("user_id", args.playerId)
    .maybeSingle();

  if (reg?.status === "withdrawn") {
    return {
      outcome: "blocked",
      message: "This league registration was withdrawn. See the organizer.",
      displayName,
      divisionName: division?.name ?? null,
      paid: false,
      amountDueCents: fee,
    };
  }

  if (!reg) {
    if (!walkUpsAllowed) {
      return {
        outcome: "blocked",
        message: station.walkUpsAllowed
          ? "You're not registered for this league — see the organizer."
          : "This league is pre-registration only, so the field is closed. See the organizer.",
        displayName,
        divisionName: division?.name ?? null,
        paid: false,
        amountDueCents: fee,
      };
    }
    const { error: signupError } = await supabase.from("league_registrations").insert({
      league_id: leagueId,
      user_id: args.playerId,
      division_id: division?.id ?? null,
      division: division?.code ?? null,
      status: "confirmed",
      payment_status: paid ? "paid" : "unpaid",
      notes: `Kiosk sign-up (${args.paymentMethod})`,
    });
    if (signupError) throw signupError;
  } else {
    const patch: Record<string, unknown> = {};
    if (division) {
      patch.division_id = division.id;
      patch.division = division.code;
    }
    if (paid && reg.payment_status === "unpaid") patch.payment_status = "paid";
    if (Object.keys(patch).length) {
      await supabase.from("league_registrations").update(patch).eq("id", reg.id);
    }
  }

  const { data: existing } = await supabase
    .from("league_event_checkins")
    .select("id")
    .eq("league_event_id", station.id)
    .eq("user_id", args.playerId)
    .maybeSingle();

  if (existing) {
    return {
      outcome: "already",
      message: "You're already checked in tonight.",
      displayName,
      divisionName: division?.name ?? null,
      paid: paid || reg?.payment_status === "paid",
      amountDueCents: 0,
    };
  }

  const { error } = await supabase.from("league_event_checkins").insert({
    league_event_id: station.id,
    league_id: leagueId,
    user_id: args.playerId,
    checked_in_by: actorId,
    check_in_method: "self",
    paid,
  });
  if (error) throw error;

  return {
    outcome: "checked_in",
    message: paid ? "You're in — have a great round." : "You're in. Settle up with the organizer when you can.",
    displayName,
    divisionName: division?.name ?? null,
    paid,
    amountDueCents: paid ? 0 : fee,
  };
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

export type KioskGuestArgs = {
  fullName: string;
  email: string | null;
  phone: string | null;
  pdgaNumber: string | null;
  divisionId: string | null;
  paymentMethod: KioskPaymentMethod;
  signupOptIn: boolean;
  allowPaymentCapture: boolean;
};

export type KioskGuestResult = {
  ok: true;
  displayName: string;
  divisionName: string | null;
  paid: boolean;
  amountDueCents: number;
  inviteSent: boolean;
};

export async function kioskGuestCheckIn(
  supabase: Client,
  actorId: string,
  station: KioskStation,
  args: KioskGuestArgs,
): Promise<KioskGuestResult> {
  const division = station.divisions.find((d) => d.id === args.divisionId) ?? null;
  const paid = args.allowPaymentCapture && isPaidMethod(args.paymentMethod);
  const fee = division?.entryFeeCents ?? 0;

  const { data: row, error } = await supabase
    .from("kiosk_guest_checkins")
    .insert({
      event_kind: station.kind,
      tournament_id: station.kind === "tournament" ? station.id : null,
      league_event_id: station.kind === "league_event" ? station.id : null,
      league_id: station.leagueId,
      full_name: args.fullName,
      email: args.email,
      phone: args.phone,
      pdga_number: args.pdgaNumber,
      division_name: division?.name ?? null,
      payment_status: paid ? "paid" : "unpaid",
      payment_method: args.paymentMethod,
      signup_opt_in: args.signupOptIn,
      created_by: actorId,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;

  let inviteSent = false;
  if (args.signupOptIn && args.email) {
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const { getRequestUrl } = await import("@tanstack/react-start/server");
      let signupUrl = "https://dgdashboard.app/auth";
      try {
        signupUrl = new URL("/auth", getRequestUrl()).toString();
      } catch {
        /* fall back to the published sign-in URL */
      }
      const res = await sendTemplateEmail("kiosk-signup-invite", args.email, {
        templateData: {
          guest_name: args.fullName,
          event_title: station.name,
          event_subtitle: station.subtitle,
          signup_url: signupUrl,
        },
        idempotencyKey: `kiosk-invite:${row?.id ?? args.email}`,
      });
      inviteSent = res.sent === true;
      if (inviteSent && row?.id) {
        await supabase
          .from("kiosk_guest_checkins")
          .update({ signup_email_sent_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    } catch (e) {
      // Never block a check-in on email delivery.
      console.error("kiosk signup invite failed", e);
    }
  }

  return {
    ok: true,
    displayName: args.fullName,
    divisionName: division?.name ?? null,
    paid,
    amountDueCents: paid ? 0 : fee,
    inviteSent,
  };
}

export type KioskGuestRow = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  pdgaNumber: string | null;
  divisionName: string | null;
  paymentStatus: string;
  signupOptIn: boolean;
  createdAt: string;
};

export async function listKioskGuests(
  supabase: Client,
  station: KioskStation,
): Promise<KioskGuestRow[]> {
  const column = station.kind === "tournament" ? "tournament_id" : "league_event_id";
  const { data } = await supabase
    .from("kiosk_guest_checkins")
    .select(
      "id, full_name, email, phone, pdga_number, division_name, payment_status, signup_opt_in, created_at",
    )
    .eq(column, station.id)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email ?? null,
    phone: r.phone ?? null,
    pdgaNumber: r.pdga_number ?? null,
    divisionName: r.division_name ?? null,
    paymentStatus: r.payment_status,
    signupOptIn: r.signup_opt_in,
    createdAt: r.created_at,
  }));
}
