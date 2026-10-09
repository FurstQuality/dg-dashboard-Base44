import { Bell, Palette, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  useMessengerPrefs,
  type MessengerDensity,
  type MessengerFontScale,
  type MessengerLane,
  type MessengerWallpaper,
} from "@/lib/messenger-prefs";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={value === o.value}
            className={
              "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition " +
              (value === o.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

/** Settings and personalization for the full-page DGIM messenger app. */
export function MessengerSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { prefs, update, reset } = useMessengerPrefs();

  async function enableDesktopNotifications(next: boolean) {
    if (!next) {
      update({ desktopNotifications: false });
      return;
    }
    if (typeof Notification === "undefined") {
      toast.error("This browser can't show desktop notifications.");
      return;
    }
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission().catch(() => "denied");
    if (permission !== "granted") {
      toast.error("Notifications are blocked for this site.");
      return;
    }
    update({ desktopNotifications: true });
    toast.success("Desktop notifications on for new messages.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Messenger settings</DialogTitle>
          <DialogDescription>
            Personalize how DGIM looks and how it reaches you. Saved on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Segmented<MessengerDensity>
              label="Message density"
              value={prefs.density}
              onChange={(density) => update({ density })}
              options={[
                { value: "comfortable", label: "Comfortable" },
                { value: "compact", label: "Compact" },
              ]}
            />
            <Segmented<MessengerFontScale>
              label="Text size"
              value={prefs.fontScale}
              onChange={(fontScale) => update({ fontScale })}
              options={[
                { value: "sm", label: "Small" },
                { value: "md", label: "Default" },
                { value: "lg", label: "Large" },
              ]}
            />
          </div>

          <Segmented<MessengerWallpaper>
            label="Chat wallpaper"
            value={prefs.wallpaper}
            onChange={(wallpaper) => update({ wallpaper })}
            options={[
              { value: "none", label: "Plain" },
              { value: "fairway", label: "Fairway" },
              { value: "chains", label: "Chains" },
              { value: "dusk", label: "Dusk" },
            ]}
          />

          <Segmented<MessengerLane>
            label="Open messenger on"
            value={prefs.defaultLane}
            onChange={(defaultLane) => update({ defaultLane })}
            options={[
              { value: "social", label: "Social chats" },
              { value: "event", label: "Event rooms" },
            ]}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Palette className="h-3.5 w-3.5" /> Conversation details
            </div>
            <ToggleRow
              title="Show message times"
              description="Display the send time under every message."
              checked={prefs.showTimestamps}
              onCheckedChange={(showTimestamps) => update({ showTimestamps })}
            />
            <ToggleRow
              title="Show read receipts"
              description="Show the double check when your message has been read."
              checked={prefs.showReadReceipts}
              onCheckedChange={(showReadReceipts) => update({ showReadReceipts })}
            />
            <ToggleRow
              title="Enter sends the message"
              description="Turn off to use Enter for a new line and the Send button to post."
              checked={prefs.sendOnEnter}
              onCheckedChange={(sendOnEnter) => update({ sendOnEnter })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Bell className="h-3.5 w-3.5" /> Alerts
            </div>
            <ToggleRow
              icon={<Volume2 className="h-3.5 w-3.5" />}
              title="Sound on new message"
              description="Play a short chime when a message arrives in the open chat."
              checked={prefs.soundOnNewMessage}
              onCheckedChange={(soundOnNewMessage) => update({ soundOnNewMessage })}
            />
            <ToggleRow
              title="Desktop notifications"
              description="Get a browser notification when someone messages you."
              checked={prefs.desktopNotifications}
              onCheckedChange={enableDesktopNotifications}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={reset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Reset to defaults
          </Button>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
