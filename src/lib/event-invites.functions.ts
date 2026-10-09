import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EventKind = z.enum(["community", "tournament", "league", "round"]);
const RSVP = z.enum(["going", "maybe", "declined"]);

const InviteTargetSchema = z
  .object({
    invitee_user_id: z.string().uuid().optional(),
    invitee_email: z.string().email().max(255).optional(),
    invitee_phone: z.string().trim().max(40).optional(),
    invitee_name: z.string().trim().max(120).optional(),
  })
  .refine((v) => v.invitee_user_id || v.invitee_email || v.invitee_phone, {
    message: "Each invitee needs a user, email, or phone",
  });

const CreateInvitesSchema = z.object({
  event_kind: EventKind,
  event_id: z.string().uuid(),
  event_title: z.string().trim().max(200).optional(),
  event_starts_at: z.string().optional(),
  event_location: z.string().trim().max(200).optional(),
  personal_message: z.string().trim().max(1000).optional(),
  invites: z.array(InviteTargetSchema).min(1).max(200),
});

function publicOrigin(): string {
  return process.env.PUBLIC_APP_URL ?? "https://dgdashboard.app";
}

function kindLabel(k: string) {
  return k === "community"
    ? "Community event"
    : k === "tournament"
      ? "Tournament"
      : k === "league"
        ? "League"
        : "Round";
}

function formatWhen(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * Create invites for an event. Resolves in-app users -> notifications.
 * Email invites go out via the managed email API.
 */
export const createEventInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInvitesSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load inviter's display name for email/notifications.
    const { data: inviterProfile } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle();
    const inviterName =
      inviterProfile?.display_name || inviterProfile?.username || "A DG Dashboard friend";

    // De-dupe: skip invites that already exist for this event
    const { data: existing } = await supabase
      .from("event_invites")
      .select("invitee_user_id, invitee_email, invitee_phone")
      .eq("event_kind", data.event_kind)
      .eq("event_id", data.event_id)
      .eq("inviter_id", userId);
    const existSet = new Set(
      (existing ?? []).map(
        (r) =>
          `${r.invitee_user_id ?? ""}|${(r.invitee_email ?? "").toLowerCase()}|${r.invitee_phone ?? ""}`,
      ),
    );

    const rows = data.invites
      .filter((inv) => {
        const key = `${inv.invitee_user_id ?? ""}|${(inv.invitee_email ?? "").toLowerCase()}|${inv.invitee_phone ?? ""}`;
        return !existSet.has(key);
      })
      .map((inv) => ({
        event_kind: data.event_kind,
        event_id: data.event_id,
        event_title: data.event_title ?? null,
        event_starts_at: data.event_starts_at ?? null,
        event_location: data.event_location ?? null,
        inviter_id: userId,
        invitee_user_id: inv.invitee_user_id ?? null,
        invitee_email: inv.invitee_email?.toLowerCase() ?? null,
        invitee_phone: inv.invitee_phone ?? null,
        invitee_name: inv.invitee_name ?? null,
        personal_message: data.personal_message ?? null,
      }));

    if (rows.length === 0) {
      return { created: 0, emailed: 0, notified: 0, skipped: data.invites.length };
    }

    const { data: inserted, error } = await supabase
      .from("event_invites")
      .insert(rows)
      .select("id, token, invitee_user_id, invitee_email, invitee_name");
    if (error) throw new Error(error.message);

    // In-app notifications for user invites
    const userInvites = (inserted ?? []).filter((r) => r.invitee_user_id);
    let notified = 0;
    if (userInvites.length) {
      const notifRows = userInvites.map((r) => ({
        user_id: r.invitee_user_id!,
        actor_id: userId,
        type: "event" as const,
        data: {
          title: `${inviterName} invited you to ${data.event_title ?? "an event"}`,
          body: data.personal_message ?? null,
          link: `${publicOrigin()}/invite/${r.token}`,
          event_kind: data.event_kind,
          event_id: data.event_id,
        },
      }));
      const { error: ne } = await supabase.from("notifications").insert(notifRows);
      if (!ne) notified = userInvites.length;
    }

    // Email invites
    let emailed = 0;
    const emailInvites = (inserted ?? []).filter((r) => r.invitee_email);
    if (emailInvites.length) {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      for (const inv of emailInvites) {
        try {
          const res = await sendTemplateEmail("event-invite", inv.invitee_email!, {
            templateData: {
              inviter_name: inviterName,
              event_title: data.event_title ?? "a disc golf event",
              event_kind_label: kindLabel(data.event_kind),
              event_when: formatWhen(data.event_starts_at),
              event_where: data.event_location ?? null,
              personal_message: data.personal_message ?? null,
              rsvp_url: `${publicOrigin()}/invite/${inv.token}`,
            },
            idempotencyKey: `event-invite-${inv.id}`,
          });
          if (res.sent) {
            emailed += 1;
            await supabase
              .from("event_invites")
              .update({ status: "sent", email_sent_at: new Date().toISOString() })
              .eq("id", inv.id);
          } else {
            await supabase
              .from("event_invites")
              .update({ status: "failed", error_message: "recipient_suppressed" })
              .eq("id", inv.id);
          }
        } catch (err: any) {
          await supabase
            .from("event_invites")
            .update({
              status: "failed",
              error_message: err?.message?.slice(0, 500) ?? "unknown error",
            })
            .eq("id", inv.id);
        }
      }
    }

    // SMS invites — no-op unless Twilio env vars are configured
    let texted = 0;
    let sms_skipped_unconfigured = 0;
    const phoneInvites = (inserted ?? []).filter(
      (r) => !r.invitee_email && (r as any).invitee_user_id == null,
    );
    // Re-select to get phones for inserted rows
    const insertedIds = (inserted ?? []).map((r) => r.id);
    if (insertedIds.length) {
      const { data: withPhones } = await supabase
        .from("event_invites")
        .select("id, token, invitee_phone, invitee_name")
        .in("id", insertedIds)
        .not("invitee_phone", "is", null);
      if (withPhones && withPhones.length) {
        const { sendSms, isSmsConfigured } = await import("@/lib/sms.server");
        if (!isSmsConfigured()) {
          sms_skipped_unconfigured = withPhones.length;
        } else {
          const when = formatWhen(data.event_starts_at);
          for (const inv of withPhones) {
            const link = `${publicOrigin()}/invite/${inv.token}`;
            const bodyText = [
              `${inviterName} invited you to ${data.event_title ?? "a disc golf event"} on DG Dashboard.`,
              when ? `When: ${when}` : null,
              data.event_location ? `Where: ${data.event_location}` : null,
              `RSVP: ${link}`,
            ]
              .filter(Boolean)
              .join("\n");
            const res = await sendSms(inv.invitee_phone!, bodyText);
            if (res.sent) {
              texted += 1;
              await supabase
                .from("event_invites")
                .update({ status: "sent", email_sent_at: new Date().toISOString() })
                .eq("id", inv.id);
            } else {
              await supabase
                .from("event_invites")
                .update({
                  status: "failed",
                  error_message:
                    `sms:${res.reason}${"error" in res && res.error ? `:${res.error}` : ""}`.slice(
                      0,
                      500,
                    ),
                })
                .eq("id", inv.id);
            }
          }
        }
      }
    }

    return {
      created: inserted?.length ?? 0,
      notified,
      emailed,
      texted,
      sms_skipped_unconfigured,
      skipped: data.invites.length - (inserted?.length ?? 0),
    };
  });

