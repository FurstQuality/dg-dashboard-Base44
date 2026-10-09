import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aceFundTotal } from "@/lib/side-pots";

const kind = z.enum(["tournament", "league_event"]);
const ref = z.object({ kind, eventId: z.string().uuid() });

export type PrizeRow = {
  id: string;
  event_kind: string;
  event_id: string;
  fund_scope_kind: string;
  fund_scope_id: string | null;
  award_type: string;
  name: string;
  description: string | null;
  hole_number: number | null;
  division_eligibility: string | null;
  sponsor_name: string | null;
  value_kind: string;
  amount: number;
  cost: number | null;
  payout_rule: string;
  winner_percent: number;
  per_player: number;
  contributors: number;
  carryover_in: number;
  added_cash: number;
  round_to_5: boolean;
  remainder_action: string;
  team_award: boolean;
  team_size: number;
  funding_source: string | null;
  visibility: string;
  status: string;
  notes: string | null;
};
export type RecipientRow = {
  id: string;
  prize_id: string;
  user_id: string | null;
  recipient_name: string;
  amount: number;
  paid: boolean;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

type Ctx = { supabase: any; userId: string };

async function assertStaff(ctx: Ctx, k: string, id: string) {
  const { data } = await ctx.supabase.rpc("prize_can_manage", { _kind: k, _event: id, _user: ctx.userId });
  if (!data) throw new Error("Only this event's staff can manage its prizes.");
}

/** League id for a night, so Ace Fund can carry across the league's weeks. */
async function scopeFor(ctx: Ctx, k: string, id: string): Promise<{ kind: "event" | "league"; id: string | null }> {
  if (k !== "league_event") return { kind: "event", id: null };
  const { data } = await ctx.supabase.from("league_events").select("league_id").eq("id", id).maybeSingle();
  return data?.league_id ? { kind: "league", id: data.league_id } : { kind: "event", id: null };
}

async function fundBalance(ctx: Ctx, scopeId: string) {
  const { data } = await ctx.supabase
    .from("prize_fund_ledger")
    .select("amount")
    .eq("scope_kind", "league")
    .eq("scope_id", scopeId)
    .eq("fund_type", "ace_fund");
  return Math.round(((data ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
}

const num = (v: unknown) => Number(v ?? 0);
const normPrize = (p: any): PrizeRow => ({
  ...p,
  amount: num(p.amount),
  cost: p.cost == null ? null : num(p.cost),
  winner_percent: num(p.winner_percent),
  per_player: num(p.per_player),
  carryover_in: num(p.carryover_in),
  added_cash: num(p.added_cash),
});

export const listPrizes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ref.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context, data.kind, data.eventId);
    const { data: prizes, error } = await context.supabase
      .from("event_prizes")
      .select("*")
      .eq("event_kind", data.kind)
      .eq("event_id", data.eventId)
      .order("created_at");
    if (error) throw new Error("Couldn't load prizes.");
    const ids = (prizes ?? []).map((p: { id: string }) => p.id);
    const { data: recips } = ids.length
      ? await context.supabase.from("event_prize_recipients").select("*").in("prize_id", ids).order("created_at")
      : { data: [] };
    const scope = await scopeFor(context, data.kind, data.eventId);
    const balance = scope.kind === "league" && scope.id ? await fundBalance(context, scope.id) : null;
    let entrants = 0;
    if (data.kind === "tournament") {
      const { count } = await context.supabase
        .from("tournament_registrations")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", data.eventId)
        .neq("status", "withdrawn");
      entrants = count ?? 0;
    } else {
      const { count } = await context.supabase
        .from("league_event_checkins")
        .select("id", { count: "exact", head: true })
        .eq("league_event_id", data.eventId);
      entrants = count ?? 0;
    }
    return {
      prizes: ((prizes ?? []) as any[]).map(normPrize),
      recipients: ((recips ?? []) as any[]).map((r) => ({ ...r, amount: num(r.amount) })) as RecipientRow[],
      leagueAceBalance: balance,
      scope,
      entrants,
    };
  });

const prizeInput = z.object({
  id: z.string().uuid().optional(),
  kind,
  eventId: z.string().uuid(),
  award_type: z.enum(["ace_fund", "fifty_fifty", "ctp", "longest_putt", "longest_drive", "bonus", "bounty", "sponsor_prize", "raffle", "cash_prize", "merchandise_prize", "trophy", "custom"]),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  hole_number: z.coerce.number().int().min(1).max(99).nullable().optional(),
  division_eligibility: z.string().trim().max(120).nullable().optional(),
  sponsor_name: z.string().trim().max(120).nullable().optional(),
  value_kind: z.enum(["cash", "merchandise", "credit", "trophy", "other"]),
  amount: z.coerce.number().min(0).max(1_000_000),
  cost: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  payout_rule: z.enum(["winner_all", "split_equal", "percent", "carry_if_none", "custom"]),
  winner_percent: z.coerce.number().min(0).max(100).default(100),
  per_player: z.coerce.number().min(0).max(1000).default(0),
  contributors: z.coerce.number().int().min(0).max(10000).default(0),
  carryover_in: z.coerce.number().min(0).max(1_000_000).default(0),
  added_cash: z.coerce.number().min(0).max(1_000_000).default(0),
  round_to_5: z.boolean().default(false),
  remainder_action: z.enum(["carry_over", "ace_fund", "league_fund", "event_fund", "next_event", "another_prize", "undistributed"]).default("carry_over"),
  team_award: z.boolean().default(false),
  team_size: z.coerce.number().int().min(1).max(8).default(1),
  funding_source: z.enum(["entry_fees", "buy_in", "sponsor", "club", "added_cash", "donation", "carryover", "other"]).nullable().optional(),
  visibility: z.enum(["public", "staff"]).default("public"),
  status: z.enum(["planned", "available", "awarded", "paid", "carried_over", "cancelled"]).default("planned"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const savePrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => prizeInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context, data.kind, data.eventId);
    const { id, kind: k, eventId, ...rest } = data;
    if (id) {
      const { error } = await context.supabase.from("event_prizes").update(rest).eq("id", id).eq("event_id", eventId);
      if (error) throw new Error("Couldn't save this prize.");
      return { id };
    }
    const scope = await scopeFor(context, k, eventId);
    const row: any = { ...rest, event_kind: k, event_id: eventId, fund_scope_kind: scope.kind, fund_scope_id: scope.id };
    // A league Ace Fund opens with whatever the league carried forward.
    if (rest.award_type === "ace_fund" && scope.kind === "league" && scope.id && !rest.carryover_in)
      row.carryover_in = await fundBalance(context, scope.id);
    const { data: created, error } = await context.supabase.from("event_prizes").insert(row).select("id").single();
    if (error) throw new Error("Couldn't add this prize.");
    return { id: created.id as string };
  });

export const deletePrize = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("event_prize_recipients")
      .select("id", { count: "exact", head: true })
      .eq("prize_id", data.id);
    if (count) throw new Error("This prize already has a winner. Cancel it instead so the history stays.");
    const { error } = await context.supabase.from("event_prizes").delete().eq("id", data.id);
    if (error) throw new Error("Couldn't remove this prize.");
    return { ok: true };
  });

