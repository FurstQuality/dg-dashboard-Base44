import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIER_PROFILES, tierProfile } from "@/lib/sanctioning-plan";
import type { OpenPlan } from "@/lib/open-td-plan";
import { SectionCard } from "./section-card";

interface Props {
  plan: OpenPlan;
  canEdit: boolean;
  update: (patch: Partial<OpenPlan>) => void;
}

export function PlanBasics({ plan, canEdit, update }: Props) {
  const tier = plan.sanctioned && plan.tier ? tierProfile(plan.tier) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard
        title="Event basics"
        blurb="These answers shape the checklist, the running order, and the payout math."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Event name" className="sm:col-span-2">
            <Input
              value={plan.title}
              disabled={!canEdit}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Saturday singles at Lemon Lake"
            />
          </Field>
          <Field label="Type">
            <Select
              value={plan.kind}
              disabled={!canEdit}
              onValueChange={(v) => update({ kind: v as OpenPlan["kind"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tournament">One-day tournament</SelectItem>
                <SelectItem value="league">League night</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={plan.date}
              disabled={!canEdit}
              onChange={(e) => update({ date: e.target.value })}
            />
          </Field>
          <Field label="First tee time">
            <Input
              type="time"
              value={plan.startTime}
              disabled={!canEdit}
              onChange={(e) => update({ startTime: e.target.value })}
            />
          </Field>
          <Field label="Rounds">
            <Select
              value={String(plan.rounds)}
              disabled={!canEdit}
              onValueChange={(v) => update({ rounds: Number(v) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} round{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Course">
            <Input
              value={plan.courseName}
              disabled={!canEdit}
              onChange={(e) => update({ courseName: e.target.value })}
              placeholder="Lemon Lake — Red"
            />
          </Field>
          <Field label="Layout">
            <Input
              value={plan.layoutName}
              disabled={!canEdit}
              onChange={(e) => update({ layoutName: e.target.value })}
              placeholder="Blue tees, long pins"
            />
          </Field>
          <Field label="Holes per round">
            <Input
              type="number"
              min={1}
              max={90}
              value={plan.holes}
              disabled={!canEdit}
              onChange={(e) => update({ holes: Math.max(1, Number(e.target.value) || 18) })}
            />
          </Field>
          <Field label="City / meeting spot">
            <Input
              value={plan.location}
              disabled={!canEdit}
              onChange={(e) => update({ location: e.target.value })}
              placeholder="Crown Point, IN — shelter by hole 1"
            />
          </Field>
        </div>
      </SectionCard>

      <div className="grid gap-4">
        <SectionCard
          title="Sanctioning"
          blurb="Turn this on for a PDGA-sanctioned event and the checklist adds that tier's obligations."
        >
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
            <div>
              <div className="text-sm font-medium">PDGA sanctioned</div>
              <p className="text-xs text-muted-foreground">
                Off means a club or casual event with friendly guidance instead.
              </p>
            </div>
            <Switch
              checked={plan.sanctioned}
              disabled={!canEdit}
              onCheckedChange={(v) => update({ sanctioned: v })}
            />
          </div>
          {plan.sanctioned ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Tier">
                <Select
                  value={plan.tier || ""}
                  disabled={!canEdit}
                  onValueChange={(v) => update({ tier: v as OpenPlan["tier"] })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIER_PROFILES.map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="PDGA event number">
                <Input
                  value={plan.pdgaEventNumber}
                  disabled={!canEdit}
                  onChange={(e) => update({ pdgaEventNumber: e.target.value })}
                  placeholder="Optional until approved"
                />
              </Field>
            </div>
          ) : null}
          {tier ? (
            <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">
              <li>
                {tier.minRounds} round minimum · {tier.minHoles} holes of competition
              </li>
              <li>
                {tier.officialsRequired
                  ? `${tier.officialsRequired} certified official${tier.officialsRequired > 1 ? "s" : ""} on site`
                  : "No certified official required"}
                {tier.insuranceRequired ? " · insurance on file" : ""}
              </li>
              <li>
                Report results within {tier.reportingDays} days · $
                {(tier.playerFeeCents / 100).toFixed(2)} per player in fees
              </li>
            </ul>
          ) : null}
        </SectionCard>

        <SectionCard title="Who to call" blurb="Printed on the player list and shared with helpers.">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Director">
              <Input
                value={plan.tdName}
                disabled={!canEdit}
                onChange={(e) => update({ tdName: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                value={plan.tdEmail}
                disabled={!canEdit}
                onChange={(e) => update({ tdEmail: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={plan.tdPhone}
                disabled={!canEdit}
                onChange={(e) => update({ tdPhone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Notes for helpers" className="mt-3">
            <Textarea
              rows={4}
              value={plan.notes}
              disabled={!canEdit}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Parking, restrooms, who brings the CTP discs, weather backup plan…"
            />
          </Field>
        </SectionCard>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
