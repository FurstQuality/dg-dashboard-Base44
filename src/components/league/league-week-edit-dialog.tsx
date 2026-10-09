import { LEAGUE_FORMAT_LABEL, formatLabel } from "@/lib/league-effective";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type LeagueWeek = {
  id: string;
  week_number: number;
  name: string | null;
  course_id: string | null;
  layout_id: string | null;
  event_date: string;
  status: string;
  holes_played?: number | null;
  rounds?: number | null;
  rules_snapshot?: unknown;
  start_time?: string | null;
  check_in_time?: string | null;
  details?: string | null;
  entry_fee_cents?: number | null;
  format?: string | null;
  payout_notes?: string | null;
};

const STATUSES = ["scheduled", "in_progress", "completed", "cancelled"];

function snapshotNote(snapshot: unknown): string {
  if (snapshot && typeof snapshot === "object" && "scorecard_message" in snapshot) {
    const v = (snapshot as { scorecard_message?: unknown }).scorecard_message;
    return typeof v === "string" ? v : "";
  }
  return "";
}

export function LeagueWeekEditDialog({
  week,
  courses,
  open,
  onOpenChange,
  onSaved,
  defaults,
}: {
  defaults?: {
    entry_fee_cents: number | null;
    start_time: string | null;
    format?: string | null;
    payout_notes?: string | null;
  };
  week: LeagueWeek | null;
  courses: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [layoutId, setLayoutId] = useState("");
  const [layouts, setLayouts] = useState<{ id: string; name: string; hole_count: number | null }[]>(
    [],
  );
  const [holes, setHoles] = useState("");
  const [rounds, setRounds] = useState(1);
  const [status, setStatus] = useState("scheduled");
  const [note, setNote] = useState("");
  const [startTime, setStartTime] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [details, setDetails] = useState("");
  const [fee, setFee] = useState("");
  const [format, setFormat] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!week) return;
    setName(week.name ?? "");
    setDate(week.event_date?.slice(0, 10) ?? "");
    setCourseId(week.course_id ?? "");
    setLayoutId(week.layout_id ?? "");
    setHoles(week.holes_played != null ? String(week.holes_played) : "");
    setRounds(week.rounds && week.rounds > 0 ? week.rounds : 1);
    setStatus(week.status ?? "scheduled");
    setNote(snapshotNote(week.rules_snapshot));
    setStartTime(week.start_time?.slice(0, 5) ?? "");
    setCheckIn(week.check_in_time?.slice(0, 5) ?? "");
    setDetails(week.details ?? "");
    setFee(week.entry_fee_cents != null ? String(week.entry_fee_cents / 100) : "");
    setFormat(week.format ?? "");
    setPayoutNotes(week.payout_notes ?? "");
  }, [week]);

  useEffect(() => {
    if (!courseId) {
      setLayouts([]);
      return;
    }
    let cancelled = false;
    void supabase
      .from("course_layouts")
      .select("id, name, hole_count")
      .eq("course_id", courseId)
      .order("name")
      .then(({ data }) => {
        if (cancelled) return;
        setLayouts((data as { id: string; name: string; hole_count: number | null }[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  async function save() {
    if (!week) return;
    if (!date) {
      toast.error("Pick a date for this league night.");
      return;
    }
    setSaving(true);
    const base =
      week.rules_snapshot && typeof week.rules_snapshot === "object"
        ? (week.rules_snapshot as Record<string, unknown>)
        : {};
    const { error } = await supabase
      .from("league_events")
      .update({
        name: name.trim() || null,
        event_date: date,
        course_id: courseId || null,
        layout_id: layoutId || null,
        holes_played: holes ? Number(holes) : null,
        rounds,
        status,
        start_time: startTime || null,
        check_in_time: checkIn || null,
        details: details.trim() || null,
        entry_fee_cents: fee ? Math.round(Number(fee) * 100) : null,
        format: format.trim() || null,
        payout_notes: payoutNotes.trim() || null,
        rules_snapshot: { ...base, scorecard_message: note.trim() || null },
      })
      .eq("id", week.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Week ${week.week_number} updated`);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit week {week?.week_number ?? ""}</DialogTitle>
          <DialogDescription>
            Editing this night only. Course and layout belong to this night; anything left blank uses the league&apos;s settings.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Night name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Week 5 – Doubles"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm capitalize"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Check-in opens</Label>
            <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start time</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <InheritNote
              override={!!startTime}
              inherited={defaults?.start_time?.slice(0, 5) ?? null}
              onReset={() => setStartTime("")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entry fee this night ($)</Label>
            <Input
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="League fee"
            />
            <InheritNote
              override={fee !== ""}
              inherited={defaults?.entry_fee_cents != null ? `$${(defaults.entry_fee_cents / 100).toFixed(2)}` : null}
              onReset={() => setFee("")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Format this night</Label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">League format</option>
              {Object.entries(LEAGUE_FORMAT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <InheritNote
              override={format !== ""}
              inherited={defaults?.format ? formatLabel(defaults.format) : null}
              onReset={() => setFormat("")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Payout this night</Label>
            <Input
              value={payoutNotes}
              onChange={(e) => setPayoutNotes(e.target.value)}
              placeholder="League payout"
            />
            <InheritNote
              override={payoutNotes.trim() !== ""}
              inherited={defaults?.payout_notes ? "League payout" : null}
              onReset={() => setPayoutNotes("")}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Course</Label>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setLayoutId("");
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Not set</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Layout</Label>
            <select
              value={layoutId}
              onChange={(e) => {
                setLayoutId(e.target.value);
                const l = layouts.find((x) => x.id === e.target.value);
                if (l?.hole_count) setHoles(String(l.hole_count * rounds));
              }}
              disabled={!courseId}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">Not set</option>
              {layouts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.hole_count ? ` · ${l.hole_count} holes` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rounds this night</Label>
            <select
              value={String(rounds)}
              onChange={(e) => {
                const next = Number(e.target.value) || 1;
                const perRound = layouts.find((x) => x.id === layoutId)?.hole_count ?? null;
                setRounds(next);
                if (perRound) setHoles(String(perRound * next));
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="1">One round</option>
              <option value="2">Two rounds</option>
            </select>
            <p className="text-xs text-muted-foreground">
              The layout&apos;s hole count sets the holes played.
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Holes played</Label>
            <Input
              inputMode="numeric"
              value={holes}
              onChange={(e) => setHoles(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="18"
            />
            <p className="text-xs text-muted-foreground">
              Override only if this night plays a different number of holes.
            </p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Details for players</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              placeholder="Format changes, special prizes, food, weather plans — anything that's only true this night."
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Scorecard note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Shown on every card for this night — CTP holes, OB rules, payouts."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save week"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InheritNote({
  override,
  inherited,
  onReset,
}: {
  override: boolean;
  inherited: string | null;
  onReset: () => void;
}) {
  if (!override)
    return (
      <p className="text-[13px] text-muted-foreground">
        {inherited ? `${inherited} · from league settings` : "Uses league settings"}
      </p>
    );
  return (
    <p className="text-[13px] text-muted-foreground">
      Set for this night only ·{" "}
      <button type="button" className="font-medium text-primary hover:underline" onClick={onReset}>
        Use league setting
      </button>
    </p>
  );
}
