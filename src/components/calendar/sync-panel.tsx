/**
 * Sync + subscribe panel: Google Calendar OAuth connect, ICS feed URL,
 * quick actions to pull/push, and Apple/Outlook instructions.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  startGoogleCalendarConnect,
  completeGoogleCalendarConnect,
  saveGoogleCalendarConnection,
  disconnectGoogleCalendar,
  getCalendarConnectionStatus,
  syncGoogleCalendarPull,
  pushAllRegisteredToGoogle,
  getOrCreateIcsFeedToken,
  rotateIcsFeedToken,
  importFromRegistrations,
} from "@/lib/calendar-sync.functions";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import { connectDirectCalendar } from "@/lib/calendar-popup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Apple,
  Calendar as CalendarIcon,
  Check,
  Copy,
  LinkIcon,
  RefreshCcw,
  Zap,
} from "lucide-react";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export function CalendarSyncPanel({ onChanged }: { onChanged: () => void }) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getCalendarConnectionStatus);
  const startConnect = useServerFn(startGoogleCalendarConnect);
  const completeConnect = useServerFn(completeGoogleCalendarConnect);
  const saveConn = useServerFn(saveGoogleCalendarConnection);
  const disconnect = useServerFn(disconnectGoogleCalendar);
  const pull = useServerFn(syncGoogleCalendarPull);
  const pushAll = useServerFn(pushAllRegisteredToGoogle);
  const getToken = useServerFn(getOrCreateIcsFeedToken);
  const rotate = useServerFn(rotateIcsFeedToken);
  const importReg = useServerFn(importFromRegistrations);

  const { data: status } = useQuery({
    queryKey: ["calendar-status"],
    queryFn: () => statusFn(),
  });

  const [connecting, setConnecting] = useState(false);
  const [icsToken, setIcsToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const feedUrl = icsToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/api/public/calendar/${icsToken}`
    : null;
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, "webcal:") : null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["calendar-status"] });
    onChanged();
  };

  async function handleGoogleConnect() {
    setConnecting(true);
    try {
      if (status?.provider === "google") {
        await connectDirectCalendar(
          () => startConnect({ data: window.location.origin }),
          (data) => completeConnect({ data }),
        );
      } else {
      const result = await connectAppUser({
        connectorId: "google_calendar",
        gatewayBaseUrl: GATEWAY_BASE_URL,
        start: (targetOrigin) => startConnect({ data: targetOrigin }),
      });
      if (!result.success) throw new Error(result.error ?? "Sign-in failed");
      if (!result.connectionAPIKey) throw new Error("No connection key returned");
      await saveConn({ data: { connectionAPIKey: result.connectionAPIKey } });
      }
      toast.success("Google Calendar connected");
      invalidate();
      // Auto-pull once
      const r = await pull();
      toast.success(`Imported ${r.imported} events from Google`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setConnecting(false);
    }
  }

  // Keep the connected calendar current without asking the player to press
  // anything: pull, push and registration import run when the panel opens and
  // the last automatic pass is older than the interval below.
  const AUTO_EVERY_MS = 60 * 60 * 1000;
  const [syncing, setSyncing] = useState(false);
  const autoRan = useRef(false);
  useEffect(() => {
    if (!status?.google || autoRan.current) return;
    autoRan.current = true;
    const key = "dgd:calendar:auto-sync-at";
    const last = Number(window.localStorage.getItem(key) ?? 0);
    if (Date.now() - last < AUTO_EVERY_MS) return;
    setSyncing(true);
    void (async () => {
      try {
        await pull();
        await pushAll();
        await importReg();
        window.localStorage.setItem(key, String(Date.now()));
        onChanged();
      } catch {
        /* the next visit retries — nothing for the player to do */
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.google]);

  async function ensureToken() {
    const { token } = await getToken();
    setIcsToken(token);
  }

  async function copyFeed() {
    if (!feedUrl) await ensureToken();
    const url =
      feedUrl ?? `${window.location.origin}/api/public/calendar/${(await getToken()).token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Calendar feed URL copied");
    setTimeout(() => setCopied(false), 2500);
  }

  const googleConnected = Boolean(status?.google);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Google Calendar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarIcon className="h-4 w-4 text-amber-500" />
            Google Calendar
            {googleConnected && (
              <Badge variant="secondary" className="ml-auto">
                Connected
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Two-way sync with your primary Google Calendar. Pull your existing events in; push
            tournaments you register for out.
          </p>
          {!googleConnected ? (
            <Button onClick={handleGoogleConnect} disabled={connecting || !status} className="w-full">
              <LinkIcon className="mr-2 h-4 w-4" />
              {connecting ? "Opening Google…" : "Connect Google Calendar"}
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {syncing
                  ? "Syncing your calendar…"
                  : "Events sync both ways automatically in the background."}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await disconnect();
                  toast.success("Disconnected");
                  invalidate();
                }}
              >
                Disconnect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ICS feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Apple className="h-4 w-4" />
            Apple / Outlook / Any calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Subscribe once with your private feed URL. Your calendar refreshes automatically as
            events change.
          </p>
          {!icsToken ? (
            <Button onClick={ensureToken} variant="outline" className="w-full">
              <Zap className="mr-2 h-4 w-4" />
              Generate my calendar feed URL
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input readOnly value={feedUrl ?? ""} className="font-mono text-xs" />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Copy calendar feed URL"
                  onClick={copyFeed}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {webcalUrl && (
                  <a href={webcalUrl} className="text-primary underline">
                    Add to Apple Calendar (one-tap)
                  </a>
                )}
                <button
                  onClick={async () => {
                    await rotate();
                    setIcsToken(null);
                    toast.success("Feed URL rotated");
                  }}
                  className="text-muted-foreground underline"
                >
                  Rotate URL
                </button>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">How to subscribe</summary>
                <ul className="mt-2 space-y-1 pl-4">
                  <li>
                    <b>Apple:</b> tap the webcal:// link on iOS, or Calendar → File → New Calendar
                    Subscription → paste URL.
                  </li>
                  <li>
                    <b>Google:</b> Calendar → Other calendars → From URL → paste URL.
                  </li>
                  <li>
                    <b>Outlook:</b> Add calendar → Subscribe from web → paste URL.
                  </li>
                </ul>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Everything else stays current on its own */}
      <Card className="md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCcw className="h-4 w-4" />
            Everything else stays current on its own
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The events you sign up for in DG Dashboard, plus PDGA and UDisc listings, are added to
            your calendar automatically as they change. Overlaps are flagged for you.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