export const addPrizeRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        prizeId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
        name: z.string().trim().min(1).max(120),
        amount: z.coerce.number().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: prize } = await context.supabase.from("event_prizes").select("id, status").eq("id", data.prizeId).maybeSingle();
    if (!prize) throw new Error("Only this event's staff can award prizes.");
    let name = data.name;
    if (data.userId) {
      const { data: prof } = await context.supabase.from("profiles").select("display_name").eq("id", data.userId).maybeSingle();
      name = prof?.display_name ?? name;
    }
    const { error } = await context.supabase
      .from("event_prize_recipients")
      .insert({ prize_id: data.prizeId, user_id: data.userId, recipient_name: name, amount: data.amount });
    if (error) throw new Error("Couldn't record the winner.");
    if (["planned", "available"].includes(prize.status))
      await context.supabase.from("event_prizes").update({ status: "awarded" }).eq("id", data.prizeId);
    return { ok: true };
  });

export const voidPrizeRecipient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(2).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("event_prize_recipients")
      .update({ voided_at: new Date().toISOString(), voided_by: context.userId, void_reason: data.reason })
      .eq("id", data.id)
      .is("voided_at", null)
      .select("id")
      .maybeSingle();
    if (error || !row) throw new Error("Couldn't remove that winner.");
    return { ok: true };
  });

