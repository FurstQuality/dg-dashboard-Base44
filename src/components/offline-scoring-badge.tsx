import { useEffect, useState, useCallback } from "react";
import { CloudOff, CloudUpload, Check } from "lucide-react";
import { getQueuedCount, subscribeOnlineFlush, syncOfflineQueue } from "@/lib/offline-queue";
import { toast } from "sonner";

/**
 * Live indicator for the Fullscreen Scorer. Shows:
 * - green "Synced" when online and queue empty
 * - amber "Syncing (n)" when online but queue non-empty (flush in flight)
 * - red   "Offline (n queued)" when offline
 *
 * Auto-polls the queue every 3s while non-empty and re-flushes on `online`.
 */
export function OfflineScoringBadge({ roundId }: { roundId?: string }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queued, setQueued] = useState(0);

  const refresh = useCallback(async () => {
    const n = await getQueuedCount(roundId);
    setQueued(n);
  }, [roundId]);

  useEffect(() => {
    void refresh();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const unsubFlush = subscribeOnlineFlush((result) => {
      void refresh();
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} offline score${result.synced === 1 ? "" : "s"}`);
      }
    });

    // Kick a flush attempt on mount in case we came back online mid-crash.
    void syncOfflineQueue().then(() => refresh()).catch(() => refresh());

    // Poll while queued or offline.
    const id = window.setInterval(() => void refresh(), 3000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubFlush();
      window.clearInterval(id);
    };
  }, [refresh]);

  if (online && queued === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        <Check className="h-3 w-3" /> Synced
      </span>
    );
  }
  if (!online) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
        <CloudOff className="h-3 w-3" />
        Offline{queued > 0 ? ` · ${queued} queued` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
      <CloudUpload className="h-3 w-3 animate-pulse" /> Syncing {queued}
    </span>
  );
}
