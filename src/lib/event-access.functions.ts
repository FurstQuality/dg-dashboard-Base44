/**
 * Who may change a league or tournament, and how people ask for that access.
 *
 * The rule set lives in the database (controls_event_access / can_manage_event)
 * so RLS enforces it even if someone calls the API directly. These functions
 * read the same rules for the UI and perform controller-only mutations with an
 * explicit server-side check before touching a row.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type EventKind = "league" | "tournament";
export type EventAccessLevel = "manage" | "score";

export type EventManagerRow = {
  id: string;
  userId: string;
  accessLevel: EventAccessLevel;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
  createdAt: string;
};

export type EventAccessRequestRow = {
  id: string;
  userId: string;
  message: string | null;
  status: "pending" | "approved" | "declined" | "withdrawn";
  createdAt: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type EventAccess = {
  kind: EventKind;
  eventId: string;
  eventName: string | null;
  /** Can change event details, divisions, rounds, checklist, scoring. */
  canManage: boolean;
  /** Can grant or revoke other people's access. */
  isController: boolean;
  ownerId: string | null;
  clubId: string | null;
  clubName: string | null;
  /** Plain-language reason this person has access, for badges. */
  accessReason: "owner" | "club" | "manager" | "staff" | "none";
  managers: EventManagerRow[];
  requests: EventAccessRequestRow[];
  myRequest: EventAccessRequestRow | null;
};

const kindSchema = z.enum(["league", "tournament"]);
const levelSchema = z.enum(["manage", "score"]);

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

function personOf(p: Profile | undefined, userId: string) {
  return {
    displayName: p?.display_name || p?.username || "DG Dashboard player",
    username: p?.username ?? null,
    avatarUrl: p?.avatar_url ?? null,
    userId,
  };
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */
export const getEventAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: EventKind; eventId: string }) =>
    z.object({ kind: kindSchema, eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EventAccess> => {
    const { supabase, userId } = context;
    const { kind, eventId } = data;

    const table = kind === "league" ? "leagues" : "tournaments";
    const [{ data: event }, { data: canManage }, { data: isController }, managerRes, requestRes] =
      await Promise.all([
        supabase.from(table).select("id, name, owner_id, club_id").eq("id", eventId).maybeSingle(),
        supabase.rpc("can_manage_event", { _kind: kind, _event: eventId, _user: userId }),
        supabase.rpc("controls_event_access", { _kind: kind, _event: eventId, _user: userId }),
        supabase
          .from("event_managers")
          .select("id, user_id, access_level, created_at")
          .eq("kind", kind)
          .eq("event_id", eventId)
          .order("created_at", { ascending: true }),
        supabase
          .from("event_manager_requests")
          .select("id, user_id, message, status, created_at")
          .eq("kind", kind)
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
      ]);

    const ownerId = (event as { owner_id?: string } | null)?.owner_id ?? null;
    const clubId = (event as { club_id?: string | null } | null)?.club_id ?? null;

    const managerRows = managerRes.data ?? [];
    const requestRows = requestRes.data ?? [];
    const peopleIds = [
      ...new Set(
        [
          ownerId,
          ...managerRows.map((m) => m.user_id),
          ...requestRows.map((r) => r.user_id),
        ].filter((id): id is string => !!id),
      ),
    ];

    const [{ data: profiles }, { data: club }] = await Promise.all([
      peopleIds.length
        ? supabase
            .from("profiles")
            .select("id, display_name, username, avatar_url")
            .in("id", peopleIds)
        : Promise.resolve({ data: [] as Profile[] }),
      clubId
        ? supabase.from("clubs").select("id, name").eq("id", clubId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]));

    const managers: EventManagerRow[] = managerRows.map((m) => ({
      id: m.id,
      accessLevel: (m.access_level as EventAccessLevel) ?? "manage",
      isOwner: false,
      createdAt: m.created_at,
      ...personOf(byId.get(m.user_id), m.user_id),
    }));
    if (ownerId && !managers.some((m) => m.userId === ownerId)) {
      managers.unshift({
        id: `owner:${ownerId}`,
        accessLevel: "manage",
        isOwner: true,
        createdAt: "",
        ...personOf(byId.get(ownerId), ownerId),
      });
    }

    const requests: EventAccessRequestRow[] = requestRows.map((r) => ({
      id: r.id,
      message: r.message ?? null,
      status: r.status as EventAccessRequestRow["status"],
      createdAt: r.created_at,
      ...personOf(byId.get(r.user_id), r.user_id),
    }));

    const mine = requests.find((r) => r.userId === userId && r.status === "pending") ?? null;
    const managerLevel = managerRows.find((m) => m.user_id === userId)?.access_level;

    const accessReason: EventAccess["accessReason"] = isController
      ? clubId
        ? "club"
        : "owner"
      : ownerId === userId
        ? "owner"
        : managerLevel
          ? "manager"
          : canManage
            ? "staff"
            : "none";

    return {
      kind,
      eventId,
      eventName: (event as { name?: string } | null)?.name ?? null,
      canManage: !!canManage,
      isController: !!isController,
      ownerId,
      clubId,
      clubName: (club as { name?: string } | null)?.name ?? null,
      accessReason,
      managers,
      requests: requests.filter((r) => r.status === "pending"),
      myRequest: mine,
    };
  });

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */
export const requestEventAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { kind: EventKind; eventId: string; message?: string }) =>
    z
      .object({
        kind: kindSchema,
        eventId: z.string().uuid(),
        message: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("event_manager_requests")
      .select("id")
      .eq("kind", data.kind)
      .eq("event_id", data.eventId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) return { ok: true, alreadyPending: true };

    const { error } = await supabase.from("event_manager_requests").insert({
      kind: data.kind,
      event_id: data.eventId,
      user_id: userId,
      message: data.message?.length ? data.message : null,
      status: "pending",
    });
    if (error) throw new Error("We couldn't send that request. Give it another try in a moment.");

    // Let whoever runs the event know somebody wants to help.
    const table = data.kind === "league" ? "leagues" : "tournaments";
    const { data: event } = await supabase
      .from(table)
      .select("name, owner_id, club_id")
      .eq("id", data.eventId)
      .maybeSingle();
    const ownerId = (event as { owner_id?: string } | null)?.owner_id;
    if (ownerId) {
      await supabase.rpc("notify_user", {
        _user_id: ownerId,
        _type: "event",
        _data: {
          kind: "event_access_request",
          event_kind: data.kind,
          event_id: data.eventId,
          event_name: (event as { name?: string } | null)?.name ?? null,
        },
      });
    }
    return { ok: true, alreadyPending: false };
  });

