import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, OptionRow, Segmented, StepIntro, YesNo } from "@/components/event-setup/controls";
import { FeeBreakdown } from "@/components/event-setup/fee-breakdown";
import { DEFAULT_PAYOUT_CURVE, PAYOUT_CURVES, type PayoutCurve } from "@/lib/payout-engine";
import { PayoutFieldTable } from "@/components/event-setup/payout-field-table";
import {
  FEE_DESTINATION_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  PAYOUT_KIND_OPTIONS,
  PAYOUT_STYLE_OPTIONS,
  newFeeLine,
  REMAINDER_OPTIONS,
  type RemainderDestination,
  type EventFees,
  type FeeDestination,
  type FeeLine,
} from "@/lib/event-fees";

/**
 * Money step for both wizards: entry, every dollar carved out of it or added on
 * top, and the payout promise players see before they sign up.
 */
export function FeesStep({
  value,
  onChange,
  unit = "night",
}: {
  value: EventFees;
  onChange: (next: EventFees) => void;
  unit?: string;
}) {
  const set = (patch: Partial<EventFees>) => onChange({ ...value, ...patch });
  const setPayout = (patch: Partial<EventFees["payout"]>) =>
    onChange({ ...value, payout: { ...value.payout, ...patch } });
  const setLine = (key: string, patch: Partial<FeeLine>) =>
    set({ lines: value.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  return (
    <div className="space-y-6">
      <StepIntro
        title="Fees and payouts"
        blurb={`Spell out what a player pays each ${unit}, what each dollar funds, and what they take home if they win.`}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Entry per ${unit}`} hint="The headline number players budget for.">
          <Input
            type="number"
            min="0"
            step="1"
            value={value.entry_fee_cents / 100}
            onChange={(e) =>
              set({ entry_fee_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
            }
          />
        </Field>
        <Field label="Typical field size" hint="Used to preview the pool — not a sign-up cap.">
          <Input
            type="number"
            min="1"
            step="1"
            value={value.typical_field_size}
            onChange={(e) =>
              set({ typical_field_size: Math.max(1, Math.round(Number(e.target.value) || 1)) })
            }
          />
        </Field>
      </div>

      <Field
        label="Where the money goes"
        hint="Add a line for every pot, fund, or fee. Mark whether it comes out of the entry or is collected on top of it."
      >
        <div className="space-y-2">
          {value.lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-[13px] text-muted-foreground">
              Nothing carved out yet — every dollar of the entry goes back to players.
            </p>
          ) : null}
          {value.lines.map((line) => (
            <div key={line.key} className="space-y-2 rounded-xl border border-border bg-card p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                <Input
                  value={line.label}
                  onChange={(e) => setLine(line.key, { label: e.target.value })}
                  placeholder="Ace pot"
                  aria-label="Fee name"
                />
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={line.amount_cents / 100}
                  onChange={(e) =>
                    setLine(line.key, {
                      amount_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                    })
                  }
                  aria-label="Amount in dollars"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${line.label}`}
                  onClick={() => set({ lines: value.lines.filter((l) => l.key !== line.key) })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
                  value={line.destination}
                  aria-label="What this funds"
                  onChange={(e) =>
                    setLine(line.key, { destination: e.target.value as FeeDestination })
                  }
                >
                  {FEE_DESTINATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Segmented<"from_entry" | "add_on">
                  value={line.source}
                  options={[
                    { value: "from_entry", label: "Out of entry" },
                    { value: "add_on", label: "Added on top" },
                  ]}
                  onChange={(v) => setLine(line.key, { source: v })}
                />
                {line.source === "add_on" ? (
                  <Segmented<"required" | "optional">
                    value={line.required ? "required" : "optional"}
                    options={[
                      { value: "required", label: "Everyone pays" },
                      { value: "optional", label: "Optional" },
                    ]}
                    onChange={(v) => setLine(line.key, { required: v === "required" })}
                  />
                ) : null}
              </div>
              <Input
                value={line.note}
                onChange={(e) => setLine(line.key, { note: e.target.value })}
                placeholder="What players should know about this one"
                aria-label="Note"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(["ace_pot", "ctp", "club_fund", "series", "course", "other"] as FeeDestination[]).map(
              (d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set({ lines: [...value.lines, newFeeLine(d)] })}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {FEE_DESTINATION_OPTIONS.find((o) => o.value === d)?.label}
                </Button>
              ),
            )}
          </div>
        </div>
      </Field>

      <Field label="How the payout works" hint="Players want to know who cashes before they enter.">
        <div className="space-y-2">
          {PAYOUT_STYLE_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={value.payout.style === o.value}
              onSelect={() => setPayout({ style: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      {value.payout.style !== "none" ? (
        <Field
          label="Players per entry"
          hint="Doubles and team payouts are shown per team and per player."
        >
          <Segmented<number>
            value={value.payout.team_size ?? 1}
            options={[
              { value: 1, label: "Singles" },
              { value: 2, label: "Doubles" },
              { value: 3, label: "Teams of 3" },
              { value: 4, label: "Teams of 4" },
            ]}
            onChange={(v) => setPayout({ team_size: v })}
          />
        </Field>
      ) : null}

      {value.payout.style !== "none" && value.payout.style !== "custom" && value.payout.style !== "flat_per_player" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Minimum payout per player (USD)"
            hint="From $1. $5 is the usual choice. Fewer places get paid so nobody cashes less than this."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<number>
                value={value.payout.min_payout_cents ?? 500}
                options={[100, 500, 1000, 2000].map((c) => ({ value: c, label: `$${c / 100}` }))}
                onChange={(v) => setPayout({ min_payout_cents: v })}
              />
              <Input
                type="number"
                min="1"
                step="1"
                className="w-24"
                aria-label="Custom minimum payout per player (USD)"
                value={(value.payout.min_payout_cents ?? 500) / 100}
                onChange={(e) =>
                  setPayout({ min_payout_cents: Math.max(1, Math.round(Number(e.target.value) || 0)) * 100 })
                }
              />
            </div>
          </Field>
          <Field label="Payout curve" hint="PDGA curves. Steeper sends more to the top places.">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.payout.curve ?? DEFAULT_PAYOUT_CURVE}
              onChange={(e) => setPayout({ curve: e.target.value as PayoutCurve })}
            >
              {PAYOUT_CURVES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Leftover money goes to" hint="Money that can't be split into clean payouts.">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.payout.remainder_destination ?? "first"}
              onChange={(e) => setPayout({ remainder_destination: e.target.value as RemainderDestination })}
            >
              {REMAINDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Round each payout to" hint="Per player, so the cash splits cleanly.">
            <Segmented<number>
              value={value.payout.round_to_cents ?? 500}
              options={[
                { value: 100, label: "$1" },
                { value: 500, label: "$5" },
                { value: 1000, label: "$10" },
                { value: 0, label: "Exact" },
              ]}
              onChange={(v) => setPayout({ round_to_cents: v })}
            />
            <p className="mt-1 text-[13px] text-muted-foreground">Player value protection is always on: rounding never reduces a payout once it's locked.</p>
          </Field>
        </div>
      ) : null}

      {value.payout.style === "top_percent" ? (
        <Field label="Share of the field paid" hint="40% is the common league split.">
          <Input
            type="number"
            min="1"
            max="100"
            step="1"
            value={value.payout.paid_percent}
            onChange={(e) =>
              setPayout({ paid_percent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })
            }
          />
        </Field>
      ) : null}

      {value.payout.style === "top_count" ? (
        <Field label="Places paid per division">
          <Input
            type="number"
            min="1"
            step="1"
            value={value.payout.paid_count}
            onChange={(e) => setPayout({ paid_count: Math.max(1, Number(e.target.value) || 1) })}
          />
        </Field>
      ) : null}

      {value.payout.style === "flat_per_player" ? (
        <Field label="Payout per cashing player (USD)">
          <Input
            type="number"
            min="0"
            step="1"
            value={value.payout.flat_amount_cents / 100}
            onChange={(e) =>
              setPayout({ flat_amount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
            }
          />
        </Field>
      ) : null}

      {value.payout.style !== "none" ? (
        <Field label="Paid out in">
          <Segmented
            value={value.payout.kind}
            options={PAYOUT_KIND_OPTIONS}
            onChange={(v) => setPayout({ kind: v })}
          />
        </Field>
      ) : null}

      <Field
        label="Unclaimed ace pot rolls over"
        hint="Off means the pot is split or donated at the end of the event."
      >
        <YesNo
          value={value.payout.rollover_unclaimed}
          onChange={(v) => setPayout({ rollover_unclaimed: v })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Club member discount (USD)" hint="Leave at 0 if everyone pays the same.">
          <Input
            type="number"
            min="0"
            step="1"
            value={value.member_discount_cents / 100}
            onChange={(e) =>
              set({ member_discount_cents: Math.round(parseFloat(e.target.value || "0") * 100) })
            }
          />
        </Field>
        <Field label="Ways to pay">
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_METHOD_OPTIONS.map((m) => {
              const on = value.payment_methods.includes(m);
              return (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={on ? "default" : "outline"}
                  className="h-8 rounded-full px-3 text-[13px]"
                  onClick={() =>
                    set({
                      payment_methods: on
                        ? value.payment_methods.filter((x) => x !== m)
                        : [...value.payment_methods, m],
                    })
                  }
                >
                  {m}
                </Button>
              );
            })}
          </div>
        </Field>
      </div>

      <Field label="Refund and no-show policy">
        <Textarea
          rows={2}
          value={value.refund_policy}
          onChange={(e) => set({ refund_policy: e.target.value })}
        />
      </Field>

      <Field label="Anything else about the money" hint="Season-end payout, added cash, sponsors.">
        <Textarea rows={2} value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </Field>

      <div>
        <div className="mb-2 text-[14px] font-semibold">What players will see</div>
        <FeeBreakdown fees={value} unit={unit} />
      </div>

      {value.payout.style !== "none" && value.payout.style !== "custom" ? (
        <PayoutFieldTable fees={value} />
      ) : null}
    </div>
  );
}
