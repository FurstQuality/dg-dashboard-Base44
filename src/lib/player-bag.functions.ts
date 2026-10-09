/**
 * Reading another player's bag.
 *
 * Bag rows live in `user_discs`, which is owner-only under RLS, so a public
 * bag view has to be served here: we resolve the profile, apply the owner's
 * "My Bag" profile-visibility choice, and only then return the discs. The
 * viewer's own bag comes back in the same payload so the profile can show a
 * side-by-side comparison without a second round trip.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mergePrivacyPrefs, type PrivacyPrefs } from "@/lib/platform-config";
import {
  canViewAudience,
  effectiveSectionVisibility,
  resolveProfileViewer,
} from "@/lib/profile-visibility";

export type PublicBagDisc = {
  id: string;
  nickname: string | null;
  color: string | null;
  is_favorite: boolean;
  slot_order: number;
  weight_g: number | null;
  plastic_name: string | null;
  condition: string;
  purpose: string | null;
  mold_name: string | null;
  manufacturer: string | null;
  category: string | null;
  stability: string | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
};

export type PlayerBagData = {
  /** True when the owner keeps their bag hidden from this viewer. */
  hidden: boolean;
  isSelf: boolean;
  displayName: string;
  discs: PublicBagDisc[];
  /** The signed-in viewer's own bag, for comparison. */
  myDiscs: PublicBagDisc[];
};

const BAG_SELECT =
  "id,nickname,color,is_favorite,slot_order,weight_g,plastic_name,condition,purpose, mold:disc_molds(name,category,stability,speed,glide,turn,fade, manufacturer:disc_manufacturers(name))";

type RawRow = {
  id: string;
  nickname: string | null;
  color: string | null;
  is_favorite: boolean | null;
  slot_order: number | null;
  weight_g: number | null;
  plastic_name: string | null;
  condition: string | null;
  purpose: string | null;
  mold: {
    name: string | null;
    category: string | null;
    stability: string | null;
    speed: number | null;
    glide: number | null;
    turn: number | null;
    fade: number | null;
    manufacturer?: { name: string | null } | null;
  } | null;
};

function shape(rows: RawRow[] | null): PublicBagDisc[] {
  return (rows ?? []).map((r) => ({
    id: r.id,
    nickname: r.nickname,
    color: r.color,
    is_favorite: !!r.is_favorite,
    slot_order: r.slot_order ?? 0,
    weight_g: r.weight_g,
    plastic_name: r.plastic_name,
    condition: r.condition ?? "new",
    purpose: r.purpose,
    mold_name: r.mold?.name ?? null,
    manufacturer: r.mold?.manufacturer?.name ?? null,
    category: r.mold?.category ?? null,
    stability: r.mold?.stability ?? null,
    speed: r.mold?.speed ?? null,
    glide: r.mold?.glide ?? null,
    turn: r.mold?.turn ?? null,
    fade: r.mold?.fade ?? null,
  }));
}

export const getPlayerBag = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ username: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }): Promise<PlayerBagData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const viewerId = context.userId;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username, privacy_prefs")
      .eq("username", data.username)
      .maybeSingle();
    if (!profile) throw new Error("We couldn't find that player.");

    const ownerId = profile.id as string;
    const isSelf = ownerId === viewerId;
    const displayName = (profile.display_name as string | null) ?? data.username;

    let hidden = false;
    if (!isSelf) {
      const privacy = mergePrivacyPrefs(
        (profile as { privacy_prefs?: Partial<PrivacyPrefs> | null }).privacy_prefs,
      );
      const { data: fr } = await supabaseAdmin
        .from("friendships")
        .select("status, requester_id, addressee_id")
        .eq("status", "accepted")
        .or(
          `and(requester_id.eq.${viewerId},addressee_id.eq.${ownerId}),and(requester_id.eq.${ownerId},addressee_id.eq.${viewerId})`,
        )
        .maybeSingle();
      const viewer = resolveProfileViewer(false, !!fr);
      const effective = effectiveSectionVisibility(privacy.profileVisibility, privacy.sections);
      hidden = !canViewAudience(effective.bag, viewer);
    }

    const [ownerRes, mineRes] = await Promise.all([
      hidden
        ? Promise.resolve({ data: [] as RawRow[] })
        : supabaseAdmin
            .from("user_discs")
            .select(BAG_SELECT)
            .eq("user_id", ownerId)
            .neq("condition", "retired")
            .is("retired_at", null)
            .order("is_favorite", { ascending: false })
            .order("slot_order", { ascending: true }),
      isSelf
        ? Promise.resolve({ data: [] as RawRow[] })
        : supabaseAdmin
            .from("user_discs")
            .select(BAG_SELECT)
            .eq("user_id", viewerId)
            .neq("condition", "retired")
            .is("retired_at", null)
            .order("is_favorite", { ascending: false })
            .order("slot_order", { ascending: true }),
    ]);

    return {
      hidden,
      isSelf,
      displayName,
      discs: shape(ownerRes.data as unknown as RawRow[] | null),
      myDiscs: shape(mineRes.data as unknown as RawRow[] | null),
    };
  });