export const withdrawEventAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { requestId: string }) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("event_manager_requests")
      .update({ status: "withdrawn" })
      .eq("id", data.requestId)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw new Error("We couldn't withdraw that request just now.");
    return { ok: true };
  });

export const decideEventAccessRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { requestId: string; approve: boolean; accessLevel?: EventAccessLevel }) =>
      z
        .object({
          requestId: z.string().uuid(),
          approve: z.boolean(),
          accessLevel: levelSchema.optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: req } = await supabase
      .from("event_manager_requests")
      .select("id, kind, event_id, user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("That request is no longer available.");

    const { data: allowed } = await supabase.rpc("controls_event_access", {
      _kind: req.kind,
      _event: req.event_id,
      _user: userId,
    });
    if (!allowed)
      throw new Error("Only the event owner or its club admins can answer this request.");

    if (data.approve) {
      const { error } = await supabase.from("event_managers").upsert(
        {
          kind: req.kind,
          event_id: req.event_id,
          user_id: req.user_id,
          access_level: data.accessLevel ?? "manage",
          granted_by: userId,
        },
        { onConflict: "kind,event_id,user_id" },
      );
      if (error) throw new Error("We couldn't grant that access. Try again in a moment.");
    }

    await supabase
      .from("event_manager_requests")
      .update({
        status: data.approve ? "approved" : "declined",
        decided_by: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", req.id);

    await supabase.rpc("notify_user", {
      _user_id: req.user_id,
      _type: "event",
      _data: {
        kind: data.approve ? "event_access_approved" : "event_access_declined",
        event_kind: req.kind,
        event_id: req.event_id,
      },
    });

    return { ok: true, approved: data.approve };
  });

/* ------------------------------------------------------------------ */
/* Manager roster                                                      */
/* ------------------------------------------------------------------ */
export const setEventManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { kind: EventKind; eventId: string; userId: string; accessLevel: EventAccessLevel }) =>
      z
        .object({
          kind: kindSchema,
          eventId: z.string().uuid(),
          userId: z.string().uuid(),
          accessLevel: levelSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed } = await supabase.rpc("controls_event_access", {
      _kind: data.kind,
      _event: data.eventId,
      _user: userId,
    });
    if (!allowed)
      throw new Error("Only the event owner or its club admins can change who manages this event.");

    const { error } = await supabase.from("event_managers").upsert(
      {
        kind: data.kind,
        event_id: data.eventId,
        user_id: data.userId,
        access_level: data.accessLevel,
        granted_by: userId,
      },
      { onConflict: "kind,event_id,user_id" },
    );
    if (error) throw new Error("We couldn't save that change. Try again in a moment.");
    return { ok: true };
  });

