import { useState } from "react";
import { AlertTriangle, Clock, Megaphone, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  alertMeta,
  useEventAlerts,
  type EventAlert,
  type EventAlertKind,
} from "@/lib/event-alerts";

const KIND_ICON: Record<EventAlertKind, typeof Megaphone> = {
  announcement: Megaphone,
  delay: Clock,
  course_issue: AlertTriangle,
};

function timeAgo(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : new Date(iso).toLocaleDateString();
}

export function AlertRow({ a, action }: { a: EventAlert; action?: React.ReactNode }) {
  const Icon = KIND_ICON[a.kind];
  const urgent = a.is_active && a.kind !== "announcement";
  return (
    <li
      className={`flex gap-3 rounded-lg border p-3 ${
        urgent ? "border-destructive/50 bg-destructive/10" : "border-border bg-card"
      } ${a.is_active ? "" : "opacity-60"}`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${urgent ? "text-destructive" : "text-primary"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{alertMeta(a)}</span>
          <span>{timeAgo(a.created_at)}</span>
          {!a.is_active ? <Badge variant="outline">Resolved</Badge> : null}
        </div>
        <div className="mt-0.5 text-sm font-semibold">{a.title}</div>
        {a.body ? <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p> : null}
      </div>
      {action}
    </li>
  );
}

/** Player-facing strip of active alerts. Renders nothing when all is quiet. */
export function EventAlertsBanner({ tournamentId }: { tournamentId: string }) {
  const { active } = useEventAlerts(tournamentId);
  if (!active.length) return null;
  return (
    <section aria-label="Event updates" aria-live="polite">
      <ul className="space-y-2">
        {active.slice(0, 4).map((a) => (
          <AlertRow key={a.id} a={a} />
        ))}
      </ul>
    </section>
  );
}

/** Director/volunteer composer + history with resolve controls. */
export function EventAlertsManager({ tournamentId }: { tournamentId: string }) {
  const { alerts, reload } = useEventAlerts(tournamentId);
  const [kind, setKind] = useState<EventAlertKind>("announcement");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hole, setHole] = useState("");
  const [delay, setDelay] = useState("");
  const [saving, setSaving] = useState(false);

  async function post() {
    const t = title.trim();
    if (!t) return toast.error("Add a short headline first.");
    const holeN = hole ? Number(hole) : null;
    const delayN = delay ? Number(delay) : null;
    if (holeN !== null && (!Number.isInteger(holeN) || holeN < 1 || holeN > 99))
      return toast.error("Hole must be a number from 1 to 99.");
    if (delayN !== null && (!Number.isInteger(delayN) || delayN < 1 || delayN > 600))
      return toast.error("Delay must be between 1 and 600 minutes.");
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from("event_alerts").insert({
      tournament_id: tournamentId,
      kind,
      title: t.slice(0, 120),
      body: body.trim() ? body.trim().slice(0, 1000) : null,
      hole_number: kind === "announcement" ? null : holeN,
      delay_minutes: kind === "delay" ? delayN : null,
      created_by: auth.user?.id ?? "",
    });
    setSaving(false);
    if (error) return toast.error("That update didn't post. Check you're on the event team and try again.");
    toast.success("Players can see it now.");
    setTitle("");
    setBody("");
    setHole("");
    setDelay("");
    void reload();
  }

  async function setActive(a: EventAlert, active: boolean) {
    const { error } = await supabase
      .from("event_alerts")
      .update({ is_active: active, resolved_at: active ? null : new Date().toISOString() })
      .eq("id", a.id);
    if (error) toast.error("Couldn't update that alert.");
    else void reload();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Update type">
        {(["announcement", "delay", "course_issue"] as const).map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <Button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              variant={kind === k ? "default" : "outline"}
              className="h-12 flex-col gap-0.5 text-xs sm:h-10 sm:flex-row sm:text-sm"
              onClick={() => setKind(k)}
            >
              <Icon className="h-4 w-4" />
              {k === "announcement" ? "Announcement" : k === "delay" ? "Delay" : "Course issue"}
            </Button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="alert-title">Headline</Label>
        <Input
          id="alert-title"
          value={title}
          maxLength={120}
          placeholder={
            kind === "delay"
              ? "Round 2 pushed back"
              : kind === "course_issue"
                ? "Tree down across the fairway"
                : "Players meeting at the clubhouse"
          }
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {kind !== "announcement" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="alert-hole">Hole (optional)</Label>
            <Input id="alert-hole" inputMode="numeric" value={hole} onChange={(e) => setHole(e.target.value.replace(/\D/g, ""))} />
          </div>
          {kind === "delay" ? (
            <div className="space-y-1.5">
              <Label htmlFor="alert-delay">Minutes</Label>
              <Input id="alert-delay" inputMode="numeric" value={delay} onChange={(e) => setDelay(e.target.value.replace(/\D/g, ""))} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="alert-body">Details (optional)</Label>
        <Textarea id="alert-body" rows={3} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <Button className="h-11 w-full sm:w-auto" onClick={post} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Megaphone className="mr-2 h-4 w-4" />}
        Post to players
      </Button>

      {alerts.length ? (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <AlertRow
              key={a.id}
              a={a}
              action={
                a.is_active ? (
                  <Button size="sm" variant="outline" onClick={() => setActive(a, false)}>
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setActive(a, true)}>
                    Reopen
                  </Button>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No updates posted yet. Anything you post shows up for players right away.</p>
      )}
    </div>
  );
}
