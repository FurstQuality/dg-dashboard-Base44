import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ExternalLink } from "lucide-react";
import {
  TIER_PROFILES,
  buildEventPlaybook,
  payoutStyleLabel,
  tierProfile,
  type TierProfile,
} from "@/lib/sanctioning-plan";
import { EventPlaybook } from "./event-playbook";
import { Field, OptionRow, StepIntro } from "./controls";

export type SanctionConfirmations = {
  approvalConfirmed: boolean;
  officialsConfirmed: boolean;
  insuranceConfirmed: boolean;
};

/**
 * Step 3 of the tournament wizard. The answer here shapes every later step:
 * a sanctioned event inherits its tier's requirements for rounds, sign-up,
 * payout style, staffing and reporting, while an unsanctioned event gets
 * relaxed guidance and quirk ideas.
 */
export function SanctioningStep({
  kind = "tournament",
  sanctioned,
  tier,
  eventNumber,
  confirmations,
  rounds,
  hasEntryFee,
  onSanctionedChange,
  onTierChange,
  onEventNumberChange,
  onConfirmationsChange,
}: {
  kind?: "tournament" | "league";
  sanctioned: boolean;
  tier: string;
  eventNumber: string;
  confirmations: SanctionConfirmations;
  rounds: number;
  hasEntryFee: boolean;
  onSanctionedChange: (v: boolean) => void;
  onTierChange: (v: string) => void;
  onEventNumberChange: (v: string) => void;
  onConfirmationsChange: (next: SanctionConfirmations) => void;
}) {
  const profile = sanctioned ? tierProfile(tier) : null;
  const sections = buildEventPlaybook({ sanctioned, tier, rounds, hasEntryFee });
  const isLeague = kind === "league";
  const noun = isLeague ? "league" : "event";
  const tiers = TIER_PROFILES.filter((t) =>
    isLeague ? ["L", "XC", "C"].includes(t.code) : t.code !== "L",
  );
  const setConfirm = (patch: Partial<SanctionConfirmations>) =>
    onConfirmationsChange({ ...confirmations, ...patch });

  return (
    <div className="space-y-6">
      <StepIntro
        title={`Is this a PDGA sanctioned ${noun}?`}
        blurb={
          isLeague
            ? "Sanctioned league nights are rated and reported week by week. This answer sets the rules for the rest of the setup."
            : "This answer sets the rules for the rest of the setup — rounds, sign-up, divisions, payout, and reporting all follow from it."
        }
      />

      <div className="grid gap-2 sm:grid-cols-2">
        <OptionRow
          selected={sanctioned}
          onSelect={() => onSanctionedChange(true)}
          label="PDGA sanctioned"
          blurb={
            isLeague
              ? "Every night is rated and reported, and the tier's requirements apply."
              : "Rounds are rated, results are reported, and the tier's requirements apply."
          }
        />
        <OptionRow
          selected={!sanctioned}
          onSelect={() => onSanctionedChange(false)}
          label="Unsanctioned / for fun"
          blurb={
            isLeague
              ? "Your rules. Handicaps, mulligans, side games, and weekly quirks all welcome."
              : "Your rules. Mulligans, challenge holes, and side games all welcome."
          }
        />
      </div>

      {sanctioned ? (
        <>
          <Field label="Tier" hint="Each tier sets its own minimums for the rest of this setup.">
            <div className="grid gap-2 sm:grid-cols-2">
              {tiers.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => onTierChange(t.code)}
                  aria-pressed={tier === t.code}
                  className={`rounded-xl border px-3 py-2.5 text-left transition ${
                    tier === t.code
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">{t.label}</span>
                    <span className="text-[11px] text-muted-foreground">
                      ${(t.playerFeeCents / 100).toFixed(2)}/player
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{t.blurb}</p>
                </button>
              ))}
            </div>
          </Field>

          {profile ? <TierRequirements profile={profile} isLeague={isLeague} /> : null}

          <Field
            label="PDGA event number *"
            hint={
              isLeague
                ? "Assigned when the PDGA approves your league sanctioning request."
                : "Assigned when the PDGA approves your sanctioning request."
            }
          >
            <Input
              value={eventNumber}
              onChange={(e) => onEventNumberChange(e.target.value)}
              placeholder="e.g. 76234"
            />
          </Field>

          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="text-[14px] font-semibold">Before you publish</div>
            <ConfirmRow
              label="Sanctioning is approved in PDGA Tour Manager"
              checked={confirmations.approvalConfirmed}
              onChange={(v) => setConfirm({ approvalConfirmed: v })}
            />
            {profile && profile.officialsRequired > 0 ? (
              <ConfirmRow
                label={`${profile.officialsRequired} certified official${profile.officialsRequired > 1 ? "s" : ""} booked for the event`}
                checked={confirmations.officialsConfirmed}
                onChange={(v) => setConfirm({ officialsConfirmed: v })}
              />
            ) : null}
            {profile?.insuranceRequired ? (
              <ConfirmRow
                label="Event insurance is purchased and the COI is on file"
                checked={confirmations.insuranceConfirmed}
                onChange={(v) => setConfirm({ insuranceConfirmed: v })}
              />
            ) : null}
            <a
              href="https://www.pdga.com/tour/tds"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
            >
              PDGA Competition Manual and TD resources
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
          {isLeague
            ? "Unsanctioned leagues skip PDGA reporting and per-player fees. Nights won't be rated, so you're free to set your own formats, handicaps, and prizes."
            : "Unsanctioned events skip PDGA reporting and sanctioning fees. Rounds won't be rated, and you can set your own rules, formats, and prizes."}{" "}
          The guide below has ideas worth stealing.
        </div>
      )}

      <div>
        <div className="mb-2 text-[14px] font-semibold">
          {sanctioned
            ? `Run-the-${noun} requirements`
            : `Run-the-${noun} guide`}
        </div>
        <EventPlaybook sections={sections} />
      </div>
    </div>
  );
}

function TierRequirements({
  profile,
  isLeague,
}: {
  profile: TierProfile;
  isLeague: boolean;
}) {
  const rows: { label: string; value: string }[] = [
    {
      label: isLeague ? "Play per night" : "Rounds",
      value: isLeague
        ? `${profile.minHoles} holes minimum`
        : `${profile.minRounds} minimum · ${profile.minHoles} holes total`,
    },
    {
      label: "Sign-up",
      value: profile.preRegistrationRequired
        ? "Pre-registration required"
        : "Pre-registration or walk-ups",
    },
    {
      label: "Officials",
      value:
        profile.officialsRequired > 0
          ? `${profile.officialsRequired} certified on site${profile.certifiedTdRequired ? " · certified TD" : ""}`
          : "None required",
    },
    { label: "Payout", value: payoutStyleLabel(profile.payoutStyle) },
    { label: "Sanctioning fee", value: `$${(profile.playerFeeCents / 100).toFixed(2)} per player` },
    { label: "Reporting", value: `Results within ${profile.reportingDays} days` },
  ];

  return (
    <div className="grid gap-x-6 gap-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-2">
      <div className="sm:col-span-2 text-[14px] font-semibold">
        What {profile.label} requires of you
      </div>
      {rows.map((r) => (
        <div key={r.label} className="text-[13px]">
          <span className="text-muted-foreground">{r.label}: </span>
          <span className="font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function ConfirmRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 text-[13px]">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span className="mt-0.5 min-w-0 flex-1">{label}</span>
    </label>
  );
}
