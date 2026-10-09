import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLastUdiscImport, UDISC_STALE_DAYS } from "@/components/imports/udisc-quick-import";

const DISMISS_KEY = "dgd_udisc_reminder_dismissed_at";
const SNOOZE_DAYS = 7;

function snoozed(): boolean {
  try {
    const at = localStorage.getItem(DISMISS_KEY);
    if (!at) return false;
    return Date.now() - new Date(at).getTime() < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

/**
 * Gentle nudge to drop in a fresh UDisc export. Only appears once the player
 * has imported before and it's been a while, and it snoozes for a week.
 */
export function UdiscImportReminder() {
  const { data } = useLastUdiscImport();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(snoozed());
  }, []);

  const daysAgo = data?.daysAgo ?? null;
  if (hidden || daysAgo == null || daysAgo < UDISC_STALE_DAYS) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3">
      <Upload className="h-4 w-4 text-warning" />
      <p className="min-w-0 flex-1 text-sm">
        It's been {daysAgo} days since your last UDisc import — drop in a fresh export so your
        ratings and stats include those rounds.
      </p>
      <Button size="sm" asChild>
        <Link to="/settings/imports">Import now</Link>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Remind me later"
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, new Date().toISOString());
          } catch {
            /* storage disabled — hide for this session only */
          }
          setHidden(true);
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
