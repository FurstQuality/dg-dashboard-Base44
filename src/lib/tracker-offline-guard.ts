import { toast } from "sonner";

/** True when the browser reports no connectivity. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Blocks a tracker write while offline and tells the crew why.
 * Returns true when the caller should stop.
 */
export function blockedByOffline(action = "This change"): boolean {
  if (!isOffline()) return false;
  toast.error("You're offline", {
    description: `${action} needs a connection. Reconnect and try again — your tracker stays readable in the meantime.`,
  });
  return true;
}
