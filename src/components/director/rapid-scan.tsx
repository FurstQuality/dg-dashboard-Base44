import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Info, UserPlus, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQrScanner } from "@/hooks/use-qr-scanner";
import { scanCheckIn, type ScanResult } from "@/lib/checkin.functions";
import { getKioskStation, kioskCheckInGuest, kioskCheckInPlayer } from "@/lib/kiosk.functions";
import { hapticTap } from "@/lib/haptics";

type Target = { kind: "tournament" | "league_event"; id: string };
type Pay = "cash" | "card" | "online" | "owed";
type Flash =
  | { tone: "ok" | "info" | "bad"; title: string; body: string }
  | null;

/**
 * Full-screen staff scanner. The camera stays on; each scan shows a large
 * result for a moment and returns to scanning. Unknown or unregistered
 * players open a quick walk-up sign-up, then scanning resumes.
 */
export function RapidScan({
  target,
  eventName,
  override,
  onClose,
  onChange,
}: {
  target: Target;
  eventName: string;
  override: boolean;
  onClose: () => void;
  onChange: () => void;
}) {
  const scan = useServerFn(scanCheckIn);
  const fetchStation = useServerFn(getKioskStation);
  const registerPlayer = useServerFn(kioskCheckInPlayer);
  const registerGuest = useServerFn(kioskCheckInGuest);
  const station = useQuery({
    queryKey: ["kiosk", "station", target.kind, target.id],
    queryFn: () => fetchStation({ data: target }),
    staleTime: 60_000,
  });
  const divisions = station.data?.divisions ?? [];
  const walkUps = station.data?.walkUpsAllowed !== false;

  const [flash, setFlash] = useState<Flash>(null);
  const [count, setCount] = useState(0);
  const [walkUp, setWalkUp] = useState<null | { playerId: string | null; name: string }>(null);
  const [division, setDivision] = useState<string | null>(null);
  const [pay, setPay] = useState<Pay>("cash");
  const [guestName, setGuestName] = useState("");
  const flashTimer = useRef(0);

  const show = useCallback((f: NonNullable<Flash>) => {
    setFlash(f);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  }, []);

  const handle = useCallback(
    (r: ScanResult) => {
      const name = r.player?.displayName ?? "Unknown code";
      if (r.outcome === "checked_in") {
        hapticTap([12, 40, 12]);
        setCount((c) => c + 1);
        show({ tone: "ok", title: name, body: r.row?.divisionName ? `Checked in · ${r.row.divisionName}` : "Checked in" });
        onChange();
      } else if (r.outcome === "already") {
        show({ tone: "info", title: name, body: r.message });
      } else if (r.outcome === "not_registered" && r.player && walkUps) {
        setWalkUp({ playerId: r.player.userId, name });
      } else if (!r.player && walkUps) {
        show({ tone: "bad", title: "Code not recognised", body: "Add them as a walk-up below." });
      } else {
        show({ tone: "bad", title: name, body: r.message });
      }
    },
    [show, onChange, walkUps],
  );

  const scanM = useMutation({
    mutationFn: (identifier: string) => scan({ data: { target, identifier, method: "scan", override } }),
    onSuccess: handle,
    onError: () => show({ tone: "bad", title: "Check-in didn't go through", body: "Check your signal and scan again." }),
  });

  const scanner = useQrScanner(
    (v) => {
      if (scanM.isPending || walkUp) return;
      scanM.mutate(v);
    },
    { onError: () => toast.error("We couldn't open the camera. Allow camera access and try again.") },
  );

  useEffect(() => {
    scanner.setActive(true);
    return () => scanner.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (divisions.length === 1) setDivision(divisions[0]!.id);
  }, [divisions]);

  const regM = useMutation({
    mutationFn: async () => {
      if (walkUp?.playerId) {
        const r = await registerPlayer({
          data: { target, playerId: walkUp.playerId, divisionId: division, paymentMethod: pay, override },
        });
        if (r.outcome === "blocked") throw new Error(r.message);
        return r.displayName;
      }
      const r = await registerGuest({
        data: { target, fullName: guestName.trim(), divisionId: division, paymentMethod: pay },
      });
      return r.displayName;
    },
    onSuccess: (name) => {
      hapticTap([12, 40, 12]);
      setCount((c) => c + 1);
      setWalkUp(null);
      setGuestName("");
      show({ tone: "ok", title: name, body: "Signed up and checked in" });
      onChange();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "That sign-up didn't go through."),
  });

  const tone =
    flash?.tone === "ok" ? "bg-primary text-primary-foreground" : flash?.tone === "info" ? "bg-card text-foreground" : "bg-destructive text-destructive-foreground";
  const FlashIcon = flash?.tone === "ok" ? CheckCircle2 : flash?.tone === "info" ? Info : XCircle;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background" role="dialog" aria-label="Scan players">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[12px] font-bold uppercase tracking-wide text-primary">Scan players</p>
          <h2 className="truncate text-lg font-bold">{eventName}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-muted-foreground">{count} this session</span>
          <Button size="icon" variant="outline" onClick={onClose} aria-label="Close scanner">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1 bg-muted">
        <video ref={scanner.videoRef} className="h-full w-full object-cover" muted playsInline />
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-56 w-56 rounded-3xl border-4 border-primary/80" />
        </div>
        {!scanner.active ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted-foreground">
            Camera is off.{" "}
            <Button size="sm" className="mt-2" onClick={() => scanner.setActive(true)}>Turn camera on</Button>
          </div>
        ) : null}
        {flash ? (
          <div aria-live="assertive" className={"absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl p-4 shadow-lg " + tone}>
            <FlashIcon className="h-8 w-8 shrink-0" />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{flash.title}</p>
              <p className="text-sm opacity-90">{flash.body}</p>
            </div>
          </div>
        ) : null}
      </div>

      {walkUp || !walkUps ? null : (
        <div className="border-t border-border p-3">
          <Button variant="outline" className="h-12 w-full" onClick={() => setWalkUp({ playerId: null, name: "" })}>
            <UserPlus className="mr-2 h-5 w-5" /> Add a walk-up
          </Button>
        </div>
      )}

      {walkUp ? (
        <div className="space-y-3 border-t border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              {walkUp.playerId ? `${walkUp.name} isn't signed up yet` : "Walk-up sign-up"}
            </p>
            <Button size="sm" variant="ghost" onClick={() => setWalkUp(null)}>Cancel</Button>
          </div>
          {!walkUp.playerId ? (
            <Input autoFocus placeholder="Player's full name" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="h-12 text-base" />
          ) : null}
          {divisions.length > 0 ? (
            <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Division">
              {divisions.map((d) => (
                <Button key={d.id} role="radio" aria-checked={division === d.id} size="sm" className="shrink-0" variant={division === d.id ? "default" : "outline"} onClick={() => setDivision(d.id)}>
                  {d.code ?? d.name}
                  {d.entryFeeCents ? ` · $${(d.entryFeeCents / 100).toFixed(0)}` : ""}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment">
            {(["cash", "card", "online", "owed"] as Pay[]).map((p) => (
              <Button key={p} role="radio" aria-checked={pay === p} size="sm" variant={pay === p ? "default" : "outline"} onClick={() => setPay(p)} className="capitalize">
                {p === "owed" ? "Pay later" : p}
              </Button>
            ))}
          </div>
          <Button
            className="h-12 w-full text-base"
            disabled={regM.isPending || (divisions.length > 0 && !division) || (!walkUp.playerId && guestName.trim().length < 2)}
            onClick={() => regM.mutate()}
          >
            {regM.isPending ? "Saving…" : "Sign up & check in"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
