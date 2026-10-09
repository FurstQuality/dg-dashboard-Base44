/**
 * Phase 9 — client hooks for the public DGD identity (V1.3 on the 500–1200
 * scale + Tier). Values come pre-scaled from server RPCs; the UI never
 * transforms Skill.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDgdPreview } from "@/lib/dgd-v1.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Tier } from "@/lib/dgd-tier/engine";

export type DgdIdentity = {
  user_id: string;
  dgd_rating: number | null;
  form_value: number | null;
  confidence: number | null;
  rating_status: string | null;
  eligible_rounds: number | null;
  tier: Tier | null;
  tier_score: number | null;
};

export function useDgdIdentities(userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))].sort();
  return useQuery({
    queryKey: ["dgd-identity", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_player_dgd_identity", { _users: ids });
      if (error) throw error;
      return new Map<string, DgdIdentity>(((data ?? []) as DgdIdentity[]).map((r) => [r.user_id, r]));
    },
  });
}

export function useDgdIdentity(userId: string | null | undefined) {
  const q = useDgdIdentities([userId]);
  return { ...q, data: userId ? (q.data?.get(userId) ?? null) : null };
}

/** V1.3 DGD Round Rating for one source round (external_rounds / rounds id). */
export function useDgdRoundRating(sourceRowId: string | null | undefined) {
  return useQuery({
    queryKey: ["dgd-round-rating", sourceRowId],
    enabled: !!sourceRowId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dgd_round_ratings", { _source_ids: [sourceRowId] });
      if (error) throw error;
      return ((data ?? [])[0]?.dgd_round_rating ?? null) as number | null;
    },
  });
}

/** The signed-in player's public V1.3 DGD summary (shared cache with Statboard). */
export function useMyDgdRating() {
  const fn = useServerFn(getMyDgdPreview);
  return useQuery({
    queryKey: ["dgd-rating-v13"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try { return (await fn({ data: { model: "v13" } })) as Record<string, any>; } catch { return null; }
    },
  });
}

/** DGD Rating + Tier for PDGA numbers that are linked to a DG Dashboard account. Unlinked players get nothing — never a made-up number. */
export function useDgdByPdga(pdgaNumbers: (string | null | undefined)[]) {
  const nums = [...new Set(pdgaNumbers.filter((x): x is string => !!x).map(String))].sort();
  return useQuery({
    queryKey: ["dgd-by-pdga", nums],
    enabled: nums.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_dgd_identity_by_pdga", { _pdga: nums });
      if (error) throw error;
      return new Map<string, { dgd_rating: number | null; tier: Tier }>(
        ((data ?? []) as any[]).map((r) => [String(r.pdga_number), { dgd_rating: r.dgd_rating, tier: r.tier }]),
      );
    },
  });
}
