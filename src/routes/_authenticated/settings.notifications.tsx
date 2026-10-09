import { createFileRoute } from "@tanstack/react-router";
import { SettingsPageTitle } from "@/components/settings/settings-page-title";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SaveStateNote, type SaveState } from "@/components/settings/save-state";
import { toast } from "sonner";
import { Bell, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyPrefs, saveMyPrefs } from "@/lib/platform-config.functions";
import { NOTIFICATION_PREFS_DEFAULTS, type NotificationPrefs } from "@/lib/platform-config";

export const Route = createFileRoute("/_authenticated/settings/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Settings · DG Dashboard" },
      {
        name: "description",
        content: "Choose which round, crew, and event alerts DG Dashboard sends you.",
      },
      { property: "og:title", content: "Notification Settings · DG Dashboard" },
      {
        property: "og:description",
        content: "Choose which round, crew, and event alerts DG Dashboard sends you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsSettings,
});

const CHANNELS: { key: keyof NotificationPrefs["channels"]; label: string; hint: string }[] = [
  { key: "push", label: "Push", hint: "Real-time alerts on your device" },
  { key: "email", label: "Email", hint: "Digest and important updates" },
  { key: "inApp", label: "In-app", hint: "The bell in the top nav" },
];

const TOPICS: { key: keyof NotificationPrefs["topics"]; label: string; hint: string }[] = [
  { key: "friendRequests", label: "Friend requests", hint: "New Crew invites" },
  { key: "mentions", label: "Mentions", hint: "When someone tags you in a post" },
  { key: "comments", label: "Comments", hint: "Replies on your posts and rounds" },
  { key: "likes", label: "Likes", hint: "Off by default to keep things quiet" },
  {
    key: "tournamentReminders",
    label: "Tournament reminders",
    hint: "Tee times, check-ins, results",
  },
  { key: "leagueUpdates", label: "League updates", hint: "New rounds and standings" },
  {
    key: "crewCalendarChanges",
    label: "Crew calendar changes",
    hint: "Your Crew's overlaps and updates",
  },
  {
    key: "friendLiveRounds",
    label: "Friends' live rounds",
    hint: "When a friend tees off or finishes a round",
  },
  {
    key: "friendEagles",
    label: "Crew eagles",
    hint: "When someone in your tracker cards an eagle or better",
  },
  { key: "friendAces", label: "Crew aces", hint: "When someone in your tracker throws an ace" },
  {
    key: "friendWins",
    label: "Crew wins",
    hint: "When someone in your tracker wins their division",
  },
  {
    key: "friendEventSignups",
    label: "Crew event sign-ups",
    hint: "When someone in your tracker registers for an event",
  },
  {
    key: "pdgaRatingChanges",
    label: "PDGA rating changes",
    hint: "When your official rating moves",
  },
  { key: "achievementUnlocks", label: "Achievements & levels", hint: "New badges and level-ups" },
  { key: "weeklyRecap", label: "Weekly recap", hint: "Your Sunday email summary" },
];

