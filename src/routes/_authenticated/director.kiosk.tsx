import { useQrScanner } from "@/hooks/use-qr-scanner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { DIRECTOR_POLL, directorKeys } from "@/lib/director-queries";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Lock,
  MonitorSmartphone,
  QrCode,
  Search,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCheckInStations, type CheckInStation } from "@/lib/checkin.functions";
import {
  getKioskStation,
  kioskCheckInGuest,
  kioskCheckInPlayer,
  kioskLookupPlayer,
  type KioskCheckInResult,
  type KioskMatch,
  type KioskStation,
} from "@/lib/kiosk.functions";
import {
  clearKioskSession,
  createPinSalt,
  hashPin,
  isValidPin,
  loadKioskSession,
  saveKioskSession,
  verifyPin,
  DEFAULT_KIOSK_OPTIONS,
  KIOSK_CONFIRM_MS,
  KIOSK_EXIT_HOLD_MS,
  KIOSK_IDLE_RESET_MS,
  PAYMENT_METHODS,
  type KioskOptions,
  type KioskPaymentMethod,
  type KioskSession,
} from "@/lib/kiosk";

export const Route = createFileRoute("/_authenticated/director/kiosk")({
  head: () => ({
    meta: [
      { title: "Event kiosk mode — DG Dashboard" },
      {
        name: "description",
        content:
          "Turn a tablet at tournament central into a self-serve check-in kiosk with QR scanning and a walk-up check-in form.",
      },
      { property: "og:title", content: "Event kiosk mode — DG Dashboard" },
      {
        property: "og:description",
        content: "Players scan their pass or fill out the form; the kiosk stays locked until you unlock it.",
      },
    ],
  }),
  component: KioskPage,
});

