import { AlertTriangle, Scale } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  HANDICAP_BASIS_OPTIONS,
  HANDICAP_TARGET_OPTIONS,
  buildHandicapTable,
  handicapWarnings,
  summarizeHandicap,
  type HandicapConfig,
  type HandicapPlayer,
} from "@/lib/handicap";
import { Field, OptionRow } from "./controls";

/** A representative field so the director sees the strokes before publishing. */
const SAMPLE_FIELD: HandicapPlayer[] = [
  { user_id: "s1", name: "Open contender", pdga_rating: 985, rated_rounds: 14 },
  { user_id: "s2", name: "Advanced regular", pdga_rating: 930, rated_rounds: 11 },
  { user_id: "s3", name: "Intermediate player", pdga_rating: 875, rated_rounds: 8 },
  { user_id: "s4", name: "Recreational player", pdga_rating: 810, rated_rounds: 5 },
  { user_id: "s5", name: "First season", dgd_rating: 745, rated_rounds: 2 },
];

export function HandicapField({
  value,
  onChange,
  ssa,
}: {
  value: HandicapConfig;
  onChange: (next: HandicapConfig) => void;
  /** Layout SSA, when known — it sets how many rating points one throw is worth. */
  ssa?: number | null;
}) {
  const set = (patch: Partial<HandicapConfig>) => onChange({ ...value, ...patch });
  const preview = buildHandicapTable(SAMPLE_FIELD, value, ssa);
  const warnings = handicapWarnings(value);

  return (
    <div className="space-y-5 rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-start gap-2">
        <Scale className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">Handicap settings</div>
          <p className="text-[13px] text-muted-foreground">
            Strokes come straight from player ratings, so every number is checkable. {summarizeHandicap(value)}
          </p>
        </div>
      </div>

      <Field label="What the handicap is based on">
        <div className="grid gap-2 sm:grid-cols-3">
          {HANDICAP_BASIS_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={value.basis === o.value}
              onSelect={() => set({ basis: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      <Field label="Who the field is levelled up to">
        <div className="grid gap-2 sm:grid-cols-3">
          {HANDICAP_TARGET_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={value.target === o.value}
              onSelect={() => set({ target: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {value.target === "fixed" ? (
          <Field label="Target rating" hint="Everyone is levelled to this rating all season.">
            <Input
              type="number"
              min={700}
              max={1100}
              value={value.target_rating}
              onChange={(e) => set({ target_rating: Number(e.target.value) || 0 })}
            />
          </Field>
        ) : null}

        <Field
          label={`Allowance — ${value.allowance_pct}% of the rating gap`}
          hint="80% keeps the field close while still rewarding the player who beats their own rating."
        >
          <Slider
            min={40}
            max={100}
            step={5}
            value={[value.allowance_pct]}
            onValueChange={([v]) => set({ allowance_pct: v ?? 80 })}
          />
        </Field>

        <Field label="Stroke cap" hint="Most strokes any one player can receive.">
          <Input
            type="number"
            min={1}
            max={30}
            value={value.max_strokes}
            onChange={(e) => set({ max_strokes: Number(e.target.value) || 1 })}
          />
        </Field>

        <Field
          label="Rated rounds before a handicap is final"
          hint="Until then the number shows as provisional so the field knows it is still settling."
        >
          <Input
            type="number"
            min={1}
            max={12}
            value={value.min_rounds}
            onChange={(e) => set({ min_rounds: Number(e.target.value) || 1 })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Label>Example strokes on this layout</Label>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Player</th>
                <th className="px-3 py-2 text-right font-medium">Rating</th>
                <th className="px-3 py-2 text-right font-medium">Strokes</th>
                <th className="px-3 py-2 text-left font-medium">Why</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rating ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">+{r.strokes}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-muted-foreground">
          One throw is worth {preview.pointsPerThrow} rating points on this layout
          {preview.targetRating ? `, levelled to ${preview.targetRating}` : ""}.
        </p>
      </div>

      {warnings.length > 0 ? (
        <ul className="space-y-1.5">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