export const removeEventManager = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { managerId: string }) =>
    z.object({ managerId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("event_managers")
      .select("id, kind, event_id, user_id")
      .eq("id", data.managerId)
      .maybeSingle();
    if (!row) return { ok: true };

    const { data: allowed } = await supabase.rpc("controls_event_access", {
      _kind: row.kind,
      _event: row.event_id,
      _user: userId,
    });
    if (!allowed && row.user_id !== userId) {
      throw new Error("Only the event owner or its club admins can remove a manager.");
    }
    const { error } = await supabase.from("event_managers").delete().eq("id", data.managerId);
    if (error) throw new Error("We couldn't remove that manager just now.");
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Event Management list                                               */
/* ------------------------------------------------------------------ */
export type ManagedEventRow = {
  kind: EventKind;
  id: string;
  name: string;
  slug: string | null;
  status: string;
  startDate: string | null;
  reason: "owner" | "club" | "manager";
};

export const listManagedEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: ManagedEventRow[]; pendingRequests: number }> => {
    const { supabase, userId } = context;

    const [{ data: clubs }, { data: grants }] = await Promise.all([
      supabase
        .from("club_members")
        .select("club_id")
        .eq("user_id", userId)
        .in("role", ["owner", "admin"]),
      supabase
        .from("event_managers")
        .select("kind, event_id")
        .eq("user_id", userId)
        .eq("access_level", "manage"),
    ]);
    const clubIds = (clubs ?? []).map((c) => c.club_id);
    const grantIds = {
      league: (grants ?? []).filter((g) => g.kind === "league").map((g) => g.event_id),
      tournament: (grants ?? []).filter((g) => g.kind === "tournament").map((g) => g.event_id),
    };

    const rows: ManagedEventRow[] = [];

    for (const kind of ["league", "tournament"] as EventKind[]) {
      const table = kind === "league" ? "leagues" : "tournaments";
      const filters = [`owner_id.eq.${userId}`];
      if (clubIds.length) filters.push(`club_id.in.(${clubIds.join(",")})`);
      if (grantIds[kind].length) filters.push(`id.in.(${grantIds[kind].join(",")})`);

      const { data } = await supabase
        .from(table)
        .select("id, name, slug, status, start_date, owner_id, club_id")
        .or(filters.join(","))
        .order("start_date", { ascending: false })
        .limit(100);

      for (const e of data ?? []) {
        const row = e as {
          id: string;
          name: string;
          slug: string | null;
          status: string;
          start_date: string | null;
          owner_id: string | null;
          club_id: string | null;
        };
        rows.push({
          kind,
          id: row.id,
          name: row.name,
          slug: row.slug,
          status: row.status,
          startDate: row.start_date,
          reason:
            row.owner_id === userId && !row.club_id
              ? "owner"
              : row.club_id && clubIds.includes(row.club_id)
                ? "club"
                : row.owner_id === userId
                  ? "owner"
                  : "manager",
        });
      }
    }

    const eventIds = rows.map((r) => r.id);
    let pendingRequests = 0;
    if (eventIds.length) {
      const { count } = await supabase
        .from("event_manager_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .in("event_id", eventIds);
      pendingRequests = count ?? 0;
    }

    return { events: rows, pendingRequests };
  });
