import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { feesFromEventRow, payoutSchedule, remainderLabel, type EventFees } from "@/lib/event-fees";
import { PDGA_RULESET } from "@/lib/payout-compliance";
import type { PayoutSchedule } from "@/lib/payout-engine";

export type DivisionFinance = {
  division_id: string | null;
  label: string;
  players: number;
  entry_fee_cents: number;
  schedule: PayoutSchedule | null;
  snapshot: PayoutSnapshotRow | null;
  history: PayoutSnapshotRow[];
};

export type PayoutSnapshotRow = {
  id: string;
  division_id: string | null;
  division_label: string;
  snapshot: PayoutSchedule & { field_size: number; entry_fee_cents: number; remainder_destination: string };
  curve_version: string;
  ruleset_version: string | null;
  total_paid_cents: number;
  remainder_cents: number;
  remainder_destination: string | null;
  finalized_at: string;
  superseded_at: string | null;
  superseded_reason: string | null;
};

export type EventFinance = {
  event_id: string;
  name: string;
  sanctioned: boolean;
  tier: string | null;
  fees: EventFees;
  remainder_label: string;
  divisions: DivisionFinance[];
};

const ACTIVE = ["pending", "confirmed", "checked_in"];

type Sb = any;

async function loadFinance(supabase: Sb, eventId: string): Promise<EventFinance> {
  const { data: ev, error } = await supabase
    .from("tournaments")
    .select("id, name, setup, entry_fee_cents, ace_pot_cents, ctp_cents, payout_notes, pdga_sanctioned, pdga_tier")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !ev) throw new Error("We couldn't find that event.");
  const [{ data: divs }, { data: regs }, { data: snaps }] = await Promise.all([
    supabase.from("tournament_divisions").select("id, name, code, entry_fee_cents, sort_order").eq("tournament_id", eventId).order("sort_order"),
    supabase.from("tournament_registrations").select("division_id, status").eq("tournament_id", eventId),
    supabase.from("payout_snapshots").select("*").eq("event_id", eventId).order("finalized_at", { ascending: false }),
  ]);
  const fees = feesFromEventRow(ev as never, "tournament");
  const counts = new Map<string | null, number>();
  for (const r of regs ?? []) if (ACTIVE.includes(r.status)) counts.set(r.division_id ?? null, (counts.get(r.division_id ?? null) ?? 0) + 1);
  const list: { id: string | null; label: string; fee: number }[] = (divs ?? []).map((d: any) => ({
    id: d.id,
    label: d.code ? `${d.code} · ${d.name}` : d.name,
    fee: d.entry_fee_cents ?? fees.entry_fee_cents,
  }));
  if (!list.length || counts.has(null)) list.push({ id: null, label: list.length ? "No division" : "Open", fee: fees.entry_fee_cents });
  const all = (snaps ?? []) as PayoutSnapshotRow[];
  return {
    event_id: ev.id,
    name: ev.name,
    sanctioned: !!ev.pdga_sanctioned,
    tier: ev.pdga_tier ?? null,
    fees,
    remainder_label: remainderLabel(fees.payout.remainder_destination),
    divisions: list.map((d) => {
      const players = counts.get(d.id) ?? 0;
      const schedule = players > 0 ? payoutSchedule({ ...fees, entry_fee_cents: d.fee, typical_field_size: players }) : null;
      const mine = all.filter((s) => (s.division_id ?? null) === d.id);
      return {
        division_id: d.id,
        label: d.label,
        players,
        entry_fee_cents: d.fee,
        schedule,
        snapshot: mine.find((s) => !s.superseded_at) ?? null,
        history: mine.filter((s) => s.superseded_at),
      };
    }),
  };
}

export const getEventFinance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("event_has_capability", { _kind: "tournament", _event: data.eventId, _user: context.userId, _cap: "event.manage_finance" });
    if (!ok) throw new Error("Only this event's finance team can see its finances.");
    return loadFinance(context.supabase, data.eventId);
  });

/** Locks one division's payout. The server recomputes it — the browser never sends amounts. */
export const finalizeDivisionPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid(), divisionId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const fin = await loadFinance(context.supabase, data.eventId);
    const div = fin.divisions.find((d) => d.division_id === data.divisionId);
    if (!div?.schedule) throw new Error("There's no payout to lock for this division yet.");
    if (div.snapshot) throw new Error("This payout is already locked. Reopen it first to change it.");
    const dest = fin.fees.payout.remainder_destination ?? "first";
    const { error } = await context.supabase.from("payout_snapshots").insert({
      event_kind: "tournament",
      event_id: data.eventId,
      division_id: data.divisionId,
      division_label: div.label,
      snapshot: { ...div.schedule, field_size: div.players, entry_fee_cents: div.entry_fee_cents, remainder_destination: dest, plan: fin.fees.payout } as never,
      curve_version: div.schedule.curve_version,
      ruleset_version: fin.sanctioned ? PDGA_RULESET.version : null,
      total_paid_cents: div.schedule.total_paid_cents,
      remainder_cents: div.schedule.remainder_cents,
      remainder_destination: dest,
      finalized_by: context.userId,
    });
    if (error) throw new Error(error.code === "42501" ? "Only this event's directors can lock payouts." : "Couldn't lock the payout. Try again.");
    return { ok: true };
  });

export const reopenDivisionPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("reopen_payout_snapshot", { _id: data.id, _reason: data.reason });
    if (error) throw new Error(error.message.includes("reason") || error.message.includes("directors") ? error.message : "Couldn't reopen this payout.");
    return { ok: true };
  });

// ---------- PDGA curve sets (admin installs, everyone reads published) ----------

export const curveSchema = z.object({
  key: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(60),
  division_type: z.enum(["pro", "am"]),
  b: z.number().min(-3).max(0),
});
export type CurveDef = z.infer<typeof curveSchema>;
export type CurveSet = { id: string; version: string; source: string; label: string; curves: CurveDef[]; status: string; notes: string | null; published_at: string | null; created_at: string };

export const listCurveSets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CurveSet[]> => {
    const { data, error } = await context.supabase.from("payout_curve_sets").select("*").order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load curve sets.");
    return (data ?? []) as unknown as CurveSet[];
  });

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Only admins can manage payout curves.");
}

export const createCurveSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      version: z.string().trim().min(3).max(40).regex(/^[a-z0-9@._-]+$/),
      label: z.string().trim().min(3).max(80),
      source: z.string().trim().min(2).max(40),
      notes: z.string().max(500).optional(),
      curves: z.array(curveSchema).min(1).max(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const keys = new Set(data.curves.map((c) => c.key));
    if (keys.size !== data.curves.length) throw new Error("Each curve needs its own key.");
    const { error } = await context.supabase.from("payout_curve_sets").insert({ ...data, curves: data.curves as never, created_by: context.userId });
    if (error) throw new Error(error.code === "23505" ? "That version already exists. Use a new version name." : "Couldn't save the curve set.");
    return { ok: true };
  });

export const setCurveSetStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["published", "retired"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("payout_curve_sets").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message.includes("cannot") || error.message.includes("stay") ? error.message : "Couldn't update the curve set.");
    return { ok: true };
  });