const ListSchema = z.object({
  event_kind: EventKind,
  event_id: z.string().uuid(),
});

export const listEventInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("event_invites")
      .select(
        "id, invitee_user_id, invitee_email, invitee_phone, invitee_name, status, rsvp, created_at, email_sent_at, responded_at",
      )
      .eq("event_kind", data.event_kind)
      .eq("event_id", data.event_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Hydrate profiles for user invites
    const userIds = (rows ?? []).map((r) => r.invitee_user_id).filter(Boolean) as string[];
    const profiles: Record<
      string,
      { display_name: string | null; username: string | null; avatar_url: string | null }
    > = {};
    if (userIds.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", userIds);
      for (const row of p ?? [])
        profiles[row.id] = {
          display_name: row.display_name,
          username: row.username,
          avatar_url: row.avatar_url,
        };
    }
    return { rows: rows ?? [], profiles };
  });

const TokenSchema = z.object({ token: z.string().uuid() });

export const getInviteByToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => TokenSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("event_invites")
      .select(
        "id, event_kind, event_id, event_title, event_starts_at, event_location, personal_message, inviter_id, invitee_user_id, invitee_email, rsvp, status",
      )
      .eq("token", data.token)
      .maybeSingle();
    if (!row || row.status === "cancelled") throw new Error("Invite not found");

    // Bind invite to current signed-in user if not already bound
    if (!row.invitee_user_id) {
      await supabase.from("event_invites").update({ invitee_user_id: userId }).eq("id", row.id);
      row.invitee_user_id = userId;
    }
    const { data: inviter } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", row.inviter_id)
      .maybeSingle();
    return { invite: row, inviter };
  });

const RespondSchema = z.object({
  token: z.string().uuid(),
  rsvp: RSVP,
});

export const respondToInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RespondSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("event_invites")
      .select("id, invitee_user_id, status")
      .eq("token", data.token)
      .maybeSingle();
    if (!row || row.status === "cancelled") throw new Error("Invite not found");
    if (row.invitee_user_id && row.invitee_user_id !== userId) {
      throw new Error("This invite belongs to a different account");
    }
    const { error } = await supabase
      .from("event_invites")
      .update({
        invitee_user_id: userId,
        rsvp: data.rsvp,
        responded_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const CancelSchema = z.object({ id: z.string().uuid() });

export const cancelInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CancelSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("event_invites")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("inviter_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Get friends + crews for the invite picker. */
export const getInvitePickerData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: friendships } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .eq("status", "accepted");
    const friendIds = new Set<string>();
    for (const f of friendships ?? []) {
      friendIds.add(f.requester_id === userId ? f.addressee_id : f.requester_id);
    }
    const friendIdArr = Array.from(friendIds);
    let friends: Array<{
      id: string;
      display_name: string | null;
      username: string | null;
      avatar_url: string | null;
    }> = [];
    if (friendIdArr.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", friendIdArr)
        .order("display_name", { ascending: true });
      friends = data ?? [];
    }

    const { data: crews } = await supabase
      .from("tracker_groups")
      .select("id, name")
      .eq("owner_id", userId)
      .order("name", { ascending: true });

    const crewIds = (crews ?? []).map((c) => c.id);
    const crewMembers: Record<
      string,
      Array<{ pdga_number: string | null; display_name: string | null }>
    > = {};
    if (crewIds.length) {
      const { data: mem } = await supabase
        .from("tracker_group_members")
        .select("group_id, pdga_number, display_name")
        .in("group_id", crewIds);
      for (const m of (mem ?? []) as Array<{
        group_id: string;
        pdga_number: string | null;
        display_name: string | null;
      }>) {
        (crewMembers[m.group_id] ??= []).push({
          pdga_number: m.pdga_number ?? null,
          display_name: m.display_name ?? null,
        });
      }
    }
    return { friends, crews: crews ?? [], crewMembers };
  });
