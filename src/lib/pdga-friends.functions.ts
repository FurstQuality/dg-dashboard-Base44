import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { lookupPdgaPlayer } from "@/lib/pdga-lab.functions";

/**
 * Add a friend by PDGA number.
 * - If a DG Dashboard profile already has that pdga_number → send a friend request.
 * - Otherwise → create a shareable PDGA invite with the player's cached stats,
 *   which auto-converts to an accepted friendship when they join via the invite
 *   link and set their PDGA number in their profile.
 */
export const addPdgaFriend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ pdgaNumber: z.string().trim().min(1).max(12) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const num = data.pdgaNumber.replace(/\D/g, "");
    if (!num) throw new Error("Enter a valid PDGA number");

    // Look up + cache PDGA profile (also seeds pdga_players cache)
    const looked = (await lookupPdgaPlayer({ data: { pdgaNumber: parseInt(num, 10) } })) as any;
    const profileInfo = looked?.profile ?? {};
    const name: string | null = profileInfo.name ?? null;
    const rating: number | null = profileInfo.current_rating ?? null;
    const location: string | null = profileInfo.location ?? null;

    // Is anyone on the app with this PDGA #?
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, pdga_rating")
      .eq("pdga_number", num)
      .maybeSingle();

    if (existing) {
      if (existing.id === userId) {
        return { kind: "self" as const, profile: existing };
      }
      // Check for existing friendship first
      const { data: rel } = await supabase
        .from("friendships")
        .select("id, status, requester_id, addressee_id")
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${existing.id}),and(requester_id.eq.${existing.id},addressee_id.eq.${userId})`,
        )
        .maybeSingle();
      if (rel) return { kind: "already_related" as const, profile: existing, relationship: rel };

      const { error } = await supabase.from("friendships").insert({
        requester_id: userId,
        addressee_id: existing.id,
        status: "pending",
      });
      if (error) throw new Error(error.message);
      // A database trigger notifies the player about the waiting request.
      return { kind: "friend_request_sent" as const, profile: existing };
    }

    // Not on app → upsert invite
    const { data: invite, error } = await supabase
      .from("pdga_friend_invites")
      .upsert(
        {
          inviter_id: userId,
          pdga_number: num,
          display_name: name,
          pdga_rating: rating,
          location,
        },
        { onConflict: "inviter_id,pdga_number" },
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { kind: "invite_created" as const, invite };
  });

export const listMyPdgaInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("pdga_friend_invites")
      .select("*")
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const cancelPdgaInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pdga_friend_invites").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public — powers /invite/pdga/$token share page. */
export const getPdgaInviteByToken = createServerFn({ method: "POST" })
  .validator((raw) => z.object({ token: z.string().min(4).max(64) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite } = await supabaseAdmin
      .from("pdga_friend_invites")
      .select(
        "id, inviter_id, pdga_number, display_name, pdga_rating, location, status, created_at",
      )
      .eq("invite_token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("Invite not found");
    const { data: inviterProfile } = await supabaseAdmin
      .from("profiles")
      .select("username, display_name, avatar_url")
      .eq("id", invite.inviter_id as string)
      .maybeSingle();
    // Do not leak inviter_id to the client
    const { inviter_id: _omit, ...invitePublic } = invite as {
      inviter_id: string;
      id: string;
      pdga_number: string;
      display_name: string | null;
      pdga_rating: number | null;
      location: string | null;
      status: string;
      created_at: string;
    };
    void _omit;
    return { invite: invitePublic, inviter: inviterProfile };
  });