export const markRecipientPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, data: row } = await context.supabase
      .from("event_prize_recipients")
      .update({ paid: true })
      .eq("id", data.id)
      .is("voided_at", null)
      .select("prize_id")
      .maybeSingle();
    if (error || !row) throw new Error("Couldn't mark that as paid.");
    const { data: open } = await context.supabase
      .from("event_prize_recipients")
      .select("id")
      .eq("prize_id", row.prize_id)
      .is("voided_at", null)
      .eq("paid", false);
    if (!open?.length) await context.supabase.from("event_prizes").update({ status: "paid" }).eq("id", row.prize_id);
    return { ok: true };
  });

/**
 * Closes an Ace Fund for this event. With no ace the whole fund carries over;
 * league funds write a ledger (contributions, added cash, payouts) so the next
 * night opens with the right balance. Runs once per prize.
 */
export const closeAceFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prizeId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase.from("event_prizes").select("*").eq("id", data.prizeId).maybeSingle();
    if (!p) throw new Error("Only this event's staff can close the Ace Fund.");
    if (p.award_type !== "ace_fund") throw new Error("Only an Ace Fund can be closed this way.");
    const prize = normPrize(p);
    const { data: recips } = await context.supabase
      .from("event_prize_recipients")
      .select("amount")
      .eq("prize_id", prize.id)
      .is("voided_at", null);
    const paid = ((recips ?? []) as { amount: number }[]).reduce((s, r) => s + Number(r.amount), 0);
    const t = aceFundTotal(prize);
    if (prize.fund_scope_kind === "league" && prize.fund_scope_id) {
      const base = { scope_kind: "league", scope_id: prize.fund_scope_id, fund_type: "ace_fund", prize_id: prize.id };
      const rows = [
        { ...base, entry_kind: "contribution", amount: t.contributions, note: `${prize.contributors} × $${prize.per_player}` },
        { ...base, entry_kind: "added", amount: t.added, note: "Added cash" },
        { ...base, entry_kind: "payout", amount: -Math.round(paid * 100) / 100, note: paid ? "Ace payouts" : "No ace" },
      ];
      const { error } = await context.supabase.from("prize_fund_ledger").insert(rows);
      if (error) throw new Error("This Ace Fund was already closed.");
    }
    const carry = Math.round((t.total - paid) * 100) / 100;
    await context.supabase.from("event_prizes").update({ status: paid > 0 && carry <= 0 ? "paid" : "carried_over" }).eq("id", prize.id);
    return { carried: carry, paid };
  });

export const searchPrizePlayers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", `%${data.q.replace(/[%_]/g, "")}%`)
      .limit(8);
    return ((rows ?? []) as { id: string; display_name: string | null }[]).map((r) => ({ id: r.id, name: r.display_name ?? "Player" }));
  });

/** Public results: awarded, public prizes only, never internal cost. */
export const getPublicPrizeWinners = createServerFn({ method: "GET" })
  .inputValidator((d) => ref.parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: rows } = await sb.rpc("get_public_prize_winners", { _kind: data.kind, _event: data.eventId });
    return ((rows ?? []) as any[]).map((r) => ({ ...r, amount: Number(r.amount ?? 0) })) as {
      prize_id: string;
      award_type: string;
      name: string;
      hole_number: number | null;
      sponsor_name: string | null;
      value_kind: string;
      recipient_name: string;
      user_id: string | null;
      amount: number;
    }[];
  });