function stationKey(s: { kind: string; id: string }) {
  return `${s.kind}:${s.id}`;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/* Camera scanner                                                      */
/* ------------------------------------------------------------------ */

function useKioskScanner(enabled: boolean, onDetect: (value: string) => void) {
  const scanner = useQrScanner((v) => { if (enabled) onDetect(v); }, {
    facingMode: "user",
    repeatMs: 4000,
    onError: () => toast.error("We couldn't open the camera. Players can use the form instead."),
  });
  return scanner;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function KioskPage() {
  const [session, setSession] = useState<KioskSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(loadKioskSession());
    setReady(true);
  }, []);

  const start = useCallback((next: KioskSession) => {
    saveKioskSession(next);
    setSession(next);
  }, []);

  const stop = useCallback(() => {
    clearKioskSession();
    setSession(null);
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  if (!ready) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!session) return <KioskLaunch onStart={start} />;
  return <KioskSurface session={session} onExit={stop} />;
}

/* ------------------------------------------------------------------ */
/* Launch screen                                                       */
/* ------------------------------------------------------------------ */

function KioskLaunch({ onStart }: { onStart: (s: KioskSession) => void }) {
  const fetchStations = useServerFn(getCheckInStations);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [options, setOptions] = useState<KioskOptions>(DEFAULT_KIOSK_OPTIONS);
  const [starting, setStarting] = useState(false);

  const stationsQuery = useQuery<CheckInStation[]>({
    queryKey: directorKeys.checkinStations(),
    queryFn: () => fetchStations(),
  });
  const stations = stationsQuery.data ?? [];
  const selected = stations.find((s) => stationKey(s) === selectedKey) ?? stations[0] ?? null;

  async function handleStart() {
    if (!selected) return;
    if (!isValidPin(pin)) {
      toast.error("Set a 4-digit PIN so only you can unlock the tablet.");
      return;
    }
    if (pin !== pin2) {
      toast.error("The two PINs don't match.");
      return;
    }
    setStarting(true);
    try {
      const salt = createPinSalt();
      const pinHash = await hashPin(pin, salt);
      if (typeof document !== "undefined" && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.().catch(() => {});
      }
      onStart({
        target: { kind: selected.kind, id: selected.id },
        eventName: selected.name,
        pinHash,
        pinSalt: salt,
        options,
        startedAt: new Date().toISOString(),
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Event kiosk mode"
        description="Set a tablet on the tournament central table and let players check themselves in — scan a pass or fill out the form."
        primaryAction={
          <Button variant="outline" asChild>
            <Link to="/director/check-in">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Check-in desk
            </Link>
          </Button>
        }
      />

      {stationsQuery.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : stations.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          You don't have an event running right now. Once a tournament or league night is on the
          calendar, you can launch a kiosk for it here.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <section className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <Label className="mb-1.5 block">Event</Label>
              <Select
                value={selected ? stationKey(selected) : undefined}
                onValueChange={setSelectedKey}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick an event" />
                </SelectTrigger>
                <SelectContent>
                  {stations.map((s) => (
                    <SelectItem key={stationKey(s)} value={stationKey(s)}>
                      {s.name} · {new Date(s.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selected ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {selected.subtitle} ·{" "}
                  {selected.checkInOpen ? "Check-in is open" : (selected.checkInNote ?? "Check-in is closed")}
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="kiosk-pin" className="mb-1.5 block">
                  Unlock PIN
                </Label>
                <Input
                  id="kiosk-pin"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="4 digits"
                />
              </div>
              <div>
                <Label htmlFor="kiosk-pin2" className="mb-1.5 block">
                  Confirm PIN
                </Label>
                <Input
                  id="kiosk-pin2"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  placeholder="4 digits"
                  aria-describedby="kiosk-pin-match"
                />
                {/* Live match feedback so a mistyped PIN never locks the tablet. */}
                <p
                  id="kiosk-pin-match"
                  className={`mt-1.5 text-[12px] ${
                    pin2.length === 0
                      ? "text-muted-foreground"
                      : isValidPin(pin) && pin === pin2
                        ? "text-success"
                        : "text-destructive"
                  }`}
                >
                  {pin2.length === 0
                    ? "Re-enter the same 4 digits."
                    : isValidPin(pin) && pin === pin2
                      ? "PINs match."
                      : "PINs don't match yet."}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border border-border/70 bg-muted/30 p-4">
              <OptionRow
                label="Camera QR scanning"
                hint="Players hold their player pass up to the tablet camera."
                checked={options.cameraScanning}
                onChange={(v) => setOptions((o) => ({ ...o, cameraScanning: v }))}
              />
              <OptionRow
                label="Allow walk-ups"
                hint="Players who aren't on the roster can add themselves in a division. Pre-registration-only events always refuse walk-ups."
                checked={options.allowWalkUps}
                onChange={(v) => setOptions((o) => ({ ...o, allowWalkUps: v }))}
              />
              <OptionRow
                label="Allow players without an account"
                hint="Collects name, email, division and payment, and can email them a sign-up link."
                checked={options.allowGuests}
                onChange={(v) => setOptions((o) => ({ ...o, allowGuests: v }))}
              />
              <OptionRow
                label="Record payment at the kiosk"
                hint="Marks the entry fee paid when a player confirms cash, card, or paid online."
                checked={options.allowPaymentCapture}
                onChange={(v) => setOptions((o) => ({ ...o, allowPaymentCapture: v }))}
              />
            </div>

            <Button className="w-full" size="lg" disabled={starting || !selected} onClick={handleStart}>
              {starting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MonitorSmartphone className="mr-1.5 h-4 w-4" />
              )}
              Start kiosk mode
            </Button>
          </section>

          <aside className="space-y-3 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
            <h2 className="font-display text-lg font-semibold text-foreground">Before you hand it over</h2>
            <p>Stay signed in on this tablet — the kiosk checks players in as you.</p>
            <p>The kiosk hides app navigation and returns to the welcome screen between players.</p>
            <p>
              To leave kiosk mode, hold the lock button in the corner for 3 seconds, then enter your
              PIN.
            </p>
            <p>Guest entries show up on the check-in desk so you can reconcile them later.</p>
          </aside>
        </div>
      )}
    </div>
  );
}

function OptionRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Kiosk surface                                                       */
/* ------------------------------------------------------------------ */

type Stage =
  | { name: "idle" }
  | { name: "lookup" }
  | { name: "player"; match: KioskMatch }
  | { name: "guest" }
  | { name: "done"; title: string; detail: string; division: string | null; amountDue: number };

function KioskSurface({ session, onExit }: { session: KioskSession; onExit: () => void }) {
  const { options, target } = session;
  const fetchStation = useServerFn(getKioskStation);
  const lookup = useServerFn(kioskLookupPlayer);
  const checkIn = useServerFn(kioskCheckInPlayer);
  const guestCheckIn = useServerFn(kioskCheckInGuest);

  const [stage, setStage] = useState<Stage>({ name: "idle" });
  const [term, setTerm] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [pin, setPin] = useState("");
  // Unattended tablets get guessed at, so wrong PINs cost time: five misses
  // locks the pad for a minute, and it stays locked longer after that.
  const [pinMisses, setPinMisses] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const holdTimer = useRef<number | null>(null);

  const stationQuery = useQuery<KioskStation>({
    queryKey: ["kiosk", "station", target.kind, target.id],
    queryFn: () => fetchStation({ data: target }),
    staleTime: DIRECTOR_POLL.stations,
    refetchInterval: DIRECTOR_POLL.stations,
    refetchIntervalInBackground: false,
  });
  const station = stationQuery.data ?? null;

  const resetToIdle = useCallback(() => {
    setStage({ name: "idle" });
    setTerm("");
  }, []);

  // Return to the welcome screen after a stretch of inactivity.
  useEffect(() => {
    if (stage.name === "idle") return;
    const ms = stage.name === "done" ? KIOSK_CONFIRM_MS : KIOSK_IDLE_RESET_MS;
    const t = window.setTimeout(resetToIdle, ms);
    return () => window.clearTimeout(t);
  }, [stage, resetToIdle]);

  const lookupMutation = useMutation({
    mutationFn: (value: string) => lookup({ data: { target, term: value } }),
    onSuccess: (match) => {
      if (!match.found) {
        if (options.allowGuests) {
          toast.info("No account found — fill out the quick form.");
          setStage({ name: "guest" });
        } else {
          toast.error("We couldn't find that player. See the director.");
        }
        return;
      }
      setStage({ name: "player", match });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "That lookup didn't work. Try again."),
  });

  const scanner = useKioskScanner(options.cameraScanning, (value) => {
    if (lookupMutation.isPending) return;
    if (stage.name !== "idle" && stage.name !== "lookup") return;
    lookupMutation.mutate(value);
  });

  useEffect(() => {
    if (options.cameraScanning && scanner.supported) scanner.setActive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.cameraScanning, scanner.supported]);

  useEffect(() => {
    if (!lockedUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  function beginHold() {
    holdTimer.current = window.setTimeout(() => setExitOpen(true), KIOSK_EXIT_HOLD_MS);
  }
  function endHold() {
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  const lockSecondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  async function confirmExit() {
    if (lockSecondsLeft > 0) return;
    const ok = await verifyPin(pin, session.pinSalt, session.pinHash);
    if (!ok) {
      const misses = pinMisses + 1;
      setPinMisses(misses);
      setPin("");
      if (misses >= 5) {
        const waitMs = Math.min(15, misses - 4) * 60_000;
        setLockedUntil(Date.now() + waitMs);
        toast.error(`Too many wrong PINs. Try again in ${waitMs / 60_000} min.`);
      } else {
        toast.error(`That PIN doesn't match. ${5 - misses} tries left.`);
      }
      return;
    }
    setPinMisses(0);
    setLockedUntil(0);
    onExit();
  }

  const heading = station?.name ?? session.eventName;

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-5 py-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">
              Check-in kiosk
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              {station ? station.subtitle : "Loading event…"}
              {station && !station.checkInOpen
                ? ` · ${station.checkInNote ?? "Check-in is closed"}`
                : ""}
              {station && station.walkUpsAllowed === false
                ? " · Pre-registration only — walk-ups are turned away"
                : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Hold to unlock kiosk mode"
            className="rounded-full border border-border bg-card p-3 text-muted-foreground"
            onPointerDown={beginHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
          >
            <Lock className="h-5 w-5" />
          </button>
        </header>

        {stationQuery.isLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : stationQuery.isError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-6 text-sm">
            We can't load this event on this tablet. Hold the lock button to exit kiosk mode.
          </div>
        ) : station ? (
          <>
            {stage.name === "idle" ? (
              <IdleScreen
                scanner={scanner}
                cameraEnabled={options.cameraScanning}
                onManual={() => setStage({ name: "lookup" })}
                onGuest={options.allowGuests ? () => setStage({ name: "guest" }) : null}
              />
            ) : null}

            {stage.name === "lookup" ? (
              <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-2xl font-semibold">Find your name</h2>
                <p className="text-sm text-muted-foreground">
                  Type your player code, name, email, or PDGA number.
                </p>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (term.trim().length >= 2) lookupMutation.mutate(term.trim());
                  }}
                >
                  <Input
                    autoFocus
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="e.g. Casey Jones or 123456"
                    className="h-14 text-lg"
                  />
                  <Button type="submit" size="lg" className="h-14" disabled={lookupMutation.isPending}>
                    {lookupMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Search className="h-5 w-5" />
                    )}
                  </Button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {options.allowGuests ? (
                    <Button variant="outline" size="lg" onClick={() => setStage({ name: "guest" })}>
                      <UserPlus className="mr-1.5 h-4 w-4" /> I don't have an account
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="lg" onClick={resetToIdle}>
                    Cancel
                  </Button>
                </div>
              </section>
            ) : null}

            {stage.name === "player" ? (
              <PlayerConfirm
                station={station}
                match={stage.match}
                options={options}
                pending={false}
                onCancel={resetToIdle}
                onSubmit={async (payload) => {
                  const res: KioskCheckInResult = await checkIn({
                    data: {
                      target,
                      playerId: stage.match.userId!,
                      divisionId: payload.divisionId,
                      paymentMethod: payload.paymentMethod,
                      saveDefaultDivision: true,
                      allowWalkUps: options.allowWalkUps,
                      allowPaymentCapture: options.allowPaymentCapture,
                      override: false,
                    },
                  });
                  if (res.outcome === "blocked") {
                    toast.error(res.message);
                    return;
                  }
                  setStage({
                    name: "done",
                    title: res.displayName,
                    detail: res.message,
                    division: res.divisionName,
                    amountDue: res.amountDueCents,
                  });
                }}
              />
            ) : null}

            {stage.name === "guest" ? (
              <GuestForm
                station={station}
                options={options}
                onCancel={resetToIdle}
                onSubmit={async (payload) => {
                  const res = await guestCheckIn({
                    data: {
                      target,
                      fullName: payload.fullName,
                      email: payload.email || null,
                      phone: payload.phone || null,
                      pdgaNumber: payload.pdgaNumber || null,
                      divisionId: payload.divisionId,
                      paymentMethod: payload.paymentMethod,
                      signupOptIn: payload.signupOptIn,
                      allowPaymentCapture: options.allowPaymentCapture,
                    },
                  });
                  setStage({
                    name: "done",
                    title: res.displayName,
                    detail: res.inviteSent
                      ? "You're checked in — check your email for your sign-up link."
                      : "You're checked in. See the director if anything looks off.",
                    division: res.divisionName,
                    amountDue: res.amountDueCents,
                  });
                }}
              />
            ) : null}

            {stage.name === "done" ? (
              <section className="space-y-3 rounded-2xl border border-primary/40 bg-primary/10 p-8 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
                <h2 className="font-display text-3xl font-bold">{stage.title} is checked in</h2>
                {stage.division ? <Badge className="text-base">{stage.division}</Badge> : null}
                <p className="text-base">{stage.detail}</p>
                {stage.amountDue > 0 ? (
                  <p className="text-base font-semibold text-warning">
                    Entry fee due: {money(stage.amountDue)} — see the director.
                  </p>
                ) : null}
                <Button size="lg" onClick={resetToIdle}>
                  Done
                </Button>
              </section>
            ) : null}
          </>
        ) : null}

        <footer className="mt-auto pt-4 text-center text-xs text-muted-foreground">
          DG Dashboard kiosk · players only. Staff: hold the lock button for 3 seconds.
        </footer>
      </div>

      {exitOpen ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-background/90 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold">Unlock kiosk mode</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel"
                onClick={() => {
                  setExitOpen(false);
                  setPin("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the PIN you set when you started this kiosk.
            </p>
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={pin}
              disabled={lockSecondsLeft > 0}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-14 text-center text-2xl tracking-[0.5em]"
              placeholder="••••"
            />
            {lockSecondsLeft > 0 ? (
              <p className="text-sm text-destructive">
                Locked after too many wrong PINs. Try again in {lockSecondsLeft}s.
              </p>
            ) : null}
            <Button
              className="w-full"
              size="lg"
              onClick={confirmExit}
              disabled={lockSecondsLeft > 0 || pin.length !== 4}
            >
              Unlock and exit
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IdleScreen({
  scanner,
  cameraEnabled,
  onManual,
  onGuest,
}: {
  scanner: ReturnType<typeof useKioskScanner>;
  cameraEnabled: boolean;
  onManual: () => void;
  onGuest: (() => void) | null;
}) {
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6 text-center">
      <QrCode className="mx-auto h-12 w-12 text-primary" />
      <h2 className="font-display text-3xl font-bold">Scan your player pass</h2>
      <p className="text-base text-muted-foreground">
        Open your player pass in DG Dashboard and hold it up to the tablet. No pass? Tap the button
        below.
      </p>

      {cameraEnabled && scanner.supported ? (
        <div className="mx-auto max-w-md overflow-hidden rounded-xl bg-black/80">
          <video
            ref={scanner.videoRef}
            className={scanner.active ? "h-56 w-full object-cover" : "hidden"}
            muted
            playsInline
          />
          {!scanner.active ? (
            <div className="grid h-56 place-items-center text-sm text-white/70">Camera is off</div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Camera scanning is off on this tablet — use the check-in form below.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {cameraEnabled && scanner.supported ? (
          <Button variant="outline" size="lg" onClick={() => scanner.setActive(!scanner.active)}>
            {scanner.active ? (
              <>
                <CameraOff className="mr-1.5 h-4 w-4" /> Pause camera
              </>
            ) : (
              <>
                <Camera className="mr-1.5 h-4 w-4" /> Start camera
              </>
            )}
          </Button>
        ) : null}
        <Button size="lg" onClick={onManual}>
          <Search className="mr-1.5 h-4 w-4" /> Check in without a pass
        </Button>
        {onGuest ? (
          <Button variant="outline" size="lg" onClick={onGuest}>
            <UserPlus className="mr-1.5 h-4 w-4" /> First time here
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PaymentPicker({
  value,
  onChange,
  feeCents,
}: {
  value: KioskPaymentMethod;
  onChange: (v: KioskPaymentMethod) => void;
  feeCents: number;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">
        Entry fee {feeCents > 0 ? `· ${money(feeCents)}` : ""}
      </Label>
      <div className="grid gap-2 sm:grid-cols-2">
        {PAYMENT_METHODS.map((m) => (
          <Button
            key={m.value}
            type="button"
            variant={value === m.value ? "default" : "outline"}
            className="h-12 justify-start"
            onClick={() => onChange(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

function PlayerConfirm({
  station,
  match,
  options,
  pending,
  onCancel,
  onSubmit,
}: {
  station: KioskStation;
  match: KioskMatch;
  options: KioskOptions;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (payload: { divisionId: string | null; paymentMethod: KioskPaymentMethod }) => Promise<void>;
}) {
  const [divisionId, setDivisionId] = useState<string | null>(match.divisionId);
  const [method, setMethod] = useState<KioskPaymentMethod>(
    match.paymentStatus === "paid" || match.paymentStatus === "waived" ? "online" : "cash",
  );
  const [busy, setBusy] = useState(false);

  const fee = useMemo(
    () => station.divisions.find((d) => d.id === divisionId)?.entryFeeCents ?? 0,
    [divisionId, station.divisions],
  );

  const needsDivision = station.divisions.length > 0;

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Welcome, {match.displayName}</h2>
        <p className="text-sm text-muted-foreground">
          {match.alreadyCheckedIn ? "You're already checked in — confirm your details anyway." : match.message}
        </p>
      </div>

      {needsDivision ? (
        <div>
          <Label className="mb-1.5 block">Confirm your division</Label>
          <Select value={divisionId ?? undefined} onValueChange={(v) => setDivisionId(v)}>
            <SelectTrigger className="h-14 text-lg">
              <SelectValue placeholder="Pick your division" />
            </SelectTrigger>
            <SelectContent>
              {station.divisions.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  {d.entryFeeCents > 0 ? ` · ${money(d.entryFeeCents)}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> We'll remember this division for your next event.
          </p>
        </div>
      ) : null}

      {options.allowPaymentCapture ? (
        <PaymentPicker value={method} onChange={setMethod} feeCents={fee} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          className="h-14 flex-1 text-lg"
          disabled={pending || busy || (needsDivision && !divisionId)}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit({ divisionId, paymentMethod: method });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "That check-in didn't go through.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : null}
          Check me in
        </Button>
        <Button variant="ghost" size="lg" className="h-14" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

function GuestForm({
  station,
  options,
  onCancel,
  onSubmit,
}: {
  station: KioskStation;
  options: KioskOptions;
  onCancel: () => void;
  onSubmit: (payload: {
    fullName: string;
    email: string;
    phone: string;
    pdgaNumber: string;
    divisionId: string | null;
    paymentMethod: KioskPaymentMethod;
    signupOptIn: boolean;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [pdgaNumber, setPdgaNumber] = useState("");
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [method, setMethod] = useState<KioskPaymentMethod>("cash");
  const [signupOptIn, setSignupOptIn] = useState(false);
  const [busy, setBusy] = useState(false);

  const fee = station.divisions.find((d) => d.id === divisionId)?.entryFeeCents ?? 0;
  const needsDivision = station.divisions.length > 0;
  const valid = fullName.trim().length >= 2 && (!needsDivision || !!divisionId);

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="font-display text-2xl font-semibold">Check in for the first time</h2>
        <p className="text-sm text-muted-foreground">
          Give us the basics and you're on the board. The director sees this right away.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="guest-name" className="mb-1.5 block">
            Full name
          </Label>
          <Input
            id="guest-name"
            autoFocus
            value={fullName}
            maxLength={80}
            onChange={(e) => setFullName(e.target.value)}
            className="h-14 text-lg"
          />
        </div>
        <div>
          <Label htmlFor="guest-email" className="mb-1.5 block">
            Email
          </Label>
          <Input
            id="guest-email"
            type="email"
            inputMode="email"
            maxLength={160}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12"
          />
        </div>
        <div>
          <Label htmlFor="guest-phone" className="mb-1.5 block">
            Phone (optional)
          </Label>
          <Input
            id="guest-phone"
            inputMode="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12"
          />
        </div>
        <div>
          <Label htmlFor="guest-pdga" className="mb-1.5 block">
            PDGA number (optional)
          </Label>
          <Input
            id="guest-pdga"
            inputMode="numeric"
            maxLength={12}
            value={pdgaNumber}
            onChange={(e) => setPdgaNumber(e.target.value.replace(/\D/g, ""))}
            className="h-12"
          />
        </div>
        {needsDivision ? (
          <div>
            <Label className="mb-1.5 block">Division</Label>
            <Select value={divisionId ?? undefined} onValueChange={(v) => setDivisionId(v)}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Pick your division" />
              </SelectTrigger>
              <SelectContent>
                {station.divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.entryFeeCents > 0 ? ` · ${money(d.entryFeeCents)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

      {options.allowPaymentCapture ? (
        <PaymentPicker value={method} onChange={setMethod} feeCents={fee} />
      ) : null}

      <label className="flex items-start gap-3 rounded-lg border border-border/70 bg-muted/30 p-4">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 accent-primary"
          checked={signupOptIn}
          onChange={(e) => setSignupOptIn(e.target.checked)}
          disabled={!email.trim()}
        />
        <span className="text-sm">
          Want an account so your scores and stats are tracked? We'll email you a sign-up link.
          {!email.trim() ? (
            <span className="block text-xs text-muted-foreground">Add your email above first.</span>
          ) : null}
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          className="h-14 flex-1 text-lg"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSubmit({
                fullName: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
                pdgaNumber: pdgaNumber.trim(),
                divisionId,
                paymentMethod: method,
                signupOptIn: signupOptIn && !!email.trim(),
              });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "That check-in didn't go through.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="mr-1.5 h-5 w-5 animate-spin" /> : null}
          Check me in
        </Button>
        <Button variant="ghost" size="lg" className="h-14" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
