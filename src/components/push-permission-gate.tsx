import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isPushSupported,
  registerServiceWorker,
  subscribeToPush,
  unsubscribeFromPush,
  isSubscribed,
  getPushPermissionState,
} from "@/lib/push-notifications";

type Status = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function PushPermissionGate({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      await registerServiceWorker();
      const perm = await getPushPermissionState();
      if (perm === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }
      const sub = await isSubscribed();
      if (!cancelled) setStatus(sub ? "subscribed" : "unsubscribed");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    const res = await subscribeToPush();
    setBusy(false);
    if (res.ok) {
      setStatus("subscribed");
      toast.success("Push notifications enabled");
    } else {
      toast.error(res.error || "Couldn't enable notifications");
      const perm = await getPushPermissionState();
      if (perm === "denied") setStatus("denied");
    }
  }

  async function handleDisable() {
    setBusy(true);
    await unsubscribeFromPush();
    setBusy(false);
    setStatus("unsubscribed");
    toast("Push notifications turned off");
  }

  if (status === "loading") return null;
  if (status === "unsupported") {
    return compact ? null : (
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        Push notifications aren't supported in this browser. Install DG Dashboard to your home
        screen for the full experience.
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
        <BellOff className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          <div className="font-medium">Notifications are blocked</div>
          <div className="text-muted-foreground">
            Enable them in your browser or device settings to get crew and tournament alerts.
          </div>
        </div>
      </div>
    );
  }
  if (status === "subscribed") {
    return (
      <div
        className={
          compact
            ? "flex items-center gap-2"
            : "flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3"
        }
      >
        <div className="flex items-center gap-2 text-sm">
          <BellRing className="h-4 w-4 text-primary" />
          <span>Push notifications on</span>
        </div>
        <Button size="sm" variant="ghost" onClick={handleDisable} disabled={busy}>
          Turn off
        </Button>
      </div>
    );
  }
  return (
    <div
      className={
        compact
          ? "flex items-center gap-2"
          : "flex items-center justify-between rounded-lg border border-border/60 bg-card/40 p-3"
      }
    >
      <div className="flex items-center gap-2 text-sm">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <span>Get alerts for crew activity, tournaments, and scores</span>
      </div>
      <Button size="sm" onClick={handleEnable} disabled={busy}>
        {busy ? "Enabling…" : "Enable"}
      </Button>
    </div>
  );
}
