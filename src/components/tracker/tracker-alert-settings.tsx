import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getMyPrefs, saveMyPrefs } from "@/lib/platform-config.functions";
import { NOTIFICATION_PREFS_DEFAULTS, type NotificationPrefs } from "@/lib/platform-config";

type TopicKey = keyof NotificationPrefs["topics"];

/**
 * The cheer-them-on alerts. These are the same saved settings as
 * Settings → Notifications, so a change here shows up there and vice versa.
 */
const TRACKER_TOPICS: { key: TopicKey; label: string; hint: string }[] = [
  {
    key: "friendEagles",
    label: "Someone in my tracker cards an eagle",
    hint: "Two or better under par on a hole, from live scoring",
  },
  { key: "friendAces", label: "Someone in my tracker aces", hint: "Hole in one — the big one" },
  {
    key: "friendWins",
    label: "Someone in my tracker wins an event",
    hint: "Finishes first in their division when results post",
  },
  {
    key: "friendLiveRounds",
    label: "Tee offs and finishes",
    hint: "Round starts and finishes, posted round scores, and moves in the standings",
  },
  {
    key: "friendEventSignups",
    label: "New event sign-ups",
    hint: "When a tracked player registers for an event you could play too",
  },
  {
    key: "crewCalendarChanges",
    label: "Tee time and schedule changes",
    hint: "Tee times posted or moved, division switches, pools, and dates",
  },
];

/**
 * Tracker alert settings, opened from the tracker header. Writes the shared
 * notification preferences so nothing is stored twice.
 */
export function TrackerAlertSettings() {
  const load = useServerFn(getMyPrefs);
  const save = useServerFn(saveMyPrefs);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(NOTIFICATION_PREFS_DEFAULTS);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["prefs", "notifications"],
    queryFn: () => load(),
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    if (data?.notifications) setPrefs(data.notifications);
  }, [data]);

  const persist = async (next: NotificationPrefs) => {
    setPrefs(next);
    setSaving(true);
    try {
      await save({ data: { notifications: next } });
      await queryClient.invalidateQueries({ queryKey: ["prefs", "notifications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That setting didn't save — try again");
      if (data?.notifications) setPrefs(data.notifications);
    } finally {
      setSaving(false);
    }
  };

  const toggleTopic = (key: TopicKey, value: boolean) =>
    void persist({ ...prefs, topics: { ...prefs.topics, [key]: value } });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Bell className="mr-1.5 h-3.5 w-3.5" /> Alert settings
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Tracker alerts</SheetTitle>
          <SheetDescription>
            Pick the moments worth a nudge. Eagles, aces, and wins are on by default so you never
            miss a chance to hype someone up.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your settings…
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {TRACKER_TOPICS.map((topic) => (
              <label
                key={topic.key}
                className="flex items-start justify-between gap-4 rounded-xl border border-border/70 p-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{topic.label}</span>
                  <span className="block text-xs text-muted-foreground">{topic.hint}</span>
                </span>
                <Switch
                  checked={prefs.topics[topic.key]}
                  onCheckedChange={(v) => toggleTopic(topic.key, v)}
                  aria-label={topic.label}
                />
              </label>
            ))}

            <div className="rounded-xl border border-border/70 p-3">
              <div className="flex items-start justify-between gap-4">
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Show alerts in the app</span>
                  <span className="block text-xs text-muted-foreground">
                    Pop-ups while you have DG Dashboard open. Turning this off silences all tracker
                    alerts on screen.
                  </span>
                </span>
                <Switch
                  checked={prefs.channels.inApp}
                  onCheckedChange={(v) =>
                    void persist({ ...prefs, channels: { ...prefs.channels, inApp: v } })
                  }
                  aria-label="Show alerts in the app"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {saving ? "Saving…" : "Changes save as you flip them."}
            </p>

            <Button asChild variant="ghost" size="sm" className="w-full">
              <Link to="/settings/notifications" onClick={() => setOpen(false)}>
                <Settings className="mr-1.5 h-3.5 w-3.5" /> All notification settings
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
