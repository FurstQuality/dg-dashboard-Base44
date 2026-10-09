import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeftRight, Save } from "lucide-react";
import { updateTournament, convertTournamentToLeague } from "@/lib/tournaments.functions";
import { updateLeague, convertLeagueToTournament } from "@/lib/leagues.functions";
import { FeesStep } from "@/components/event-setup/fees-step";
import { feesFromEventRow, feesToColumns, type EventFees } from "@/lib/event-fees";
import { EventCoverPicker } from "@/components/event-cover-picker";
import { HostClubPicker } from "@/components/host-club-picker";

/** Merge an edited money plan into the event's stored setup jsonb. */
function withFees(row: Record<string, unknown>, fees: EventFees): Record<string, unknown> {
  const setup = row.setup && typeof row.setup === "object" ? (row.setup as Record<string, unknown>) : {};
  return { ...setup, fees };
}

type TournamentRow = Record<string, unknown> & { id: string; name: string; event_type?: string };
type LeagueRow = Record<string, unknown> & { id: string; name: string; event_type?: string };

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export function TournamentManageForm({
  tournament,
  onSaved,
}: {
  tournament: TournamentRow;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({
    name: tournament.name ?? "",
    description: tournament.description ?? "",
    format: tournament.format ?? "stroke_play",
    status: tournament.status ?? "draft",
    start_date: tournament.start_date ?? "",
    end_date: tournament.end_date ?? "",
    location: tournament.location ?? "",
    governing_ruleset: (tournament.governing_ruleset as string | undefined) ?? (tournament.pdga_sanctioned ? "pdga" : "custom"),
    pdga_tier: tournament.pdga_tier ?? "",
    pdga_event_number: tournament.pdga_event_number ?? "",
    players_pack_cents: tournament.players_pack_cents ?? 0,
    max_players: tournament.max_players ?? "",
    players_per_card: tournament.players_per_card ?? "",
    td_name: tournament.td_name ?? "",
    td_email: tournament.td_email ?? "",
    td_phone: tournament.td_phone ?? "",
    website_url: tournament.website_url ?? "",
    registration_url: tournament.registration_url ?? "",
    rules_url: tournament.rules_url ?? "",
    cover_url: tournament.cover_url ?? "",
    club_id: (tournament.club_id as string | null) ?? null,
  });
  const [fees, setFees] = useState<EventFees>(() => {
    const f = feesFromEventRow(tournament as Parameters<typeof feesFromEventRow>[0], "tournament");
    // Doubles events pay per team unless the director already chose otherwise.
    if (tournament.format === "doubles" && (f.payout.team_size ?? 1) === 1) f.payout.team_size = 2;
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const save = useServerFn(updateTournament);
  const convert = useServerFn(convertTournamentToLeague);
  const navigate = useNavigate();

  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { ...form };
      // Coerce empty strings to null for numeric fields
      ["max_players", "players_per_card"].forEach((k) => {
        if (patch[k] === "" || patch[k] == null) patch[k] = null;
      });
      patch.entry_fee_cents = feesToColumns(fees, "event").entry_fee_cents;
      patch.refund_policy = fees.refund_policy || null;
      patch.setup = withFees(tournament, fees);
      await save({ data: { id: tournament.id, patch } });
      toast.success("Tournament saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onConvert() {
    if (
      !confirm(
        "Convert this tournament to a weekly league? Divisions will be copied and the original tournament will be cancelled.",
      )
    )
      return;
    setConverting(true);
    try {
      const res = await convert({ data: { id: tournament.id } });
      toast.success("Converted to league");
      navigate({ to: "/leagues/$slug", params: { slug: res.slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="text-sm">
          <div className="font-medium">Event type: Tournament</div>
          <div className="text-xs text-muted-foreground">
            Multi-day, one-time competition. Convert to a league for weekly recurring play.
          </div>
        </div>
        <Button variant="outline" onClick={onConvert} disabled={converting}>
          <ArrowLeftRight className="mr-1 h-4 w-4" />{" "}
          {converting ? "Converting…" : "Convert to league"}
        </Button>
      </div>

      <Section title="Identity">
        <Field label="Event name" wide>
          <Input value={form.name as string} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Hosting club" wide>
          <HostClubPicker value={(form.club_id as string | null) ?? null} onChange={(id) => set("club_id", id)} />
        </Field>
        <Field label="Description" wide>
          <Textarea
            rows={3}
            value={form.description as string}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <EventCoverPicker
            value={(form.cover_url as string) ?? ""}
            onChange={(url: string) => set("cover_url", url)}
          />
        </div>
      </Section>

      <Section title="Schedule & format">
        <Field label="Start date">
          <Input
            type="date"
            value={form.start_date as string}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
        <Field label="End date">
          <Input
            type="date"
            value={form.end_date as string}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </Field>
        <Field label="Format">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={form.format as string}
            onChange={(e) => set("format", e.target.value)}
          >
            <option value="stroke_play">Stroke play</option>
            <option value="match_play">Match play</option>
            <option value="best_shot">Best shot</option>
            <option value="doubles">Doubles</option>
            <option value="singles">Singles</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={form.status as string}
            onChange={(e) => set("status", e.target.value)}
          >
            {[
              "draft",
              "published",
              "registration_open",
              "registration_closed",
              "in_progress",
              "completed",
              "cancelled",
            ].map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location" wide>
          <Input
            value={form.location as string}
            onChange={(e) => set("location", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Governing rules">
        <Field label="Rules for this event">
          <select
            value={form.governing_ruleset as string}
            onChange={(e) => set("governing_ruleset", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="dgd">DGD Sanctioned — DGD Rules</option>
            <option value="pdga">PDGA Sanctioned — PDGA rules govern</option>
            <option value="custom">Unsanctioned — custom event rules</option>
          </select>
        </Field>
        <Field label="PDGA tier">
          <Input
            value={form.pdga_tier as string}
            onChange={(e) => set("pdga_tier", e.target.value)}
            placeholder="XA / M / A / B / C / L"
          />
        </Field>
        <Field label="PDGA event number">
          <Input
            value={form.pdga_event_number as string}
            onChange={(e) => set("pdga_event_number", e.target.value)}
          />
        </Field>
      </Section>

      <div className="rounded-xl border border-border bg-card p-4">
        <FeesStep value={fees} onChange={setFees} unit="event" />
      </div>

      <Section title="Player pack & capacity">
        <Field label="Players pack (cents)">
          <Input
            type="number"
            min={0}
            value={form.players_pack_cents as number}
            onChange={(e) => set("players_pack_cents", Number(e.target.value))}
          />
        </Field>
        <Field label="Max players">
          <Input
            type="number"
            min={0}
            value={form.max_players as string}
            onChange={(e) => set("max_players", e.target.value)}
          />
        </Field>
        <Field label="Players per card">
          <Input
            type="number"
            min={2}
            max={6}
            value={form.players_per_card as string}
            onChange={(e) => set("players_per_card", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Tournament Director">
        <Field label="Tournament director (TD) name">
          <Input value={form.td_name as string} onChange={(e) => set("td_name", e.target.value)} />
        </Field>
        <Field label="Tournament director email">
          <Input
            type="email"
            value={form.td_email as string}
            onChange={(e) => set("td_email", e.target.value)}
          />
        </Field>
        <Field label="Tournament director phone">
          <Input
            value={form.td_phone as string}
            onChange={(e) => set("td_phone", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="External links">
        <Field label="Website URL">
          <Input
            value={form.website_url as string}
            onChange={(e) => set("website_url", e.target.value)}
          />
        </Field>
        <Field label="Registration URL">
          <Input
            value={form.registration_url as string}
            onChange={(e) => set("registration_url", e.target.value)}
          />
        </Field>
        <Field label="Rules URL">
          <Input
            value={form.rules_url as string}
            onChange={(e) => set("rules_url", e.target.value)}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

export function LeagueManageForm({ league, onSaved }: { league: LeagueRow; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({
    name: league.name ?? "",
    description: league.description ?? "",
    season: league.season ?? "",
    status: league.status ?? "draft",
    points_system: league.points_system ?? "standard",
    format: league.format ?? "singles",
    day_of_week: league.day_of_week ?? "",
    start_time: league.start_time ?? "",
    start_date: league.start_date ?? "",
    end_date: league.end_date ?? "",
    holes_played: league.holes_played ?? 18,
    weeks_planned: league.weeks_planned ?? "",
    best_n_weeks: league.best_n_weeks ?? "",
    handicap_method: league.handicap_method ?? "",
    rules_url: league.rules_url ?? "",
    governing_ruleset: (league.governing_ruleset as string | undefined) ?? (league.pdga_sanctioned ? "pdga" : "custom"),
    td_name: league.td_name ?? "",
    td_email: league.td_email ?? "",
    td_phone: league.td_phone ?? "",
    cover_url: league.cover_url ?? "",
    club_id: (league.club_id as string | null) ?? null,
  });
  const [fees, setFees] = useState<EventFees>(() => {
    const f = feesFromEventRow(league as Parameters<typeof feesFromEventRow>[0], "league");
    // Doubles events pay per team unless the director already chose otherwise.
    if (league.format === "doubles" && (f.payout.team_size ?? 1) === 1) f.payout.team_size = 2;
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const save = useServerFn(updateLeague);
  const convert = useServerFn(convertLeagueToTournament);
  const navigate = useNavigate();

  function set(key: string, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { ...form };
      ["day_of_week", "holes_played", "weeks_planned", "best_n_weeks"].forEach((k) => {
        if (patch[k] === "" || patch[k] == null) patch[k] = null;
      });
      if (patch.start_time === "") patch.start_time = null;
      Object.assign(patch, feesToColumns(fees, "night"));
      patch.setup = withFees(league, fees);
      await save({ data: { id: league.id, patch } });
      toast.success("League saved");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onConvert() {
    if (
      !confirm(
        "Convert this league to a tournament? Divisions will be copied and the original league will be cancelled.",
      )
    )
      return;
    setConverting(true);
    try {
      const res = await convert({ data: { id: league.id } });
      toast.success("Converted to tournament");
      navigate({ to: "/tournaments/$slug", params: { slug: res.slug } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert");
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="text-sm">
          <div className="font-medium">Event type: League</div>
          <div className="text-xs text-muted-foreground">
            Weekly recurring competition. Convert to a tournament for a one-time bracket-style
            event.
          </div>
        </div>
        <Button variant="outline" onClick={onConvert} disabled={converting}>
          <ArrowLeftRight className="mr-1 h-4 w-4" />{" "}
          {converting ? "Converting…" : "Convert to tournament"}
        </Button>
      </div>

      <Section title="Identity">
        <Field label="Event name">
          <Input value={form.name as string} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Hosting club">
          <HostClubPicker value={(form.club_id as string | null) ?? null} onChange={(id) => set("club_id", id)} />
        </Field>
        <Field label="Season / label">
          <Input
            value={form.season as string}
            onChange={(e) => set("season", e.target.value)}
            placeholder="Spring 2026"
          />
        </Field>
        <Field label="Description" wide>
          <Textarea
            rows={3}
            value={form.description as string}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <div className="sm:col-span-2">
          <EventCoverPicker
            value={(form.cover_url as string) ?? ""}
            onChange={(url) => set("cover_url", url)}
          />
        </div>
      </Section>

      <Section title="Schedule & format">
        <Field label="League day">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={String(form.day_of_week)}
            onChange={(e) =>
              set("day_of_week", e.target.value === "" ? "" : Number(e.target.value))
            }
          >
            <option value="">—</option>
            {DOW.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Start time">
          <Input
            type="time"
            value={form.start_time as string}
            onChange={(e) => set("start_time", e.target.value)}
          />
        </Field>
        <Field label="Season starts">
          <Input
            type="date"
            value={form.start_date as string}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
        <Field label="Season ends">
          <Input
            type="date"
            value={form.end_date as string}
            onChange={(e) => set("end_date", e.target.value)}
          />
        </Field>
        <Field label="Format">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={form.format as string}
            onChange={(e) => set("format", e.target.value)}
          >
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </Field>
        <Field label="Status">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={form.status as string}
            onChange={(e) => set("status", e.target.value)}
          >
            {["draft", "active", "completed", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Holes played">
          <Input
            type="number"
            min={1}
            max={27}
            value={form.holes_played as string}
            onChange={(e) => set("holes_played", e.target.value)}
          />
        </Field>
        <Field label="Weeks planned">
          <Input
            type="number"
            min={1}
            value={form.weeks_planned as string}
            onChange={(e) => set("weeks_planned", e.target.value)}
          />
        </Field>
        <Field label="Best N weeks (dropped)">
          <Input
            type="number"
            min={0}
            value={form.best_n_weeks as string}
            onChange={(e) => set("best_n_weeks", e.target.value)}
          />
        </Field>
        <Field label="Points system">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={form.points_system as string}
            onChange={(e) => set("points_system", e.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="stableford">Stableford</option>
            <option value="stroke">Stroke total</option>
          </select>
        </Field>
        <Field label="Handicap method">
          <Input
            value={form.handicap_method as string}
            onChange={(e) => set("handicap_method", e.target.value)}
            placeholder="e.g. 80% of avg vs par"
          />
        </Field>
      </Section>

      <div className="rounded-xl border border-border bg-card p-4">
        <FeesStep value={fees} onChange={setFees} unit="night" />
      </div>

      <Section title="League director (LD)">
        <Field label="League director name">
          <Input value={form.td_name as string} onChange={(e) => set("td_name", e.target.value)} />
        </Field>
        <Field label="League director email">
          <Input
            type="email"
            value={form.td_email as string}
            onChange={(e) => set("td_email", e.target.value)}
          />
        </Field>
        <Field label="League director phone">
          <Input
            value={form.td_phone as string}
            onChange={(e) => set("td_phone", e.target.value)}
          />
        </Field>
        <Field label="Rules for this league">
          <select
            value={form.governing_ruleset as string}
            onChange={(e) => set("governing_ruleset", e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="dgd">DGD Sanctioned — DGD Rules</option>
            <option value="pdga">PDGA Sanctioned — PDGA rules govern</option>
            <option value="custom">Unsanctioned — custom league rules</option>
          </select>
        </Field>
        <Field label="Rules URL" wide>
          <Input
            value={form.rules_url as string}
            onChange={(e) => set("rules_url", e.target.value)}
          />
        </Field>
      </Section>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