function NotificationsSettings() {
  const load = useServerFn(getMyPrefs);
  const save = useServerFn(saveMyPrefs);
  const [prefs, setPrefs] = useState<NotificationPrefs>(NOTIFICATION_PREFS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const savedSnapshot = useRef<string | null>(null);

  useEffect(() => {
    load()
      .then((r) => {
        setPrefs(r.notifications);
        savedSnapshot.current = JSON.stringify(r.notifications);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  // Flags unsaved edits so the panel never looks stored when it is not.
  useEffect(() => {
    if (savedSnapshot.current === null) return;
    const dirty = JSON.stringify(prefs) !== savedSnapshot.current;
    setSaveState((s) => (dirty ? "dirty" : s === "dirty" ? "clean" : s));
  }, [prefs]);

  async function onSave() {
    setSaving(true);
    setSaveState("saving");
    try {
      await save({ data: { notifications: prefs } });
      savedSnapshot.current = JSON.stringify(prefs);
      setSaveState("saved");
      toast.success("Notification preferences saved");
    } catch (err) {
      setSaveState("error");
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <SettingsPageTitle
        title="Notifications"
        description="Choose what reaches you by push and email, and when to stay quiet."
      />
      <Section title="Channels" description="How you'd like DG Dashboard to reach you.">
        <div className="grid gap-2 sm:grid-cols-3">
          {CHANNELS.map((c) => (
            <RowSwitch
              key={c.key}
              label={c.label}
              hint={c.hint}
              checked={prefs.channels[c.key]}
              onChange={(v) => setPrefs((p) => ({ ...p, channels: { ...p.channels, [c.key]: v } }))}
            />
          ))}
        </div>
      </Section>

      <Section
        title="What to notify me about"
        description="Turn off anything you don't need — you can flip these back on any time."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {TOPICS.map((t) => (
            <RowSwitch
              key={t.key}
              label={t.label}
              hint={t.hint}
              checked={prefs.topics[t.key]}
              onChange={(v) => setPrefs((p) => ({ ...p, topics: { ...p.topics, [t.key]: v } }))}
            />
          ))}
        </div>
      </Section>

      <Section
        title="Quiet hours"
        description="Push and email pause during these windows. Emergencies (tournament tee-times you're registered for) still get through."
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={prefs.quietHours.enabled}
              onCheckedChange={(v) =>
                setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, enabled: v } }))
              }
            />
            <span className="text-sm">Enable nightly quiet hours</span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="qh-start">Start</Label>
            <Input
              id="qh-start"
              type="time"
              disabled={!prefs.quietHours.enabled}
              value={prefs.quietHours.start}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, start: e.target.value } }))
              }
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qh-end">End</Label>
            <Input
              id="qh-end"
              type="time"
              disabled={!prefs.quietHours.enabled}
              value={prefs.quietHours.end}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, end: e.target.value } }))
              }
              className="w-32"
            />
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">Tournament days</div>
              <div className="text-[11px] text-muted-foreground">
                Stay heads-down while you're competing — alerts hold from your first tee time
                through the awards ceremony for events you're registered for.
              </div>
            </div>
            <Switch
              checked={prefs.quietHours.duringTournaments}
              onCheckedChange={(v) =>
                setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, duringTournaments: v } }))
              }
            />
          </div>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">League nights</div>
              <div className="text-[11px] text-muted-foreground">
                Same treatment for league rounds you're signed up for — alerts hold while the league
                night is running and resume after it wraps.
              </div>
            </div>
            <Switch
              checked={prefs.quietHours.duringLeagues}
              onCheckedChange={(v) =>
                setPrefs((p) => ({ ...p, quietHours: { ...p.quietHours, duringLeagues: v } }))
              }
            />
          </div>
          <div className="mt-3 space-y-1">
            <Label htmlFor="qh-awards">Awards buffer after the final round (minutes)</Label>
            <Input
              id="qh-awards"
              type="number"
              min={0}
              max={240}
              step={15}
              disabled={!prefs.quietHours.duringTournaments && !prefs.quietHours.duringLeagues}
              value={prefs.quietHours.tournamentAwardsBufferMinutes}
              onChange={(e) =>
                setPrefs((p) => ({
                  ...p,
                  quietHours: {
                    ...p.quietHours,
                    tournamentAwardsBufferMinutes: Math.min(
                      240,
                      Math.max(0, Number(e.target.value) || 0),
                    ),
                  },
                }))
              }
              className="w-32"
            />
            <p className="text-[11px] text-muted-foreground">
              Alerts resume once payouts and awards wrap up.
            </p>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3">
        <SaveStateNote state={saveState} />
        <Button onClick={onSave} disabled={saving || loading}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

function RowSwitch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-background p-3 hover:border-primary/50">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
